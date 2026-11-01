import * as LocationNext from 'expo-location/next';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { SystemClock } from '../clock/SystemClock';
import { AsyncStorageDestinationRepository } from '../storage/AsyncStorageDestinationRepository';
import { haversineDistanceM } from '../../domain/distance';
import {
  buildGuidanceNotificationBody,
  GUIDANCE_NOTIFICATION_TITLE,
} from '../../domain/guidanceNotification';
import type { GuidanceSessionInfo, GuidanceSessionPort } from '../../ports/guidanceSession';

/** バックグラウンド位置更新のタスク名（`defineLocationTask` と `LocationUpdatesHandle` で共用）。 */
export const GUIDANCE_TASK_NAME = 'yoridorimidori-guidance';

/** スリープ防止のタグ。 */
const KEEP_AWAKE_TAG = 'yoridorimidori-guidance';

/** 通知のアクセントカラー（ブランド緑 #1F5D4C）。 */
const NOTIFICATION_COLOR = 0x1f5d4c;

/** 通知本文の更新間隔（ms）。位置更新のたびに通知を書き換えない。 */
const NOTIFICATION_UPDATE_INTERVAL_MS = 5_000;

/** バックグラウンドタスク側の最終通知更新時刻（ms）。 */
let lastTaskNotificationAtMs = 0;

/** 通知（前景サービス）を現在の情報で（再）表示する。 */
async function ensureNotification(info: GuidanceSessionInfo): Promise<void> {
  await LocationNext.Location.ensureBackgroundSessionStarted({
    notificationTitle: GUIDANCE_NOTIFICATION_TITLE,
    notificationBody: buildGuidanceNotificationBody(info),
    notificationColor: NOTIFICATION_COLOR,
    stopOnTaskRemoved: true,
  });
}

/** バックグラウンドタスクから、保存済みの目的地と最新位置で通知を更新する。 */
async function updateNotificationFromPosition(position: LocationNext.Position): Promise<void> {
  const now = Date.now();
  if (now - lastTaskNotificationAtMs < NOTIFICATION_UPDATE_INTERVAL_MS) {
    return;
  }
  lastTaskNotificationAtMs = now;
  try {
    const repository = new AsyncStorageDestinationRepository(
      new SystemClock(),
      () => `guidance-task-${Date.now()}`,
    );
    const [selection, destinations] = await Promise.all([
      repository.readSelection(),
      repository.list(),
    ]);
    const selected =
      selection === null
        ? undefined
        : destinations.find((destination) => destination.id === selection);
    const distanceM =
      selected === undefined
        ? null
        : haversineDistanceM(
            {
              latitude: position.coordinates.latitude,
              longitude: position.coordinates.longitude,
            },
            selected.point,
          );
    await ensureNotification({
      destinationName: selected?.name ?? null,
      distanceM,
    });
  } catch {
    // 通知更新の失敗は無視（案内そのものは継続する）。
  }
}

// タスク定義はモジュールのグローバルスコープで 1 度だけ行う（expo-task-manager の要件）。
LocationNext.defineLocationTask({
  taskName: GUIDANCE_TASK_NAME,
  onPosition: (position) => {
    void updateNotificationFromPosition(position);
  },
  onError: () => undefined,
});

/**
 * Expo によるバックグラウンド案内の実装（2026-11-01）。
 *
 * - **前景サービス**: `ensureBackgroundSessionStarted` で通知付きの foreground service を開始し、
 *   アプリをバックグラウンドにしても位置更新を続ける。`stopOnTaskRemoved: true` により
 *   アプリを履歴から消す（終了する）とサービスも停止する。
 * - **通知**: タイトル「寄鳥美鳥地」・本文「目的地「東京駅」まで 1.20 km」。
 *   前景サービスが既に動いているときの `ensureBackgroundSessionStarted` 呼び出しは
 *   通知の再表示（本文更新）になる。
 * - **バックグラウンド位置**: `LocationUpdatesHandle` を `OTHER_NAVIGATION` プロファイルで開始。
 *   タスクは保存済みの目的地から距離を計算し、通知を更新する。
 * - **スリープ防止**: 案内中は `expo-keep-awake` で画面をスリープさせない。
 * - 権限が無い・失敗した場合も throw せず、前景の案内だけを継続する。
 */
export class ExpoGuidanceSession implements GuidanceSessionPort {
  private handle: LocationNext.LocationUpdatesHandle | null = null;
  private active = false;
  private lastBody: string | null = null;
  private lastUpdateAtMs = 0;

  async start(info: GuidanceSessionInfo): Promise<void> {
    if (this.active) {
      this.update(info, true);
      return;
    }
    this.active = true;

    // スリープ防止（案内中は画面を点灯したままにする）。
    try {
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } catch {
      // 失敗しても案内は継続する。
    }

    try {
      const foreground = await LocationNext.Location.getForegroundPermissions();
      if (!foreground.granted) {
        return;
      }

      // Android 13+ の通知権限（拒否されても通知が出ないだけでサービスは動く）。
      try {
        await LocationNext.Location.requestNotificationPermissions();
      } catch {
        // 通知権限が無くても続行。
      }

      // バックグラウンド位置権限（ユーザー操作起点。拒否時は前景のみ）。
      let background = await LocationNext.Location.getBackgroundPermissions();
      if (!background.granted) {
        try {
          background = await LocationNext.Location.requestBackgroundPermissions();
        } catch {
          // 要求できない場合は前景のみで続行。
        }
      }

      await ensureNotification(info);
      this.lastBody = buildGuidanceNotificationBody(info);
      this.lastUpdateAtMs = Date.now();

      if (background.granted) {
        const handle = new LocationNext.LocationUpdatesHandle(
          GUIDANCE_TASK_NAME,
        ).withProfile(LocationNext.LocationProfile.OTHER_NAVIGATION);
        await handle.start();
        this.handle = handle;
      }
    } catch {
      // 通知・バックグラウンドが使えなくても前景の案内は継続する。
    }
  }

  update(info: GuidanceSessionInfo, force = false): void {
    if (!this.active) {
      return;
    }
    const body = buildGuidanceNotificationBody(info);
    const now = Date.now();
    if (
      !force &&
      (body === this.lastBody || now - this.lastUpdateAtMs < NOTIFICATION_UPDATE_INTERVAL_MS)
    ) {
      return;
    }
    this.lastBody = body;
    this.lastUpdateAtMs = now;
    void ensureNotification(info).catch(() => undefined);
  }

  async stop(): Promise<void> {
    this.active = false;
    this.lastBody = null;
    this.lastUpdateAtMs = 0;

    const handle = this.handle;
    this.handle = null;
    if (handle !== null) {
      try {
        await handle.stop();
      } catch {
        // 登録解除の失敗は無視。
      }
    }
    try {
      await LocationNext.Location.stopBackgroundSession();
    } catch {
      // サービスが動いていない場合など。
    }
    try {
      await deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {
      // スリープ防止の解除失敗は無視。
    }
  }
}

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { HEADING_DISPATCH_MIN_INTERVAL_MS, type Thresholds } from '../domain/constants';
import { elapsedMs } from '../domain/freshness';
import { DEMO_PRESETS } from '../domain/presets';
import type { ScenarioId } from '../domain/scenario';
import type {
  Destination,
  DestinationInput,
  HeadingFix,
  SampleLogEntry,
  SensorFix,
} from '../domain/types';
import { validateDestinationInput } from '../domain/validation';
import type { Clock } from '../ports/clock';
import type { PermissionOutcome, ProviderError, Unsubscribe } from '../ports/common';
import type { DestinationRepository } from '../ports/destinationRepository';
import type { HeadingProvider } from '../ports/heading';
import type { LocationProvider } from '../ports/location';
import type { SampleLogRepository } from '../ports/sampleLogRepository';
import { navReducer } from './navReducer';
import { createInitialNavAppState, type NavAppState } from './navState';
import { selectNavState } from './selectors';
import { useTicker } from './useTicker';

/**
 * `useNavApp` の依存。**ポート型のみ**（`adapters` を import しない＝FR-12）。
 * 具体実装の生成と注入は `App.tsx`（T25）だけが行う。
 */
export interface NavAppDeps {
  readonly clock: Clock;
  readonly locationProvider: LocationProvider;
  readonly headingProvider: HeadingProvider;
  /**
   * Mock モード時に差し替える位置プロバイダ（開発ビルドで App が注入）。
   * 未指定なら Mock モードでも実プロバイダを使う（切替は無効）。
   */
  readonly mockLocationProvider?: LocationProvider;
  /** Mock モード時に差し替える方位プロバイダ。 */
  readonly mockHeadingProvider?: HeadingProvider;
  readonly destinationRepository: DestinationRepository;
  readonly sampleLogRepository: SampleLogRepository;
  readonly thresholds: Thresholds;
  readonly devToolsVisible: boolean;
}

/** 画面が呼び出す操作。表示ロジック・計算は持たない（状態と永続化の仲介のみ）。 */
export interface NavAppActions {
  selectDestination(id: string | null): void;
  /** 追加。検証エラー・保存失敗は `false`（UI は失敗表示）。 */
  addDestination(input: DestinationInput): Promise<boolean>;
  updateDestination(id: string, input: DestinationInput): Promise<boolean>;
  removeDestination(id: string): Promise<void>;
  /** 位置が未取得/途絶なら `false`（UI はボタンを無効化して理由表示）。 */
  useCurrentLocationAsDestination(name?: string): Promise<boolean>;
  toggleMockMode(): void;
  selectScenario(id: ScenarioId | null): void;
  /** お気に入りの切り替え（☆）。永続化失敗は警告のみでアプリは継続する。 */
  setFavorite(id: string, favorite: boolean): Promise<void>;
  /** 現在地の再取得（購読を張り直す。権限が無ければ何もしない）。 */
  retryLocation(): void;
  retryPermission(): Promise<void>;
  /** 文言表示のみ（設定アプリ遷移 API は使わない＝§18-8）。 */
  showSettingsHint(): void;
}

/** `useNavApp` の戻り値。`state` は実行時状態、`nav` は表示用の派生値。 */
export interface NavApp {
  readonly state: NavAppState;
  readonly nav: ReturnType<typeof selectNavState>;
  readonly actions: NavAppActions;
}

/** 到達不能だが防御的なフォールバック文言（UI へそのまま出す短い説明）。 */
const FALLBACK_ERROR_MESSAGE = '処理中にエラーが発生しました';
/** 「現在地を目的地に」で名前未指定のときの既定名。 */
const CURRENT_LOCATION_DEFAULT_NAME = '現在地';

/**
 * 起動ロード・権限フロー・購読ライフサイクル・ティッカー・サンプル記録・目的地操作・
 * Mock 切替を 1 本に集約するフック。§7.4 / §2.4 / §11.5。
 *
 * - `deps` はポート型のみ。Mock コントローラは知らない（開発画面が props で直接受ける）。
 * - 購読は `disposed` フラグで race を防ぎ、解決直後の解除を行う（二重購読の禁止）。
 * - 方位の dispatch は `HEADING_DISPATCH_MIN_INTERVAL_MS` で間引く（`useRef` の最終時刻）。
 * - サンプルは位置フィックスのみ記録し、経過時間は記録時点で確定させる。
 */
export function useNavApp(deps: NavAppDeps): NavApp {
  const {
    clock,
    locationProvider,
    headingProvider,
    mockLocationProvider,
    mockHeadingProvider,
    destinationRepository,
    sampleLogRepository,
    thresholds,
    devToolsVisible,
  } = deps;

  const [state, dispatch] = useReducer(
    navReducer,
    undefined,
    () => createInitialNavAppState(devToolsVisible, thresholds),
  );

  /** 非同期コールバックから最新 state を読むための参照（依存配列を肥大化させない）。 */
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /** アンマウント後の dispatch を避ける。 */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** 直近の方位フィックス（サンプル記録用）。 */
  const latestHeadingRef = useRef<HeadingFix | null>(null);
  /** 方位 dispatch の間引き用（最後に dispatch した単調時刻）。 */
  const lastHeadingDispatchMsRef = useRef<number | null>(null);
  /** 起動ロードを 1 回だけ実行する。 */
  const bootStartedRef = useRef(false);
  /** 位置購読の張り直し用カウンタ（`retryLocation()` で増やす）。 */
  const [subscriptionNonce, setSubscriptionNonce] = useState(0);

  const dispatchError = useCallback(
    (error: unknown) => {
      dispatch({
        type: 'provider/error',
        error: toProviderError(error, clock.nowMonotonicMs()),
      });
    },
    [clock],
  );

  const dispatchStorageWarning = useCallback((message: string) => {
    dispatch({ type: 'storage/warning', message });
  }, []);

  // ── 起動ロード（目的地・選択・サンプル → 空ならプリセット投入）─────────────
  useEffect(() => {
    if (bootStartedRef.current) {
      return;
    }
    bootStartedRef.current = true;
    let disposed = false;

    void (async () => {
      try {
        const [destinations, selection, samples] = await Promise.all([
          destinationRepository.list(),
          destinationRepository.readSelection(),
          sampleLogRepository.load(),
        ]);
        if (disposed) {
          return;
        }
        dispatch({ type: 'samples/loaded', samples });

        if (destinations.length > 0) {
          dispatch({
            type: 'boot/completed',
            destinations,
            selectedDestinationId: selection,
            nowMonotonicMs: clock.nowMonotonicMs(),
          });
          return;
        }

        // 初回起動（空）はプリセットを投入する（D-07）。
        const seeded: Destination[] = [];
        for (const preset of DEMO_PRESETS) {
          try {
            const created = await destinationRepository.add({
              name: preset.name,
              point: preset.point,
              origin: 'preset',
            });
            seeded.push(created);
          } catch {
            if (disposed) {
              return;
            }
            dispatchStorageWarning('プリセット目的地の保存に失敗しました');
          }
        }
        if (disposed) {
          return;
        }

        const first = seeded[0];
        let selectedId: string | null = null;
        if (first !== undefined) {
          selectedId = first.id;
          try {
            await destinationRepository.writeSelection(first.id);
          } catch {
            dispatchStorageWarning('目的地の選択状態を保存できませんでした');
          }
        }
        if (disposed) {
          return;
        }
        dispatch({
          type: 'boot/completed',
          destinations: seeded,
          selectedDestinationId: selectedId,
          nowMonotonicMs: clock.nowMonotonicMs(),
        });
      } catch (error) {
        if (disposed) {
          return;
        }
        dispatchError(error);
        // 起動失敗でもアプリは継続する（目的地なしで表示）。§11.1
        dispatch({
          type: 'boot/completed',
          destinations: [],
          selectedDestinationId: null,
          nowMonotonicMs: clock.nowMonotonicMs(),
        });
      }
    })();

    return () => {
      disposed = true;
    };
  }, [
    clock,
    destinationRepository,
    sampleLogRepository,
    dispatchError,
    dispatchStorageWarning,
  ]);

  // ── 権限フロー（起動時 1 回。再要求はユーザー操作起点のみ）───────────────
  useEffect(() => {
    if (!state.booted) {
      return;
    }
    let disposed = false;

    const run = async () => {
      const current = await locationProvider.getPermissionState().catch(() => null);
      if (disposed) {
        return;
      }
      if (current === null) {
        return;
      }
      dispatch({ type: 'permission/changed', permission: current });

      if (current.status !== 'undetermined' || !current.canAskAgain) {
        if (current.status === 'granted') {
          await dispatchLastKnown(disposed);
        }
        return;
      }

      const requested = await locationProvider.requestPermission().catch(() => null);
      if (disposed || requested === null) {
        return;
      }
      dispatch({ type: 'permission/changed', permission: requested });
      if (requested.status === 'granted') {
        await dispatchLastKnown(disposed);
      }
    };

    const dispatchLastKnown = async (isDisposed: boolean) => {
      const lastKnown = await locationProvider.getLastKnown().catch(() => null);
      if (isDisposed || lastKnown === null) {
        return;
      }
      dispatch({ type: 'sensor/location', fix: lastKnown });
    };

    void run().catch((error: unknown) => {
      if (!disposed) {
        dispatchError(error);
      }
    });

    return () => {
      disposed = true;
    };
  }, [state.booted, locationProvider, clock, dispatchError]);

  // ── 購読ライフサイクル（権限許可 or Mock モードで開始）─────────────────────
  useEffect(() => {
    if (!state.booted) {
      return;
    }
    const useMock =
      state.mockMode && mockLocationProvider !== undefined && mockHeadingProvider !== undefined;
    const permissionStatus = state.permission?.status ?? null;
    if (!useMock && permissionStatus !== 'granted') {
      return;
    }

    let disposed = false;
    let unsubLocation: Unsubscribe | null = null;
    let unsubHeading: Unsubscribe | null = null;

    const activeLocation =
      useMock && mockLocationProvider !== undefined ? mockLocationProvider : locationProvider;
    const activeHeading =
      useMock && mockHeadingProvider !== undefined ? mockHeadingProvider : headingProvider;
    lastHeadingDispatchMsRef.current = null;

    const onProviderError = (error: ProviderError) => {
      if (disposed) {
        return;
      }
      dispatch({ type: 'provider/error', error });
      if (error.code === 'permission-denied') {
        // 権限拒否は permission にも反映する（§7.4）。
        void locationProvider
          .getPermissionState()
          .then((permission) => {
            if (!disposed) {
              dispatch({ type: 'permission/changed', permission });
            }
          })
          .catch(() => undefined);
      }
    };

    const recordSample = (fix: SensorFix) => {
      const heading = latestHeadingRef.current;
      const nowMonotonicMs = clock.nowMonotonicMs();
      const entry: SampleLogEntry = {
        recordedAtEpochMs: fix.receivedAtEpochMs,
        latitude: fix.point.latitude,
        longitude: fix.point.longitude,
        gpsAccuracyM: fix.accuracyM,
        headingDeg: heading?.headingDeg ?? null,
        headingReference: heading?.reference ?? 'unknown',
        headingAccuracy: heading?.accuracy ?? null,
        locationAgeMs: elapsedMs(nowMonotonicMs, fix.receivedAtMonotonicMs),
        headingAgeMs:
          heading === null ? null : elapsedMs(nowMonotonicMs, heading.receivedAtMonotonicMs),
      };
      dispatch({ type: 'samples/appended', entry });
      void sampleLogRepository.append(entry).catch(() => {
        if (!disposed) {
          dispatchStorageWarning('サンプルの保存に失敗しました');
        }
      });
    };

    activeLocation
      .start(
        (fix) => {
          if (disposed) {
            return;
          }
          dispatch({ type: 'sensor/location', fix });
          recordSample(fix);
        },
        onProviderError,
      )
      .then((unsubscribe) => {
        if (disposed) {
          // 解決前アンマウント/再購読: 解決直後に解除する（race ガード §11.5）。
          unsubscribe();
          return;
        }
        unsubLocation = unsubscribe;
      })
      .catch(dispatchError);

    const onHeadingFix = (fix: HeadingFix) => {
      if (disposed) {
        return;
      }
      latestHeadingRef.current = fix;
      const nowMonotonicMs = clock.nowMonotonicMs();
      const lastDispatchedMs = lastHeadingDispatchMsRef.current;
      if (
        lastDispatchedMs !== null &&
        nowMonotonicMs - lastDispatchedMs < HEADING_DISPATCH_MIN_INTERVAL_MS
      ) {
        return;
      }
      lastHeadingDispatchMsRef.current = nowMonotonicMs;
      dispatch({ type: 'sensor/heading', fix });
    };

    activeHeading
      .isAvailable()
      .then((available) => {
        if (disposed) {
          return null;
        }
        if (!available) {
          dispatch({ type: 'heading/unavailable' });
          dispatch({
            type: 'provider/error',
            error: {
              code: 'unsupported-platform',
              message: 'この環境では方位を取得できません',
              atMonotonicMs: clock.nowMonotonicMs(),
            },
          });
          return null;
        }
        return activeHeading.start(onHeadingFix, onProviderError);
      })
      .then((unsubscribe) => {
        if (unsubscribe === null || unsubscribe === undefined) {
          return;
        }
        if (disposed) {
          unsubscribe();
          return;
        }
        unsubHeading = unsubscribe;
      })
      .catch(dispatchError);

    return () => {
      disposed = true;
      unsubLocation?.();
      unsubHeading?.();
    };
  }, [
    state.booted,
    state.mockMode,
    state.permission?.status,
    subscriptionNonce,
    locationProvider,
    headingProvider,
    mockLocationProvider,
    mockHeadingProvider,
    clock,
    sampleLogRepository,
    dispatchError,
    dispatchStorageWarning,
  ]);

  // ── 1 秒ティッカー（鮮度表示の更新）────────────────────────────────────────
  const dispatchTick = useCallback(() => {
    dispatch({ type: 'tick', nowMonotonicMs: clock.nowMonotonicMs() });
  }, [clock]);
  useTicker(state.booted, dispatchTick);

  // ── アンマウント時に保留中のサンプル書込を確定させる ───────────────────────
  useEffect(() => {
    const repository = sampleLogRepository;
    return () => {
      void repository.flush().catch(() => undefined);
    };
  }, [sampleLogRepository]);

  // ── 操作（永続化・評価はここに集約。UI は戻り値だけを見る）─────────────────
  const persistSelection = useCallback(
    (id: string | null) => {
      void destinationRepository.writeSelection(id).catch(() => {
        dispatchStorageWarning('目的地の選択状態を保存できませんでした');
      });
    },
    [destinationRepository, dispatchStorageWarning],
  );

  const performAdd = useCallback(
    async (input: DestinationInput, select: boolean): Promise<boolean> => {
      const validated = validateDestinationInput({ name: input.name, point: input.point });
      if (!validated.ok || validated.value === undefined) {
        return false;
      }
      try {
        const created = await destinationRepository.add({
          name: validated.value.name,
          point: validated.value.point,
          origin: input.origin,
        });
        if (mountedRef.current) {
          dispatch({
            type: 'destination/added',
            destination: created,
            select,
          });
        }
        return true;
      } catch {
        dispatchStorageWarning('目的地の保存に失敗しました');
        return false;
      }
    },
    [destinationRepository, dispatchStorageWarning],
  );

  const actions = useMemo<NavAppActions>(
    () => ({
      selectDestination(id: string | null): void {
        dispatch({ type: 'destination/selected', id });
        persistSelection(id);
        if (id !== null) {
          const target = stateRef.current.destinations.find(
            (destination) => destination.id === id,
          );
          if (target !== undefined) {
            // 「最近使った場所」の並び替え用（失敗しても操作は継続）。
            void destinationRepository.markUsed(id).catch(() => undefined);
            dispatch({
              type: 'destination/updated',
              destination: { ...target, lastUsedAtEpochMs: clock.nowEpochMs() },
            });
          }
        }
      },

      addDestination(input: DestinationInput): Promise<boolean> {
        const shouldSelect = stateRef.current.selectedDestinationId === null;
        return performAdd(input, shouldSelect);
      },

      async updateDestination(id: string, input: DestinationInput): Promise<boolean> {
        const validated = validateDestinationInput({ name: input.name, point: input.point });
        if (!validated.ok || validated.value === undefined) {
          return false;
        }
        try {
          const updated = await destinationRepository.update(id, {
            name: validated.value.name,
            point: validated.value.point,
          });
          if (updated === null) {
            return false;
          }
          if (mountedRef.current) {
            dispatch({ type: 'destination/updated', destination: updated });
          }
          return true;
        } catch {
          dispatchStorageWarning('目的地の更新に失敗しました');
          return false;
        }
      },

      async removeDestination(id: string): Promise<void> {
        try {
          await destinationRepository.remove(id);
          if (mountedRef.current) {
            dispatch({ type: 'destination/removed', id });
          }
        } catch {
          dispatchStorageWarning('目的地の削除に失敗しました');
        }
      },

      async useCurrentLocationAsDestination(name?: string): Promise<boolean> {
        const current = stateRef.current;
        const nav = selectNavState(current);
        if (current.location === null || nav.locationFreshness === 'lost') {
          return false;
        }
        const trimmed = name?.trim() ?? '';
        return performAdd(
          {
            name: trimmed.length > 0 ? trimmed : CURRENT_LOCATION_DEFAULT_NAME,
            point: current.location.point,
            origin: 'current-location',
          },
          true,
        );
      },

      toggleMockMode(): void {
        const enabled = !stateRef.current.mockMode;
        dispatch({ type: 'mock/toggled', enabled });
        lastHeadingDispatchMsRef.current = null;
        const activeProvider = enabled ? mockLocationProvider : locationProvider;
        if (activeProvider === undefined) {
          return;
        }
        void activeProvider
          .getPermissionState()
          .then((permission: PermissionOutcome) => {
            if (mountedRef.current) {
              dispatch({ type: 'permission/changed', permission });
            }
          })
          .catch(() => undefined);
      },

      selectScenario(id: ScenarioId | null): void {
        dispatch({ type: 'mock/scenario', scenarioId: id });
      },

      async retryPermission(): Promise<void> {
        try {
          const permission = await locationProvider.requestPermission();
          if (mountedRef.current) {
            dispatch({ type: 'permission/changed', permission });
          }
          if (permission.status === 'granted') {
            const lastKnown = await locationProvider.getLastKnown();
            if (lastKnown !== null && mountedRef.current) {
              dispatch({ type: 'sensor/location', fix: lastKnown });
            }
          }
        } catch (error) {
          if (mountedRef.current) {
            dispatchError(error);
          }
        }
      },

      async setFavorite(id: string, favorite: boolean): Promise<void> {
        const target = stateRef.current.destinations.find(
          (destination) => destination.id === id,
        );
        if (target === undefined) {
          return;
        }
        try {
          await destinationRepository.setFavorite(id, favorite);
          if (mountedRef.current) {
            dispatch({
              type: 'destination/updated',
              destination: { ...target, favorite },
            });
          }
        } catch {
          dispatchStorageWarning('お気に入りの保存に失敗しました');
        }
      },

      retryLocation(): void {
        // 購読 effect を張り直す（位置が止まったときのユーザー操作起点の再試行）。
        setSubscriptionNonce((value) => value + 1);
        const current = stateRef.current;
        if (current.permission?.status !== 'granted') {
          return;
        }
        void locationProvider
          .getLastKnown()
          .then((fix) => {
            if (fix !== null && mountedRef.current) {
              dispatch({ type: 'sensor/location', fix });
            }
          })
          .catch(() => undefined);
      },

      showSettingsHint(): void {
        // 設定アプリ遷移は行わず、文言（設定で許可する旨）をエラー欄に出すだけ（§18-8）。
        dispatch({
          type: 'provider/error',
          error: {
            code: 'permission-denied',
            message: '設定アプリで位置情報を許可してください',
            atMonotonicMs: clock.nowMonotonicMs(),
          },
        });
      },
    }),
    [
      clock,
      destinationRepository,
      dispatchError,
      locationProvider,
      mockLocationProvider,
      performAdd,
      persistSelection,
      dispatchStorageWarning,
    ],
  );

  const nav = useMemo(
    () => selectNavState(state),
    // §7.3 の依存 + headingUnavailable / thresholds（表示結果に影響するため）。
    [
      state.selectedDestinationId,
      state.destinations,
      state.location,
      state.heading,
      state.nowMonotonicMs,
      state.headingUnavailable,
      state.thresholds,
    ],
  );

  return { state, nav, actions };
}

/** 例外を `ProviderError` に変換する（境界で throw を握りつぶし、UI に出す説明へ）。 */
function toProviderError(error: unknown, atMonotonicMs: number): ProviderError {
  const message = error instanceof Error && error.message.length > 0 ? error.message : FALLBACK_ERROR_MESSAGE;
  const detail = typeof error === 'string' ? error : undefined;
  return detail === undefined
    ? { code: 'runtime-error', message, atMonotonicMs }
    : { code: 'runtime-error', message, detail, atMonotonicMs };
}

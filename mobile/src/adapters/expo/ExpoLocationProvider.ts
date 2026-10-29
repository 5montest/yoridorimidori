import * as Location from 'expo-location';
import { mapLocationReading } from '../../domain/sensorMapping';
import { SETTINGS_DEFAULT, type AccuracyProfile } from '../../domain/constants';
import type { SensorFix } from '../../domain/types';
import type { Clock } from '../../ports/clock';
import type {
  PermissionOutcome,
  ProviderError,
  ProviderErrorCode,
  Unsubscribe,
} from '../../ports/common';
import type { LocationProvider } from '../../ports/location';

export interface ExpoLocationProviderOptions {
  readonly clock: Clock;
  /** 位置取得プロファイル（既定は `SETTINGS_DEFAULT` = 'navigation'）。 */
  readonly accuracyProfile?: AccuracyProfile;
  /** 更新間隔（ms。Android のみ有効）。既定は `SETTINGS_DEFAULT` = 1000。 */
  readonly updateIntervalMs?: number;
}

/** `getLastKnownPositionAsync` に渡す許容 age（ms）。§5.1。 */
const LAST_KNOWN_MAX_AGE_MS = 30_000;

const NOOP_UNSUBSCRIBE: Unsubscribe = () => undefined;

/**
 * `expo-location` による `LocationProvider`（§5.1）。
 *
 * - `watchPositionAsync` のオプションは `accuracy` と `timeInterval` のみ
 *   （`distanceInterval` は未確認のため指定しない）。
 * - 権限・サービス状態・コード不正・実行時エラーは **`ProviderError` に変換して onError**。
 * - **`start()` は絶対に throw しない**（失敗は onError で通知する契約）。
 * - `coords.heading`（進行方向）は参照しない（方位は `ExpoHeadingProvider` の責務）。
 *
 * 使用する確定 API（notes §2.3〜§2.5）:
 * `requestForegroundPermissionsAsync` / `getForegroundPermissionsAsync` /
 * `watchPositionAsync` / `getLastKnownPositionAsync` / `hasServicesEnabledAsync` /
 * `Location.Accuracy.BestForNavigation = 6` / `High = 4`。
 */
export class ExpoLocationProvider implements LocationProvider {
  readonly id = 'expo-location';

  private readonly clock: Clock;
  private readonly accuracyProfile: AccuracyProfile;
  private readonly updateIntervalMs: number;

  constructor(options: ExpoLocationProviderOptions) {
    this.clock = options.clock;
    this.accuracyProfile = options.accuracyProfile ?? SETTINGS_DEFAULT.accuracyProfile;
    this.updateIntervalMs = options.updateIntervalMs ?? SETTINGS_DEFAULT.locationUpdateIntervalMs;
  }

  async requestPermission(): Promise<PermissionOutcome> {
    try {
      return toPermissionOutcome(await Location.requestForegroundPermissionsAsync());
    } catch {
      return { status: 'undetermined', canAskAgain: false };
    }
  }

  async getPermissionState(): Promise<PermissionOutcome> {
    try {
      return toPermissionOutcome(await Location.getForegroundPermissionsAsync());
    } catch {
      return { status: 'undetermined', canAskAgain: false };
    }
  }

  async start(
    onFix: (fix: SensorFix) => void,
    onError: (error: ProviderError) => void,
  ): Promise<Unsubscribe> {
    try {
      const permission = await this.getPermissionState();
      if (permission.status !== 'granted') {
        onError(
          this.createError(
            'permission-denied',
            '位置情報の利用が許可されていません',
            permission.status,
          ),
        );
        return NOOP_UNSUBSCRIBE;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        onError(this.createError('services-disabled', '位置情報サービスが OFF です'));
        return NOOP_UNSUBSCRIBE;
      }

      const subscription = await Location.watchPositionAsync(
        this.watchOptions(),
        (location) => {
          this.handleLocation(location, onFix, onError);
        },
        (reason) => {
          onError(
            this.createError('runtime-error', '位置情報の取得でエラーが発生しました', reason),
          );
        },
      );

      let active = true;
      return () => {
        if (!active) {
          return; // 冪等
        }
        active = false;
        try {
          subscription.remove();
        } catch {
          // 解除失敗は無視（購読はアプリ終了で破棄される）
        }
      };
    } catch (error) {
      onError(
        this.createError('runtime-error', '位置情報の購読に失敗しました', toDetail(error)),
      );
      return NOOP_UNSUBSCRIBE;
    }
  }

  async getLastKnown(): Promise<SensorFix | null> {
    try {
      const location = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
      });
      if (location === null) {
        return null;
      }
      return mapLocationReading(
        location,
        this.clock.nowMonotonicMs(),
        this.clock.nowEpochMs(),
        'device',
      );
    } catch {
      return null;
    }
  }

  /** watch のオプション（設計値。§5.1）。`distanceInterval` は指定しない。 */
  private watchOptions(): Location.LocationOptions {
    return {
      accuracy:
        this.accuracyProfile === 'balanced'
          ? Location.Accuracy.High // 4（省電力）
          : Location.Accuracy.BestForNavigation, // 6（ナビ向け最高精度）
      timeInterval: this.updateIntervalMs,
    };
  }

  private handleLocation(
    location: Location.LocationObject,
    onFix: (fix: SensorFix) => void,
    onError: (error: ProviderError) => void,
  ): void {
    const fix = mapLocationReading(
      location,
      this.clock.nowMonotonicMs(),
      this.clock.nowEpochMs(),
      'device',
    );
    if (fix === null) {
      // ライブラリの戻り値が不正（NaN / 範囲外）。サンプルは捨ててアプリは継続する（§11.3 #9）。
      onError(this.createError('invalid-data', '位置情報の値が不正です'));
      return;
    }
    onFix(fix);
  }

  private createError(
    code: ProviderErrorCode,
    message: string,
    detail?: string,
  ): ProviderError {
    const base: ProviderError = { code, message, atMonotonicMs: this.clock.nowMonotonicMs() };
    return detail === undefined ? base : { ...base, detail };
  }
}

/** `LocationPermissionResponse` → `PermissionOutcome`（§4.1 / §2.4）。 */
function toPermissionOutcome(
  response: Location.LocationPermissionResponse,
): PermissionOutcome {
  const status: PermissionOutcome['status'] = response.granted
    ? 'granted'
    : response.status === 'undetermined'
      ? 'undetermined'
      : response.status === 'denied'
        ? 'denied'
        : 'unavailable';
  return {
    status,
    canAskAgain: response.canAskAgain,
    androidAccuracy: response.android?.accuracy,
  };
}

function toDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'unknown error';
}

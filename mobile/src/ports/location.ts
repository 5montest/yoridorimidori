import type { SensorFix } from '../domain/types';
import type { PermissionOutcome, ProviderError, Unsubscribe } from './common';

/**
 * 現在地の供給元。実装: ExpoLocationProvider（端末）/ MockLocationProvider（開発）。
 * 将来の BLE 実装もこの契約を満たす（FR-12）。
 *
 * 契約:
 *  - start() は同期的に throw しない。失敗は onError で通知する。
 *  - start() の解決後、onFix が 0 回以上呼ばれる。以降は unsubscribe まで継続する。
 *  - unsubscribe は冪等。呼び出し後は onFix / onError が呼ばれないこと。
 *  - onFix は JS スレッド上で呼ばれる。UI dispatch は軽量に保つ（§7.4）。
 *  - getLastKnown() は「直前の既知位置」を返す。無ければ null。古い値を返す可能性がある。
 */
export interface LocationProvider {
  /** 実装識別子（ログ・開発画面用）: 'expo-location' | 'mock'。 */
  readonly id: string;

  /** 前景位置権限を要求する（ユーザー操作起点）。 */
  requestPermission(): Promise<PermissionOutcome>;

  /** 現在の権限状態を問い合わせる（ダイアログを出さない）。 */
  getPermissionState(): Promise<PermissionOutcome>;

  /** 購読開始。 */
  start(
    onFix: (fix: SensorFix) => void,
    onError: (error: ProviderError) => void,
  ): Promise<Unsubscribe>;

  /** 直前の既知位置（起動直後の即時表示用）。 */
  getLastKnown(): Promise<SensorFix | null>;
}

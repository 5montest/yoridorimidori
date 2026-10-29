/** 購読解除。冪等（2 回呼んでも安全）であること。 */
export type Unsubscribe = () => void;

/** 取得系で発生しうるエラー。例外を投げずにこの型で通知する。 */
export type ProviderErrorCode =
  | 'permission-denied' // 位置情報権限が拒否された
  | 'services-disabled' // 端末の位置情報サービスが OFF
  | 'unsupported-platform' // 実行環境がその API 非対応（Web のコンパス等）
  | 'unavailable' // センサーが利用不可（エミュレータ等）
  | 'runtime-error' // ライブラリがエラーを返した
  | 'invalid-data'; // ライブラリの戻り値が不正（NaN / 範囲外）

export interface ProviderError {
  readonly code: ProviderErrorCode;
  /** UI に出してよい短い説明（日本語）。 */
  readonly message: string;
  /** ライブラリの生メッセージ等（ログ用。UI には出さない）。 */
  readonly detail?: string;
  readonly atMonotonicMs: number;
}

/** 権限の状態。'unavailable' は「その環境では権限概念自体が無い/API が無い」。 */
export interface PermissionOutcome {
  readonly status: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  readonly canAskAgain: boolean;
  /** Android の付与精度（'fine' でなければ高精度 GPS は期待できない）。 */
  readonly androidAccuracy?: 'fine' | 'coarse' | 'none';
}

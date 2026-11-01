/** 信号の一時的な状態（フィルタ結果の要約。UI の案内保留判定に使う）。 */
export type SignalMode = 'normal' | 'transient' | 'unavailable';

/** サンプル 1 件の扱い（開発メニューのログ用）。 */
export type SampleDecision = 'accepted' | 'smoothed' | 'held' | 'rejected';

/** フィルタがサンプルをどう扱ったか。 */
export interface SignalQuality {
  readonly mode: SignalMode;
  readonly decision: SampleDecision;
  /** 判断理由（開発ログ用の短いコード。UI 文言ではない）。 */
  readonly reason: SignalReason | null;
}

/** 判断理由のコード。 */
export type SignalReason =
  | 'heading-low-accuracy'
  | 'heading-outlier'
  | 'heading-held'
  | 'heading-lost'
  | 'location-jump'
  | 'location-poor-accuracy'
  | 'location-stale'
  | 'location-lost'
  | 'reference-changed'
  | 'recovering'
  | 'unavailable';

/** 初期値（フィルタ未適用・正常）。 */
export const INITIAL_SIGNAL_QUALITY: SignalQuality = {
  mode: 'normal',
  decision: 'accepted',
  reason: null,
};

/** 位置・方位それぞれの信号品質。 */
export interface SignalQualityState {
  readonly heading: SignalQuality;
  readonly location: SignalQuality;
}

export const INITIAL_SIGNAL_QUALITY_STATE: SignalQualityState = {
  heading: INITIAL_SIGNAL_QUALITY,
  location: INITIAL_SIGNAL_QUALITY,
};

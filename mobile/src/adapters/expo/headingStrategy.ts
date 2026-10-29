/** 方位が利用できるかの判定結果。 */
export type HeadingAvailability = 'available' | 'unsupported-platform' | 'missing-api';

export interface HeadingAvailabilityInput {
  /** `Platform.OS` の値（'android' / 'ios' / 'web' など）。 */
  readonly platform: string;
  /** 方位 API（`watchHeadingAsync`）が存在するか。 */
  readonly hasWatchHeading: boolean;
}

/**
 * 方位の可用性判定（純粋関数・§5.2 / NFR-03）。
 *
 * `watchHeadingAsync` は **Android / iOS のみ**（【確定】notes §2.6。Web 非対応）。
 * `Platform.OS` の参照はアダプタ（`ExpoHeadingProvider`）1 箇所に閉じ込め、
 * 判定ロジックはこの純粋関数に切り出してテスト可能にする。
 *
 * 判定順: プラットフォーム非対応を先に返し（Web は API 有無に関わらず不可）、
 * 対応プラットフォームで API が無ければ `missing-api`。
 */
export function decideHeadingAvailability(
  input: HeadingAvailabilityInput,
): HeadingAvailability {
  if (input.platform !== 'android' && input.platform !== 'ios') {
    return 'unsupported-platform';
  }
  if (!input.hasWatchHeading) {
    return 'missing-api';
  }
  return 'available';
}

import type { HeadingFix } from '../domain/types';
import type { ProviderError, Unsubscribe } from './common';

/**
 * 端末方位（コンパス）の供給元。実装: ExpoHeadingProvider / MockHeadingProvider。
 *
 * 重要（【確定】notes §2.6）:
 *  - watchHeadingAsync は Android / iOS のみ。Web では使えない → isAvailable() で false。
 *  - LocationHeadingObject.trueHeading は位置権限が無いと -1 を返す。
 *    → -1（および範囲外/NaN）は「方位不明」として headingDeg=null / reference='unknown' にする。
 *  - 互換のため trueHeading が使えない場合は magHeading にフォールバックし、
 *    reference='magnetic-north' を立てる（D-05）。
 *  - coords.heading（進行方向）は絶対に使わない（混同禁止）。
 *
 * 契約: start / unsubscribe の振る舞いは LocationProvider と同じ。
 */
export interface HeadingProvider {
  readonly id: string;

  /** この環境で方位が取得できる見込みがあるか（Web は false）。 */
  isAvailable(): Promise<boolean>;

  start(
    onFix: (fix: HeadingFix) => void,
    onError: (error: ProviderError) => void,
  ): Promise<Unsubscribe>;
}

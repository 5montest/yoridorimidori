import type { Freshness } from './types';
import { DEFAULT_THRESHOLDS, type Thresholds } from './constants';

/**
 * 経過時間（ms）を求める。§6.6 / E-11。
 *
 * - タイムスタンプ逆転（`now < updated`）は `0` に丸める（負の経過時間を作らない）。
 * - `NaN` / `Infinity` が混じったら `0`（防御的。`Math.max(0, NaN)` は NaN になるため明示）。
 * - 鮮度計算は必ず `Clock.nowMonotonicMs()` の差分で行う（`Date.now()` を直接使わない）。
 */
export function elapsedMs(nowMonotonicMs: number, updatedAtMonotonicMs: number): number {
  if (!Number.isFinite(nowMonotonicMs) || !Number.isFinite(updatedAtMonotonicMs)) {
    return 0;
  }
  const diff = nowMonotonicMs - updatedAtMonotonicMs;
  return diff > 0 ? diff : 0;
}

/**
 * 経過時間から鮮度区分を返す。§6.6 / FR-08 / D-09。
 *
 * - `null`（未取得）は `null`。
 * - `0 <= e <= freshMaxMs` → `fresh` / `<= agingMaxMs` → `aging` /
 *   `<= staleMaxMs` → `stale` / それ以上 → `lost`。
 * - 閾値は `Thresholds` で注入する（既定 `DEFAULT_THRESHOLDS`。実測後の調整は定数 1 箇所）。
 */
export function classifyFreshness(
  ageMs: number | null,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Freshness | null {
  if (ageMs === null || !Number.isFinite(ageMs)) {
    return null;
  }
  if (ageMs <= thresholds.freshness.freshMaxMs) {
    return 'fresh';
  }
  if (ageMs <= thresholds.freshness.agingMaxMs) {
    return 'aging';
  }
  if (ageMs <= thresholds.freshness.staleMaxMs) {
    return 'stale';
  }
  return 'lost';
}

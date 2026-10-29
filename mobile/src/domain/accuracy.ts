import { DEFAULT_THRESHOLDS, type Thresholds } from './constants';
import type { GpsAccuracyClass, HeadingAccuracyClass, HeadingAccuracyLevel } from './types';

/**
 * GPS 水平精度（半径 m）から区分を返す。§6.7 / FR-08 / D-08。
 *
 * - `null` / 非有限 / **`<= 0`** → `unknown`（**ADR-01**: Android の「未取得 0」と
 *   「完全精度 0 m」を区別できないため安全側に倒す）。
 * - `0 < a <= goodMaxM` → `good` / `<= fairMaxM` → `fair` / それ以上 → `poor`。
 */
export function classifyGpsAccuracy(
  accuracyM: number | null,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): GpsAccuracyClass {
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM <= 0) {
    return 'unknown';
  }
  if (accuracyM <= thresholds.gpsAccuracy.goodMaxM) {
    return 'good';
  }
  if (accuracyM <= thresholds.gpsAccuracy.fairMaxM) {
    return 'fair';
  }
  return 'poor';
}

/**
 * コンパスの精度レベル（0〜3）から区分を返す。§6.7 / E-09。
 *
 * ライブラリ値の意味（notes §2.6）: 3=高精度 / 2=中 / 1=低 / 0=校正なし。
 * `0` は `uncalibrated`（UI で「8 の字に振る」等の対処を出せる）、`null` は `unknown` として区別する。
 * 0〜3 以外の数値（`-1`, `4`, `1.5`, `NaN`, `Infinity`）は `unknown`。
 */
export function classifyHeadingAccuracy(
  level: HeadingAccuracyLevel | null,
): HeadingAccuracyClass {
  switch (level) {
    case 3:
      return 'good';
    case 2:
      return 'fair';
    case 1:
      return 'poor';
    case 0:
      return 'uncalibrated';
    default:
      return 'unknown';
  }
}

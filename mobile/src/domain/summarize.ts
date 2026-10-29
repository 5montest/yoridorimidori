import { DEFAULT_THRESHOLDS, type Thresholds } from './constants';
import type { SampleLogEntry } from './types';

/** `summarizeSamples` の結果（開発用画面の簡易集計。§9.7）。 */
export interface SampleSummary {
  /** 平均 GPS 精度（m）。有効サンプルが無ければ null。 */
  readonly averageGpsAccuracyM: number | null;
  /** 平均の対象になったサンプル数（`gpsAccuracyM` が非 null の件数）。 */
  readonly gpsAccuracySampleCount: number;
  /** 方位精度 0〜3 の分布。index = レベル。null（不明）は含めない。 */
  readonly headingAccuracyDistribution: readonly [number, number, number, number];
  /** 古いサンプル率（0〜1）。`locationAgeMs > staleMaxMs` の割合。空配列は null。 */
  readonly staleRatio: number | null;
  /** 総サンプル数。 */
  readonly totalCount: number;
}

/**
 * 記録サンプルの簡易集計（FR-09 / §9.7）。
 *
 * - 平均 GPS 精度: `null` を除外して平均し、対象件数も返す（空・全 null なら null）。
 * - 方位精度の分布: 0〜3 の件数（`null` は不明なので数えない）。
 * - 古いサンプル率: `locationAgeMs > thresholds.freshness.staleMaxMs`（**超**）の割合。空配列は null。
 *
 * 副作用なし・throw しない。閾値は `Thresholds` で注入できる（既定 `DEFAULT_THRESHOLDS`）。
 */
export function summarizeSamples(
  entries: readonly SampleLogEntry[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): SampleSummary {
  let gpsSum = 0;
  let gpsCount = 0;
  let level0 = 0;
  let level1 = 0;
  let level2 = 0;
  let level3 = 0;
  let staleCount = 0;

  for (const entry of entries) {
    const accuracy = entry.gpsAccuracyM;
    if (accuracy !== null && Number.isFinite(accuracy)) {
      gpsSum += accuracy;
      gpsCount += 1;
    }

    switch (entry.headingAccuracy) {
      case 0:
        level0 += 1;
        break;
      case 1:
        level1 += 1;
        break;
      case 2:
        level2 += 1;
        break;
      case 3:
        level3 += 1;
        break;
      default:
        break; // null（不明）は分布に含めない
    }

    if (entry.locationAgeMs > thresholds.freshness.staleMaxMs) {
      staleCount += 1;
    }
  }

  const totalCount = entries.length;
  return {
    averageGpsAccuracyM: gpsCount === 0 ? null : gpsSum / gpsCount,
    gpsAccuracySampleCount: gpsCount,
    headingAccuracyDistribution: [level0, level1, level2, level3],
    staleRatio: totalCount === 0 ? null : staleCount / totalCount,
    totalCount,
  };
}

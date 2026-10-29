import { classifyGpsAccuracy, classifyHeadingAccuracy } from './accuracy';
import { initialBearingDeg, relativeBearingDeg } from './bearing';
import { DEFAULT_THRESHOLDS, type Thresholds } from './constants';
import { haversineDistanceM } from './distance';
import { classifyFreshness, elapsedMs } from './freshness';
import type {
  Destination,
  Freshness,
  GpsAccuracyClass,
  HeadingAccuracyClass,
  HeadingFix,
  HeadingReference,
  NavState,
  NavStatus,
  SensorFix,
  WarningCode,
} from './types';

/** `computeNavState` の入力。§6.8。 */
export interface NavStateInput {
  readonly destination: Destination | null;
  readonly location: SensorFix | null;
  readonly heading: HeadingFix | null;
  /** 鮮度計算に使う現在時刻（単調増加 ms）。 */
  readonly nowMonotonicMs: number;
  /** 方位プロバイダ自体が利用不可（Web・エミュレータ等）。警告の出し分けに使う。 */
  readonly headingUnavailable?: boolean;
}

/**
 * 目的地・位置・方位・現在時刻から `NavState` を合成する純粋セレクタ。§6.8 / ADR-02。
 *
 * 評価順序（この順序を変えない）:
 *  1. 目的地なし → `no-destination`（鮮度・精度は計算して返す）
 *  2. 位置なし → `locating`
 *  3. 距離・目標方位を計算。距離が `null`（不正座標）→ `locating`
 *  4. `distance < arrivalRadiusM`（**strict**）→ `arrived`（相対方位は null）
 *  5. 位置鮮度 `lost` → `position-lost`（鳥はニュートラル = 相対方位 null）
 *  6. 方位なし → `heading-unknown`
 *  7. それ以外 → `navigating`
 *
 * 警告は「位置系 → 方位系 → 精度系 → 基準系」の表示優先度順に整列して返す。
 * 副作用なし・throw しない。閾値は `Thresholds` で注入できる（既定 `DEFAULT_THRESHOLDS`）。
 */
export function computeNavState(
  input: NavStateInput,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): NavState {
  const { destination, location, heading, nowMonotonicMs } = input;

  // ── 鮮度・精度（目的地の有無に依存せず常に計算する。§6.8 手順 1） ──────────
  const locationAgeMs =
    location === null ? null : elapsedMs(nowMonotonicMs, location.receivedAtMonotonicMs);
  const headingAgeMs =
    heading === null ? null : elapsedMs(nowMonotonicMs, heading.receivedAtMonotonicMs);

  const locationFreshness: Freshness | null = classifyFreshness(locationAgeMs, thresholds);
  const headingFreshness: Freshness | null = classifyFreshness(headingAgeMs, thresholds);

  const gpsAccuracyClass: GpsAccuracyClass = classifyGpsAccuracy(
    location === null ? null : location.accuracyM,
    thresholds,
  );
  const headingAccuracyClass: HeadingAccuracyClass =
    heading === null ? 'unknown' : classifyHeadingAccuracy(heading.accuracy);
  const headingReference: HeadingReference = heading === null ? 'unknown' : heading.reference;

  // ── status と派生値（手順 1〜7） ─────────────────────────────────────────
  let status: NavStatus;
  let distanceM: number | null = null;
  let targetBearingDeg: number | null = null;
  let relativeBearing: number | null = null;

  if (destination === null) {
    status = 'no-destination';
  } else if (location === null) {
    status = 'locating';
  } else {
    const distance = haversineDistanceM(location.point, destination.point);
    if (distance === null) {
      // E-12: 目的地座標が不正（NaN / 範囲外）。落ちずに「測位中」として扱う。
      status = 'locating';
    } else {
      distanceM = distance;
      const target = initialBearingDeg(location.point, destination.point);
      targetBearingDeg = target;

      if (distance < thresholds.arrivalRadiusM) {
        // FR-06: 10 m 未満は到着（strict）。到着時は鳥をニュートラルにする（ADR-03）。
        status = 'arrived';
        relativeBearing = null;
      } else if (locationFreshness === 'lost') {
        // ADR-02: 位置が途絶したら誤誘導しないよう鳥をニュートラルにする。
        status = 'position-lost';
        relativeBearing = null;
      } else if (heading === null || heading.headingDeg === null) {
        status = 'heading-unknown';
        relativeBearing = null;
      } else {
        status = 'navigating';
        // E-09: 方位精度が低くても計算はする（鳥は回転する。警告は warnings で付ける）。
        relativeBearing =
          target === null ? null : relativeBearingDeg(target, heading.headingDeg);
      }
    }
  }

  // ── 警告の合成（表示優先度順：位置系 → 方位系 → 精度系 → 基準系） ─────────
  const warnings: WarningCode[] = [];

  // 位置系
  if (locationFreshness === 'stale') {
    warnings.push('location-stale');
  }
  if (locationFreshness === 'lost') {
    warnings.push('location-lost');
  }
  // 方位系
  if (headingFreshness === 'stale') {
    warnings.push('heading-stale');
  }
  if (headingFreshness === 'lost') {
    warnings.push('heading-lost');
  }
  if (heading === null && input.headingUnavailable === true) {
    warnings.push('heading-unavailable');
  }
  // 精度系
  if (headingAccuracyClass === 'uncalibrated') {
    warnings.push('heading-uncalibrated');
  } else if (headingAccuracyClass === 'poor') {
    warnings.push('heading-low-accuracy');
  } else if (headingAccuracyClass === 'unknown' && heading !== null) {
    // 精度値そのものが不明（heading は存在する）→ 低精度として注意を出す。
    warnings.push('heading-low-accuracy');
  }
  if (gpsAccuracyClass === 'poor') {
    warnings.push('gps-low-accuracy');
  }
  // 基準系
  if (headingReference === 'magnetic-north') {
    warnings.push('magnetic-reference');
  }

  return {
    status,
    distanceM,
    targetBearingDeg,
    relativeBearingDeg: relativeBearing,
    headingReference,
    locationFreshness,
    headingFreshness,
    locationAgeMs,
    headingAgeMs,
    gpsAccuracyClass,
    headingAccuracyClass,
    warnings,
  };
}

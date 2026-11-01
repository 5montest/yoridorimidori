import { classifyGpsAccuracy, classifyHeadingAccuracy } from './accuracy';
import { initialBearingDeg, relativeBearingDeg } from './bearing';
import { DEFAULT_THRESHOLDS, type Thresholds } from './constants';
import { haversineDistanceM } from './distance';
import { classifyFreshness, elapsedMs } from './freshness';
import {
  INITIAL_SIGNAL_QUALITY_STATE,
  type SignalQualityState,
} from './signalQuality';
import type {
  Destination,
  Freshness,
  GpsAccuracyClass,
  GuidanceAvailability,
  GuidanceIssue,
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
  /** 信号フィルタの状態（2026-11-01 追加。未指定は正常）。 */
  readonly signalQuality?: SignalQualityState;
}

/**
 * 目的地・位置・方位・現在時刻から `NavState` を合成する純粋セレクタ。§6.8 / ADR-02。
 *
 * 評価順序（2026-11-01 改訂。この順序を変えない）:
 *  1. 目的地なし → `no-destination`
 *  2. 位置なし → `locating`
 *  3. 距離・目標方位を計算。距離が `null`（不正座標）→ `locating`
 *  4. 位置鮮度 `lost`（またはフィルタで unavailable）→ `position-lost`（**到着判定より先**）
 *  5. **品質の良い測位**で `distance < arrivalRadiusM`（**strict**）→ `arrived`
 *     - 精度 `poor`/`unknown`・測位時刻と受信時刻の差が大きい・鮮度 `lost`/`stale` では到着にしない
 *  6. 方位なし・方位鮮度 `lost`・フィルタ unavailable → `heading-unknown`（古い方位で案内しない）
 *  7. それ以外 → `navigating`
 *
 * `guidanceAvailability` は「通常案内 / 一時保持 / 案内保留」を表す（UI の表示切替に使う）。
 * 警告は「位置系 → 方位系 → 精度系 → 基準系」の表示優先度順に整列して返す。
 * 副作用なし・throw しない。閾値は `Thresholds` で注入できる（既定 `DEFAULT_THRESHOLDS`）。
 */
export function computeNavState(
  input: NavStateInput,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): NavState {
  const { destination, location, heading, nowMonotonicMs } = input;
  const quality = input.signalQuality ?? INITIAL_SIGNAL_QUALITY_STATE;

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

  // ── 信号の信頼性（鮮度・精度・フィルタ結果を統合） ───────────────────────
  const locationUnreliable =
    location === null ||
    locationFreshness === 'lost' ||
    quality.location.mode === 'unavailable';
  const headingMissing = heading === null || heading.headingDeg === null;
  const headingUnreliable =
    headingMissing || headingFreshness === 'lost' || quality.heading.mode === 'unavailable';

  /** 測位時刻と受信時刻の差（ms）。判定できない場合は null。 */
  const captureLagMs =
    location === null || location.capturedAtEpochMs === null
      ? null
      : location.receivedAtEpochMs - location.capturedAtEpochMs;
  const captureLagOk =
    captureLagMs !== null &&
    captureLagMs >= 0 &&
    captureLagMs <= thresholds.guidance.arrivalMaxCaptureLagMs;
  const arrivalAccuracyOk =
    gpsAccuracyClass === 'good' || gpsAccuracyClass === 'fair';
  const arrivalFreshnessOk =
    locationFreshness !== 'lost' && locationFreshness !== 'stale';

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

      const arrivalConfirmed =
        distance < thresholds.arrivalRadiusM &&
        captureLagOk &&
        arrivalAccuracyOk &&
        arrivalFreshnessOk;

      if (locationUnreliable) {
        // 古い位置を根拠に到着判定しない（到着判定より先に評価する。2026-11-01）。
        status = 'position-lost';
        relativeBearing = null;
      } else if (arrivalConfirmed) {
        // FR-06: 10 m 未満は到着（strict）。到着時は鳥をニュートラルにする（ADR-03）。
        status = 'arrived';
        relativeBearing = null;
      } else if (headingUnreliable) {
        // 古い方位・不明な方位で案内しない（2026-11-01）。
        status = 'heading-unknown';
        relativeBearing = null;
      } else {
        status = 'navigating';
        // E-09: 方位精度が低くても計算はする（鳥の回転は availability で抑制する）。
        relativeBearing =
          target === null ? null : relativeBearingDeg(target, heading.headingDeg);
      }
    }
  }

  // ── 案内表示の信頼度（normal / hold / unavailable） ──────────────────────
  const { availability, issue } = evaluateGuidanceAvailability({
    hasDestination: destination !== null,
    status,
    location,
    locationFreshness,
    headingFreshness,
    gpsAccuracyClass,
    headingAccuracyClass,
    distanceM,
    quality,
    thresholds,
  });

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
    guidanceAvailability: availability,
    guidanceIssue: issue,
  };
}

interface AvailabilityInput {
  readonly hasDestination: boolean;
  readonly status: NavStatus;
  readonly location: SensorFix | null;
  readonly locationFreshness: Freshness | null;
  readonly headingFreshness: Freshness | null;
  readonly gpsAccuracyClass: GpsAccuracyClass;
  readonly headingAccuracyClass: HeadingAccuracyClass;
  readonly distanceM: number | null;
  readonly quality: SignalQualityState;
  readonly thresholds: Thresholds;
}

/**
 * 案内表示の信頼度を判定する。
 *
 * - **unavailable**: 位置が無い/途絶/フィルタで不可、または方位が無い/途絶/フィルタで不可。
 * - **hold**: 位置・方位の鮮度低下（stale）、GPS 精度 poor/unknown、方位精度 0/1/null、
 *   フィルタの一時保持、目的地が近くて同じ測位誤差の影響が大きい場合。
 * - **normal**: それ以外。
 */
function evaluateGuidanceAvailability(input: AvailabilityInput): {
  readonly availability: GuidanceAvailability;
  readonly issue: GuidanceIssue;
} {
  const {
    hasDestination,
    location,
    locationFreshness,
    headingFreshness,
    gpsAccuracyClass,
    headingAccuracyClass,
    distanceM,
    quality,
    thresholds,
  } = input;

  if (!hasDestination) {
    return { availability: 'normal', issue: null };
  }

  const positionUnavailable =
    location === null ||
    locationFreshness === 'lost' ||
    quality.location.mode === 'unavailable';
  const headingUnavailable =
    headingFreshness === 'lost' || quality.heading.mode === 'unavailable';

  if (positionUnavailable && headingUnavailable) {
    return { availability: 'unavailable', issue: 'both' };
  }
  if (positionUnavailable) {
    return { availability: 'unavailable', issue: 'position' };
  }
  if (headingUnavailable) {
    return { availability: 'unavailable', issue: 'heading' };
  }

  // ここでは位置も方位も「取得はできている」状態。
  const positionLimited =
    (thresholds.guidance.holdWhenLocationStale && locationFreshness === 'stale') ||
    quality.location.mode === 'transient' ||
    (thresholds.guidance.holdWhenGpsPoor &&
      (gpsAccuracyClass === 'poor' || gpsAccuracyClass === 'unknown'));
  const headingLimited =
    (thresholds.guidance.holdWhenHeadingStale && headingFreshness === 'stale') ||
    quality.heading.mode === 'transient' ||
    (thresholds.guidance.holdWhenHeadingAccuracyLow &&
      (headingAccuracyClass === 'poor' ||
        headingAccuracyClass === 'uncalibrated' ||
        headingAccuracyClass === 'unknown'));

  // 目的地が近いほど、同じ GPS 誤差でも方位の誤差が大きくなる。
  const accuracyM = location === null ? null : location.accuracyM;
  const nearLimited =
    distanceM !== null &&
    accuracyM !== null &&
    Number.isFinite(accuracyM) &&
    accuracyM > 0 &&
    distanceM < accuracyM * thresholds.guidance.nearDestinationAccuracyRatio;

  const issue: GuidanceIssue =
    (positionLimited || nearLimited) && headingLimited
      ? 'both'
      : positionLimited || nearLimited
        ? 'position'
        : headingLimited
          ? 'heading'
          : null;

  return issue === null
    ? { availability: 'normal', issue: null }
    : { availability: 'hold', issue };
}

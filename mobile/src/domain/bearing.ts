import { POLE_EPS_DEG, SAME_POINT_EPS_M } from './constants';
import { haversineDistanceM } from './distance';
import { normalizeDegrees360, normalizeSignedDegrees, toDegrees, toRadians } from './normalize';
import type { GeoPoint } from './types';
import { isValidGeoPoint } from './validation';

/**
 * 現在地 → 目的地の初期方位（大円方位角・initial bearing）。§6.3。
 *
 * 戻り値は `[0, 360)` の度（北 = 0、時計回り）。定義できない場合は `null`（throw しない）。
 * `null` を返す優先順位:
 *  1. `from` / `to` が不正な座標（E-12）
 *  2. どちらかの緯度が極点（|lat| が 90° に POLE_EPS_DEG 以内。E-05 / ADR-05）
 *  3. 2 点間距離が `SAME_POINT_EPS_M` 未満（E-01 / ADR-04）
 */
export function initialBearingDeg(from: GeoPoint, to: GeoPoint): number | null {
  if (!isValidGeoPoint(from) || !isValidGeoPoint(to)) {
    return null;
  }
  if (isPole(from.latitude) || isPole(to.latitude)) {
    return null;
  }

  // 同一地点は方位が定義できない（E-01）。距離計算は内部で行う。
  const distanceM = haversineDistanceM(from, to);
  if (distanceM === null || distanceM < SAME_POINT_EPS_M) {
    return null;
  }

  // 度 → ラジアンは式の直前に 1 度だけ（途中で丸めない）。
  const phi1 = toRadians(from.latitude);
  const phi2 = toRadians(to.latitude);
  // 経度差は必ず符号付き正規化を経由させる（日付変更線 E-03。巨大な角度を trig に渡さない）。
  const deltaLambda = toRadians(normalizeSignedDegrees(to.longitude - from.longitude));

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);

  // 最終正規化は normalizeDegrees360（% を直書きしない）。null（方位なし）と 0（真北）を混同しない。
  const bearingDeg = normalizeDegrees360(toDegrees(theta));
  return Number.isFinite(bearingDeg) ? bearingDeg : null;
}

/**
 * 相対方位 = `targetBearingDeg - headingDeg` を `(-180, 180]` に正規化。§6.5 / FR-05。
 *
 * - `0` = 目的地は正面（画面上方向）、`+90` = 右、`-90` = 左。
 * - `-180` は `180` に寄せる（E-07 の一意性規則）。
 * - どちらかが非有限なら `null`。
 */
export function relativeBearingDeg(
  targetBearingDeg: number,
  headingDeg: number,
): number | null {
  if (!Number.isFinite(targetBearingDeg) || !Number.isFinite(headingDeg)) {
    return null;
  }
  const target = normalizeDegrees360(targetBearingDeg);
  const heading = normalizeDegrees360(headingDeg);
  return normalizeSignedDegrees(target - heading);
}

/** 極点か（|lat| が 90° に POLE_EPS_DEG 以内）。 */
function isPole(latitude: number): boolean {
  return Math.abs(Math.abs(latitude) - 90) <= POLE_EPS_DEG;
}

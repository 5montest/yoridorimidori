import { EARTH_RADIUS_M } from './constants';
import { normalizeSignedDegrees, toRadians } from './normalize';
import type { GeoPoint } from './types';
import { isValidGeoPoint } from './validation';

/**
 * 2 点間の大円距離（m）。haversine 式（§6.4）。
 *
 * - 不正入力（NaN / ±Infinity / 範囲外）は `null`（E-12）。throw しない。
 * - 対蹠点で `a` が [0,1] をわずかに外れても `√(1−a)` が NaN にならないよう `a` をクランプする（E-02）。
 * - 戻り値は常に有限・`>= 0`。同一地点は `0`。
 */
export function haversineDistanceM(a: GeoPoint, b: GeoPoint): number | null {
  if (!isValidGeoPoint(a) || !isValidGeoPoint(b)) {
    return null;
  }

  // 度 → ラジアンは式の直前に 1 度だけ行う（途中で丸めない。§6.3）。
  // Δλ は日付変更線（E-03）を意図的に跨ぐため符号付き正規化を経由させ、
  // 巨大な角度を trig に渡さない。
  const phi1 = toRadians(a.latitude);
  const phi2 = toRadians(b.latitude);
  const deltaPhi = toRadians(b.latitude - a.latitude);
  const deltaLambda = toRadians(normalizeSignedDegrees(b.longitude - a.longitude));

  const sinHalfDeltaPhi = Math.sin(deltaPhi / 2);
  const sinHalfDeltaLambda = Math.sin(deltaLambda / 2);
  const h =
    sinHalfDeltaPhi * sinHalfDeltaPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinHalfDeltaLambda * sinHalfDeltaLambda;

  // 浮動小数誤差で [0,1] を外れると √(1−a) が NaN になる（特に E-02 の対蹠点）。クランプする。
  const clamped = h < 0 ? 0 : h > 1 ? 1 : h;
  const c = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));

  return EARTH_RADIUS_M * c;
}

import { normalizeSignedDegrees } from './normalize';
import type { GeoPoint } from './types';
import { isValidGeoPoint } from './validation';

/**
 * 地図表示領域。`react-native-maps` の `Region` と**構造互換の自前型**（§18-12）。
 * ライブラリ型は未確認のため import しない（T27 が構造的に渡す）。
 */
export interface MapRegion {
  readonly latitude: number;
  readonly longitude: number;
  readonly latitudeDelta: number;
  readonly longitudeDelta: number;
}

/** 余白倍率（2 点の差の何倍を表示するか。§9.6）。 */
export const MAP_REGION_SCALE = 2.5;

/** 最小ズーム（度）。同一地点でもこの幅は確保する（§9.6）。 */
export const MAP_REGION_MIN_DELTA = 0.005;

/**
 * 2 点（現在地・目的地）を 1 画面に収める地図表示領域を計算する純粋関数（§9.6 / §18-12）。
 *
 * - 中心は 2 点の中点。
 * - 幅は `max(|Δ| * MAP_REGION_SCALE, MAP_REGION_MIN_DELTA)`。
 * - 不正座標（NaN / ±Infinity / 範囲外）は `null`（E-12 と整合）。throw しない。
 *
 * **日付変更線（アンチメリディアン）の方針**:
 * `|Δlon| > 180` のときは **最短の経度幅**を採用する（`normalizeSignedDegrees` で差分を
 * `(-180, 180]` に畳んでから幅を求める）。これにより `179.9°E ↔ 179.9°W` は
 * 「地球 1 周の 359.8°」ではなく「0.2°」のタイトな領域になり、中心も日付変更線の近くになる。
 * ただし **緯度**は折り返しの概念が無いため、そのまま算術中点を使う。
 */
export function regionForPoints(a: GeoPoint, b: GeoPoint): MapRegion | null {
  if (!isValidGeoPoint(a) || !isValidGeoPoint(b)) {
    return null;
  }

  const latitude = sanitize((a.latitude + b.latitude) / 2);
  const latitudeSpan = Math.abs(b.latitude - a.latitude);

  // 経度は最短経路の差分で扱う（日付変更線をまたぐケース。上記コメント参照）。
  const shortestLongitudeDelta = normalizeSignedDegrees(b.longitude - a.longitude);
  const longitudeSpan = Math.abs(shortestLongitudeDelta);
  const longitude = sanitize(
    shortestLongitudeDelta === 0
      ? a.longitude
      : normalizeSignedDegrees(a.longitude + shortestLongitudeDelta / 2),
  );

  return {
    latitude,
    longitude,
    latitudeDelta: Math.max(latitudeSpan * MAP_REGION_SCALE, MAP_REGION_MIN_DELTA),
    longitudeDelta: Math.max(longitudeSpan * MAP_REGION_SCALE, MAP_REGION_MIN_DELTA),
  };
}

/** データモデルに `-0` を入れない（§3.2 / 付録C-6）。 */
function sanitize(value: number): number {
  return value === 0 ? 0 : value;
}

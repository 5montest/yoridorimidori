import type { GeoPoint } from './types';

/** OSM ラスタータイルの 1 枚のサイズ（px）。 */
export const TILE_SIZE = 256;

/** Web メルカトルで扱える緯度の上限（OSM/Google 共通）。 */
export const MAX_MERCATOR_LATITUDE = 85.05112878;

/** 地図の最小・最大ズーム。 */
export const MIN_MAP_ZOOM = 3;
export const MAX_MAP_ZOOM = 19;

/** 緯度を Web メルカトルの範囲に収める。 */
export function clampLatitude(latitude: number): number {
  if (!Number.isFinite(latitude)) {
    return 0;
  }
  return Math.min(MAX_MERCATOR_LATITUDE, Math.max(-MAX_MERCATOR_LATITUDE, latitude));
}

/** 経度を [-180, 180) に正規化する。 */
export function normalizeLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) {
    return 0;
  }
  const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
  return wrapped;
}

/** ズームを範囲内に丸める（整数）。 */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return MIN_MAP_ZOOM;
  }
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, Math.round(zoom)));
}

/** 経度 → タイル X（小数。`zoom` のタイル数スケール）。 */
export function lonToTileXFloat(longitude: number, zoom: number): number {
  const scale = 2 ** clampZoom(zoom);
  return ((normalizeLongitude(longitude) + 180) / 360) * scale;
}

/** 緯度 → タイル Y（小数。Web メルカトル）。 */
export function latToTileYFloat(latitude: number, zoom: number): number {
  const scale = 2 ** clampZoom(zoom);
  const latRad = (clampLatitude(latitude) * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  return y * scale;
}

/** タイル X（整数）→ 経度（タイルの左上）。 */
export function tileXToLon(tileX: number, zoom: number): number {
  const scale = 2 ** clampZoom(zoom);
  return (tileX / scale) * 360 - 180;
}

/** タイル Y（整数）→ 緯度（タイルの上端）。 */
export function tileYToLat(tileY: number, zoom: number): number {
  const scale = 2 ** clampZoom(zoom);
  const n = Math.PI - (2 * Math.PI * tileY) / scale;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** 地理座標 → ワールドピクセル（ズーム時の全地図上の px 座標）。 */
export function geoToWorldPixel(point: GeoPoint, zoom: number): { readonly x: number; readonly y: number } {
  return {
    x: lonToTileXFloat(point.longitude, zoom) * TILE_SIZE,
    y: latToTileYFloat(point.latitude, zoom) * TILE_SIZE,
  };
}

/** ワールドピクセル → 地理座標。 */
export function worldPixelToGeo(x: number, y: number, zoom: number): GeoPoint {
  const scale = 2 ** clampZoom(zoom);
  const tileX = x / TILE_SIZE;
  const tileY = y / TILE_SIZE;
  const longitude = (tileX / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * tileY) / scale;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { latitude: clampLatitude(latitude), longitude: normalizeLongitude(longitude) };
}

/** 表示するタイル 1 枚。`left` / `top` はビューポート内の px 位置。 */
export interface MapTile {
  readonly key: string;
  readonly url: string;
  readonly left: number;
  readonly top: number;
  readonly size: number;
}

/** OSM のタイル URL を作る（X は世界をまたぐ場合に折り返す）。 */
export function osmTileUrl(tileX: number, tileY: number, zoom: number): string {
  const scale = 2 ** clampZoom(zoom);
  const wrappedX = ((tileX % scale) + scale) % scale;
  return `https://tile.openstreetmap.org/${clampZoom(zoom)}/${wrappedX}/${tileY}.png`;
}

/**
 * ビューポートに必要なタイル一覧を作る。
 *
 * - `center` を中心に `widthPx` × `heightPx` の範囲を覆うタイルを返す。
 * - `paddingPx` を指定すると、その分だけ外側のタイルも含める（ドラッグ中の余白表示用）。
 *   位置はビューポート左上を 0 とした px 座標のまま（`paddingPx` 分は負値になる）。
 * - 縦はタイル範囲外（極付近）を除外し、横は世界を折り返す（`osmTileUrl` が X を正規化）。
 */
export function visibleTiles(
  center: GeoPoint,
  zoom: number,
  widthPx: number,
  heightPx: number,
  tileSize: number = TILE_SIZE,
  paddingPx: number = 0,
): readonly MapTile[] {
  const safeZoom = clampZoom(zoom);
  const scale = 2 ** safeZoom;
  const padding = Number.isFinite(paddingPx) && paddingPx > 0 ? paddingPx : 0;
  const viewWidth = widthPx + padding * 2;
  const viewHeight = heightPx + padding * 2;
  const centerWorld = geoToWorldPixel(center, safeZoom);
  const leftWorld = centerWorld.x - viewWidth / 2;
  const topWorld = centerWorld.y - viewHeight / 2;
  const minTileX = Math.floor(leftWorld / tileSize);
  const maxTileX = Math.floor((leftWorld + viewWidth) / tileSize);
  const minTileY = Math.floor(topWorld / tileSize);
  const maxTileY = Math.floor((topWorld + viewHeight) / tileSize);

  const tiles: MapTile[] = [];
  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= scale) {
      continue;
    }
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedX = ((tileX % scale) + scale) % scale;
      tiles.push({
        key: `${safeZoom}/${wrappedX}/${tileY}/${tileX}`,
        url: osmTileUrl(tileX, tileY, safeZoom),
        left: tileX * tileSize - leftWorld - padding,
        top: tileY * tileSize - topWorld - padding,
        size: tileSize,
      });
    }
  }
  return tiles;
}

/** ビューポート内の点（左上原点）→ 地理座標。 */
export function screenPointToGeo(
  point: { readonly x: number; readonly y: number },
  center: GeoPoint,
  zoom: number,
  widthPx: number,
  heightPx: number,
): GeoPoint {
  const centerWorld = geoToWorldPixel(center, zoom);
  const worldX = centerWorld.x + (point.x - widthPx / 2);
  const worldY = centerWorld.y + (point.y - heightPx / 2);
  return worldPixelToGeo(worldX, worldY, zoom);
}

/** 地理座標 → ビューポート内の点（左上原点）。範囲外でも返す（描画側で clip）。 */
export function geoToScreenPoint(
  point: GeoPoint,
  center: GeoPoint,
  zoom: number,
  widthPx: number,
  heightPx: number,
): { readonly x: number; readonly y: number } {
  const centerWorld = geoToWorldPixel(center, zoom);
  const world = geoToWorldPixel(point, zoom);
  return {
    x: world.x - centerWorld.x + widthPx / 2,
    y: world.y - centerWorld.y + heightPx / 2,
  };
}

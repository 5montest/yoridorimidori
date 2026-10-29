import type { GeoPoint } from '../types';
import {
  clampLatitude,
  clampZoom,
  geoToScreenPoint,
  geoToWorldPixel,
  latToTileYFloat,
  lonToTileXFloat,
  normalizeLongitude,
  osmTileUrl,
  screenPointToGeo,
  tileXToLon,
  tileYToLat,
  visibleTiles,
  worldPixelToGeo,
} from '../tileMath';

const TOKYO: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };

describe('tileMath: 座標変換', () => {
  it('lonToTileXFloat / latToTileYFloat は zoom 0 で 0.5 付近になる（経度0・緯度0）', () => {
    expect(lonToTileXFloat(0, 3)).toBeCloseTo(4, 6);
    expect(latToTileYFloat(0, 3)).toBeCloseTo(4, 6);
  });

  it('zoom 1 で東経90度はタイルX 0.75', () => {
    expect(lonToTileXFloat(90, 3)).toBeCloseTo(6, 6);
  });

  it('tileXToLon / tileYToLat は往復する', () => {
    expect(tileXToLon(0, 3)).toBeCloseTo(-180, 6);
    expect(tileYToLat(0, 3)).toBeCloseTo(85.05112878, 4);
    const x = lonToTileXFloat(TOKYO.longitude, 15);
    const y = latToTileYFloat(TOKYO.latitude, 15);
    expect(tileXToLon(Math.floor(x), 15)).toBeLessThan(TOKYO.longitude);
    expect(tileYToLat(Math.floor(y), 15)).toBeGreaterThan(TOKYO.latitude);
  });

  it('geoToWorldPixel → worldPixelToGeo は往復する', () => {
    const world = geoToWorldPixel(TOKYO, 15);
    const back = worldPixelToGeo(world.x, world.y, 15);
    expect(back.latitude).toBeCloseTo(TOKYO.latitude, 6);
    expect(back.longitude).toBeCloseTo(TOKYO.longitude, 6);
  });

  it('緯度はメルカトル範囲にクランプされ、経度は折り返す', () => {
    expect(clampLatitude(90)).toBeLessThanOrEqual(85.05112878);
    expect(clampLatitude(-90)).toBeGreaterThanOrEqual(-85.05112878);
    expect(normalizeLongitude(190)).toBeCloseTo(-170, 6);
    expect(normalizeLongitude(-190)).toBeCloseTo(170, 6);
  });

  it('ズームは 3〜19 に丸められる', () => {
    expect(clampZoom(0)).toBe(3);
    expect(clampZoom(30)).toBe(19);
    expect(clampZoom(14.6)).toBe(15);
  });
});

describe('tileMath: タイル一覧', () => {
  it('OSM のタイル URL を作る', () => {
    expect(osmTileUrl(1, 2, 3)).toBe('https://tile.openstreetmap.org/3/1/2.png');
  });

  it('経度 180 度をまたぐ X は折り返す', () => {
    expect(osmTileUrl(-1, 2, 3)).toBe('https://tile.openstreetmap.org/3/7/2.png');
    expect(osmTileUrl(2, 2, 3)).toBe('https://tile.openstreetmap.org/3/2/2.png');
  });

  it('ビューポートを覆うタイルを返す（390x600 / zoom 15）', () => {
    const tiles = visibleTiles(TOKYO, 15, 390, 600);
    expect(tiles.length).toBeGreaterThan(0);
    // 画面全体を覆う（左端が 0 以下、右端が 390 以上）
    const minLeft = Math.min(...tiles.map((tile) => tile.left));
    const maxRight = Math.max(...tiles.map((tile) => tile.left + tile.size));
    const minTop = Math.min(...tiles.map((tile) => tile.top));
    const maxBottom = Math.max(...tiles.map((tile) => tile.top + tile.size));
    expect(minLeft).toBeLessThanOrEqual(0);
    expect(maxRight).toBeGreaterThanOrEqual(390);
    expect(minTop).toBeLessThanOrEqual(0);
    expect(maxBottom).toBeGreaterThanOrEqual(600);
    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(tiles.length);
  });

  it('極付近では縦方向のタイルを除外する（zoom 3・北極）', () => {
    const tiles = visibleTiles({ latitude: 89.9, longitude: 0 }, 3, 390, 600);
    expect(tiles.every((tile) => tile.top >= -1000)).toBe(true);
    expect(tiles.length).toBeGreaterThan(0);
  });
});

describe('tileMath: 画面座標との相互変換', () => {
  it('中心点はビューポート中央に写る', () => {
    const point = geoToScreenPoint(TOKYO, TOKYO, 15, 390, 600);
    expect(point.x).toBeCloseTo(195, 6);
    expect(point.y).toBeCloseTo(300, 6);
  });

  it('中央のタップは中心座標になる', () => {
    const geo = screenPointToGeo({ x: 195, y: 300 }, TOKYO, 15, 390, 600);
    expect(geo.latitude).toBeCloseTo(TOKYO.latitude, 6);
    expect(geo.longitude).toBeCloseTo(TOKYO.longitude, 6);
  });

  it('画面座標 → 地理座標 → 画面座標 は往復する', () => {
    const point = { x: 120, y: 420 };
    const geo = screenPointToGeo(point, TOKYO, 15, 390, 600);
    const back = geoToScreenPoint(geo, TOKYO, 15, 390, 600);
    expect(back.x).toBeCloseTo(point.x, 4);
    expect(back.y).toBeCloseTo(point.y, 4);
  });

  it('東にタップすると経度が増える', () => {
    const geo = screenPointToGeo({ x: 300, y: 300 }, TOKYO, 15, 390, 600);
    expect(geo.longitude).toBeGreaterThan(TOKYO.longitude);
  });
});

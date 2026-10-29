import {
  MAP_REGION_MIN_DELTA,
  MAP_REGION_SCALE,
  regionForPoints,
  type MapRegion,
} from '../mapRegion';
import { normalizeSignedDegrees } from '../normalize';
import type { GeoPoint } from '../types';

const TOKYO_STATION: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };
const SHINJUKU_STATION: GeoPoint = { latitude: 35.689592, longitude: 139.700413 };

function regionOrThrow(a: GeoPoint, b: GeoPoint): MapRegion {
  const region = regionForPoints(a, b);
  if (region === null) {
    throw new Error('region should be defined for valid points');
  }
  return region;
}

/** 経度の円周上の差（ラップ考慮）。 */
function circularLongitudeDiff(a: number, b: number): number {
  return Math.abs(normalizeSignedDegrees(a - b));
}

describe('定数（§9.6）', () => {
  it('余白倍率 2.5・最小ズーム 0.005', () => {
    expect(MAP_REGION_SCALE).toBe(2.5);
    expect(MAP_REGION_MIN_DELTA).toBe(0.005);
  });
});

describe('regionForPoints — 同一地点・基本', () => {
  it('同一地点は中心がその点で、幅は最小ズームになる', () => {
    const region = regionOrThrow(TOKYO_STATION, { ...TOKYO_STATION });
    expect(region.latitude).toBe(TOKYO_STATION.latitude);
    expect(region.longitude).toBe(TOKYO_STATION.longitude);
    expect(region.latitudeDelta).toBe(MAP_REGION_MIN_DELTA);
    expect(region.longitudeDelta).toBe(MAP_REGION_MIN_DELTA);
  });

  it('赤道沿いの東西 1° は中心が中点・lonDelta = 2.5・latDelta は最小', () => {
    const region = regionOrThrow(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    );
    expect(region.latitude).toBe(0);
    expect(region.longitude).toBe(0.5);
    expect(region.latitudeDelta).toBe(MAP_REGION_MIN_DELTA);
    expect(region.longitudeDelta).toBeCloseTo(1 * MAP_REGION_SCALE, 12);
  });

  it('南北 2° は latDelta = 5・lonDelta は最小', () => {
    const region = regionOrThrow(
      { latitude: 10, longitude: 20 },
      { latitude: 12, longitude: 20 },
    );
    expect(region.latitude).toBe(11);
    expect(region.longitude).toBe(20);
    expect(region.latitudeDelta).toBeCloseTo(2 * MAP_REGION_SCALE, 12);
    expect(region.longitudeDelta).toBe(MAP_REGION_MIN_DELTA);
  });

  it('東京駅〜新宿駅: 中心は算術中点・幅は差 × 2.5', () => {
    const region = regionOrThrow(TOKYO_STATION, SHINJUKU_STATION);
    expect(region.latitude).toBeCloseTo(
      (TOKYO_STATION.latitude + SHINJUKU_STATION.latitude) / 2,
      12,
    );
    expect(region.longitude).toBeCloseTo(
      (TOKYO_STATION.longitude + SHINJUKU_STATION.longitude) / 2,
      12,
    );
    const latitudeSpan = Math.abs(SHINJUKU_STATION.latitude - TOKYO_STATION.latitude);
    const longitudeSpan = Math.abs(SHINJUKU_STATION.longitude - TOKYO_STATION.longitude);
    expect(region.latitudeDelta).toBeCloseTo(latitudeSpan * MAP_REGION_SCALE, 12);
    expect(region.longitudeDelta).toBeCloseTo(longitudeSpan * MAP_REGION_SCALE, 12);
  });

  it('2 点の幅は常に「差 × 2.5」以上・かつ最小ズーム以上（|Δlon| <= 180）', () => {
    const pairs: readonly (readonly [GeoPoint, GeoPoint])[] = [
      [TOKYO_STATION, SHINJUKU_STATION],
      [{ latitude: -45, longitude: -170 }, { latitude: 60, longitude: -120 }],
      [{ latitude: 89.9, longitude: 0 }, { latitude: 89.9, longitude: 10 }],
    ];
    for (const [a, b] of pairs) {
      const region = regionOrThrow(a, b);
      const latitudeSpan = Math.abs(b.latitude - a.latitude);
      const longitudeSpan = Math.abs(b.longitude - a.longitude);
      expect(region.latitudeDelta).toBeGreaterThanOrEqual(latitudeSpan * MAP_REGION_SCALE - 1e-12);
      expect(region.longitudeDelta).toBeGreaterThanOrEqual(longitudeSpan * MAP_REGION_SCALE - 1e-12);
      expect(region.latitudeDelta).toBeGreaterThanOrEqual(MAP_REGION_MIN_DELTA);
      expect(region.longitudeDelta).toBeGreaterThanOrEqual(MAP_REGION_MIN_DELTA);
    }
  });

  it('日付変更線をまたぐ場合は「最短の経度幅 × 2.5」以上（生の差は使わない）', () => {
    const pairs: readonly (readonly [GeoPoint, GeoPoint])[] = [
      [{ latitude: -45, longitude: -170 }, { latitude: 60, longitude: 120 }], // 生 290 / 最短 70
      [{ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 }], // 生 359.8 / 最短 0.2
    ];
    for (const [a, b] of pairs) {
      const region = regionOrThrow(a, b);
      const rawLongitudeSpan = Math.abs(b.longitude - a.longitude);
      const shortestLongitudeSpan = Math.abs(normalizeSignedDegrees(b.longitude - a.longitude));
      expect(rawLongitudeSpan).toBeGreaterThan(180); // 前提: 日付変更線をまたぐ
      expect(region.longitudeDelta).toBeGreaterThanOrEqual(
        shortestLongitudeSpan * MAP_REGION_SCALE - 1e-12,
      );
      expect(region.longitudeDelta).toBeLessThan(rawLongitudeSpan * MAP_REGION_SCALE);
    }
  });
});

describe('regionForPoints — 日付変更線（アンチメリディアン）の方針', () => {
  it('179.9° ↔ -179.9° は最短の 0.2° 幅を使い、中心は日付変更線上になる', () => {
    const region = regionOrThrow(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    );
    // 単純な |Δlon| = 359.8 ではなく最短経路 0.2 を採用する
    expect(region.longitudeDelta).toBeCloseTo(0.2 * MAP_REGION_SCALE, 12);
    // 中心は ±180（日付変更線）。正規化の一意性規則により 180 になる
    expect(Math.abs(region.longitude)).toBe(180);
    expect(region.latitude).toBe(0);
    expect(region.latitudeDelta).toBe(MAP_REGION_MIN_DELTA);
  });

  it('逆向き（-179.9° → 179.9°）でも同じ幅・同じ中心', () => {
    const forward = regionOrThrow(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    );
    const backward = regionOrThrow(
      { latitude: 0, longitude: -179.9 },
      { latitude: 0, longitude: 179.9 },
    );
    expect(backward.longitudeDelta).toBeCloseTo(forward.longitudeDelta, 12);
    expect(backward.longitude).toBeCloseTo(forward.longitude, 12);
  });

  it('日付変更線をまたぐ 2 点を領域内に含む', () => {
    const a: GeoPoint = { latitude: 10, longitude: 179.9 };
    const b: GeoPoint = { latitude: 11, longitude: -179.9 };
    const region = regionOrThrow(a, b);
    for (const point of [a, b]) {
      expect(Math.abs(point.latitude - region.latitude)).toBeLessThanOrEqual(
        region.latitudeDelta / 2 + 1e-12,
      );
      expect(circularLongitudeDiff(point.longitude, region.longitude)).toBeLessThanOrEqual(
        region.longitudeDelta / 2 + 1e-12,
      );
    }
  });

  it('|Δlon| <= 180 の通常ケースは差をそのまま使う（中心は算術中点）', () => {
    const region = regionOrThrow(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 179 },
    );
    expect(region.longitude).toBeCloseTo(89.5, 12);
    expect(region.longitudeDelta).toBeCloseTo(179 * MAP_REGION_SCALE, 12);
  });
});

describe('regionForPoints — E-12 不正座標', () => {
  const valid: GeoPoint = { latitude: 35.68, longitude: 139.76 };

  it('NaN / Infinity / 範囲外は null（throw しない）', () => {
    expect(regionForPoints({ latitude: NaN, longitude: 0 }, valid)).toBeNull();
    expect(regionForPoints(valid, { latitude: 0, longitude: Infinity })).toBeNull();
    expect(regionForPoints({ latitude: 91, longitude: 0 }, valid)).toBeNull();
    expect(regionForPoints(valid, { latitude: 0, longitude: -181 })).toBeNull();
    expect(regionForPoints({ latitude: -90.0001, longitude: 0 }, valid)).toBeNull();
  });

  it('境界値（±90 / ±180）は有効', () => {
    const region = regionForPoints({ latitude: 90, longitude: 180 }, { latitude: -90, longitude: -180 });
    expect(region).not.toBeNull();
    expect(Number.isFinite(region?.latitude)).toBe(true);
  });

  it('型不正（null / 欠損）でも throw せず null', () => {
    expect(regionForPoints(null as unknown as GeoPoint, valid)).toBeNull();
    expect(regionForPoints(valid, {} as unknown as GeoPoint)).toBeNull();
  });

  it('どの入力でも例外を投げない', () => {
    const inputs: readonly unknown[] = [null, undefined, 0, 'x', [], {}];
    for (const input of inputs) {
      expect(() =>
        regionForPoints(input as GeoPoint, input as GeoPoint),
      ).not.toThrow();
      expect(regionForPoints(input as GeoPoint, input as GeoPoint)).toBeNull();
    }
  });
});

describe('regionForPoints — 出力の健全性', () => {
  it('-0 を返さない', () => {
    const region = regionOrThrow({ latitude: -0, longitude: -0 }, { latitude: -0, longitude: -0 });
    expect(Object.is(region.latitude, -0)).toBe(false);
    expect(Object.is(region.longitude, -0)).toBe(false);
    expect(Object.is(region.latitudeDelta, -0)).toBe(false);
    expect(Object.is(region.longitudeDelta, -0)).toBe(false);
  });

  it('プロパティ: 乱数 500 ペアで 2 点を含み、幅は有限・非負・最小ズーム以上', () => {
    let state = 2_024_103_001;
    const next = (): number => {
      state = (1_664_525 * state + 1_013_904_223) % 4_294_967_296;
      return state / 4_294_967_296;
    };
    for (let index = 0; index < 500; index += 1) {
      const a: GeoPoint = { latitude: next() * 180 - 90, longitude: next() * 360 - 180 };
      const b: GeoPoint = { latitude: next() * 180 - 90, longitude: next() * 360 - 180 };
      const region = regionOrThrow(a, b);

      expect(Number.isFinite(region.latitude)).toBe(true);
      expect(Number.isFinite(region.longitude)).toBe(true);
      expect(region.latitude).toBeGreaterThanOrEqual(-90);
      expect(region.latitude).toBeLessThanOrEqual(90);
      expect(region.longitude).toBeGreaterThanOrEqual(-180);
      expect(region.longitude).toBeLessThanOrEqual(180);
      expect(region.latitudeDelta).toBeGreaterThanOrEqual(MAP_REGION_MIN_DELTA);
      expect(region.longitudeDelta).toBeGreaterThanOrEqual(MAP_REGION_MIN_DELTA);
      expect(Number.isFinite(region.latitudeDelta)).toBe(true);
      expect(Number.isFinite(region.longitudeDelta)).toBe(true);

      for (const point of [a, b]) {
        expect(Math.abs(point.latitude - region.latitude)).toBeLessThanOrEqual(
          region.latitudeDelta / 2 + 1e-9,
        );
        expect(circularLongitudeDiff(point.longitude, region.longitude)).toBeLessThanOrEqual(
          region.longitudeDelta / 2 + 1e-9,
        );
      }
    }
  });
});

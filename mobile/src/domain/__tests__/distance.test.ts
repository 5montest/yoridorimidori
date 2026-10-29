import { EARTH_RADIUS_M } from '../constants';
import { haversineDistanceM } from '../distance';
import type { GeoPoint } from '../types';

/** 東京駅（§10.6 の概値検証用）。 */
const TOKYO_STATION: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };
/** 新宿駅。 */
const SHINJUKU_STATION: GeoPoint = { latitude: 35.689592, longitude: 139.700413 };

function distanceOrThrow(a: GeoPoint, b: GeoPoint): number {
  const d = haversineDistanceM(a, b);
  if (d === null) {
    throw new Error('distance should be defined for valid points');
  }
  return d;
}

describe('haversineDistanceM — 既知値', () => {
  it('E-01: 同一地点は 0', () => {
    const p: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };
    expect(haversineDistanceM(p, p)).toBe(0);
  });

  it('赤道 1° ≈ 111,195.08 m（±1 m）', () => {
    const d = distanceOrThrow({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    expect(d).toBeGreaterThan(111_195.08 - 1);
    expect(d).toBeLessThan(111_195.08 + 1);
  });

  it('E-02: 対蹠点 ≈ π·R = 20,015,086.6 m（±1 m）で NaN なし', () => {
    const d = haversineDistanceM({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
    expect(d).not.toBeNull();
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(Math.PI * EARTH_RADIUS_M, 6);
    expect(Math.abs((d as number) - Math.PI * EARTH_RADIUS_M)).toBeLessThan(1);
  });

  it('E-03: 日付変更線をまたぐ 0.2° ≈ 22,239.02 m（±5 m）', () => {
    const d = distanceOrThrow({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 });
    expect(Math.abs(d - 22_239.02)).toBeLessThan(5);
  });

  it('E-04: 高緯度 ±89.9° でも有限値', () => {
    const d = haversineDistanceM({ latitude: 89.9, longitude: 0 }, { latitude: 89.9, longitude: 10 });
    expect(d).not.toBeNull();
    expect(Number.isFinite(d)).toBe(true);
    expect(d as number).toBeGreaterThan(0);
  });

  it('E-05: 極点を端点にしても距離は定義できる（有限値）', () => {
    const fromPole = haversineDistanceM({ latitude: 90, longitude: 0 }, { latitude: 0, longitude: 0 });
    const toPole = haversineDistanceM({ latitude: 0, longitude: 0 }, { latitude: -90, longitude: 0 });
    expect(fromPole).not.toBeNull();
    expect(toPole).not.toBeNull();
    expect(Number.isFinite(fromPole)).toBe(true);
    expect(Number.isFinite(toPole)).toBe(true);
    // 極点→赤道は地球 1/4 周
    expect(fromPole as number).toBeCloseTo((Math.PI * EARTH_RADIUS_M) / 2, 3);
  });

  it('東京駅〜新宿駅は約 6.1 km（6.1 ± 0.3 km の範囲検証）', () => {
    const d = distanceOrThrow(TOKYO_STATION, SHINJUKU_STATION);
    expect(d).toBeGreaterThan(6_100 - 300);
    expect(d).toBeLessThan(6_100 + 300);
  });
});

describe('haversineDistanceM — 性質', () => {
  it('可換性: d(a,b) と d(b,a) が一致する', () => {
    const pairs: readonly (readonly [GeoPoint, GeoPoint])[] = [
      [TOKYO_STATION, SHINJUKU_STATION],
      [{ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 }],
      [{ latitude: 89.9, longitude: 0 }, { latitude: 89.9, longitude: 10 }],
      [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }],
    ];
    for (const [a, b] of pairs) {
      const forward = haversineDistanceM(a, b);
      const backward = haversineDistanceM(b, a);
      expect(forward).not.toBeNull();
      expect(backward).not.toBeNull();
      expect(forward as number).toBeCloseTo(backward as number, 9);
    }
  });

  it('決定的な乱数 1,000 ペアで常に有限・非負（NaN / Infinity / -0 なし）', () => {
    // 自前 LCG（Math.random を使わない。決定論のため）
    let state = 987_654_321;
    const next = (): number => {
      state = (1_664_525 * state + 1_013_904_223) % 4_294_967_296;
      return state / 4_294_967_296;
    };
    for (let i = 0; i < 1_000; i += 1) {
      const a: GeoPoint = { latitude: next() * 180 - 90, longitude: next() * 360 - 180 };
      const b: GeoPoint = { latitude: next() * 180 - 90, longitude: next() * 360 - 180 };
      const d = haversineDistanceM(a, b);
      expect(d).not.toBeNull();
      expect(Number.isFinite(d)).toBe(true);
      expect(d as number).toBeGreaterThanOrEqual(0);
      expect(Object.is(d, -0)).toBe(false);
      expect(d as number).toBeLessThanOrEqual(Math.PI * EARTH_RADIUS_M + 1e-6);
    }
  });
});

describe('haversineDistanceM — E-12 不正入力', () => {
  const valid: GeoPoint = { latitude: 35.68, longitude: 139.76 };

  it('緯度 NaN / Infinity / 91 / 経度 -181 を含む入力は null', () => {
    expect(haversineDistanceM({ latitude: NaN, longitude: 139.76 }, valid)).toBeNull();
    expect(haversineDistanceM(valid, { latitude: Infinity, longitude: 139.76 })).toBeNull();
    expect(haversineDistanceM({ latitude: 91, longitude: 139.76 }, valid)).toBeNull();
    expect(haversineDistanceM(valid, { latitude: 35.68, longitude: -181 })).toBeNull();
    expect(haversineDistanceM({ latitude: -Infinity, longitude: 0 }, valid)).toBeNull();
    expect(haversineDistanceM({ latitude: 0, longitude: NaN }, valid)).toBeNull();
  });

  it('型不正（null / 欠損）でも throw せず null', () => {
    expect(haversineDistanceM(null as unknown as GeoPoint, valid)).toBeNull();
    expect(haversineDistanceM(valid, {} as unknown as GeoPoint)).toBeNull();
  });
});

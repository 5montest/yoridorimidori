import { initialBearingDeg, relativeBearingDeg } from '../bearing';
import type { GeoPoint } from '../types';

function bearingOrThrow(from: GeoPoint, to: GeoPoint): number {
  const b = initialBearingDeg(from, to);
  if (b === null) {
    throw new Error('bearing should be defined for these valid, distinct, non-polar points');
  }
  return b;
}

describe('initialBearingDeg — E-06 真北 / 南 / 東 / 西（赤道基準で厳密）', () => {
  // 赤道上の点なら initial bearing が 0 / 90 / 180 / 270 に厳密に一致する（§6.3 の注意）。
  const origin: GeoPoint = { latitude: 0, longitude: 0 };

  it('北 = 0°、東 = 90°、南 = 180°、西 = 270°', () => {
    expect(bearingOrThrow(origin, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 9);
    expect(bearingOrThrow(origin, { latitude: 0, longitude: 1 })).toBeCloseTo(90, 9);
    expect(bearingOrThrow(origin, { latitude: -1, longitude: 0 })).toBeCloseTo(180, 9);
    expect(bearingOrThrow(origin, { latitude: 0, longitude: -1 })).toBeCloseTo(270, 9);
  });

  it('真北は null ではなく 0（null と 0 を混同しない）', () => {
    const north = initialBearingDeg(origin, { latitude: 1, longitude: 0 });
    expect(north).not.toBeNull();
    expect(north).toBe(0);
  });
});

describe('initialBearingDeg — E-03 日付変更線', () => {
  it('(0,179.9) → (0,-179.9) は東（≈90°）で、東西を取り違えない', () => {
    const b = bearingOrThrow(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    );
    expect(b).toBeCloseTo(90, 6);
  });

  it('逆方向は西（≈270°）', () => {
    const b = bearingOrThrow(
      { latitude: 0, longitude: -179.9 },
      { latitude: 0, longitude: 179.9 },
    );
    expect(b).toBeCloseTo(270, 6);
  });
});

describe('initialBearingDeg — 中緯度', () => {
  it('同緯度を東へは 90° ± 1°（球面上では厳密に 90° にならない）', () => {
    const b = bearingOrThrow(
      { latitude: 35.68, longitude: 139.76 },
      { latitude: 35.68, longitude: 139.77 },
    );
    expect(Math.abs(b - 90)).toBeLessThan(1);
  });
});

describe('initialBearingDeg — E-01 同一地点', () => {
  it('同じ座標は null', () => {
    const p: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };
    expect(initialBearingDeg(p, p)).toBeNull();
  });

  it('距離が SAME_POINT_EPS_M（1 cm）未満なら null', () => {
    // 経度 1e-8 度 ≈ 0.0011 m < 1 cm
    expect(initialBearingDeg({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1e-8 })).toBeNull();
    // 緯度 1e-8 度 ≈ 0.0011 m < 1 cm
    expect(initialBearingDeg({ latitude: 0, longitude: 0 }, { latitude: 1e-8, longitude: 0 })).toBeNull();
  });
});

describe('initialBearingDeg — E-05 極点は方位不定（ADR-05）', () => {
  it('北極を始点 / 終点にすると null', () => {
    expect(initialBearingDeg({ latitude: 90, longitude: 0 }, { latitude: 0, longitude: 0 })).toBeNull();
    expect(initialBearingDeg({ latitude: 0, longitude: 0 }, { latitude: 90, longitude: 0 })).toBeNull();
  });

  it('南極も null', () => {
    expect(initialBearingDeg({ latitude: -90, longitude: 0 }, { latitude: 0, longitude: 0 })).toBeNull();
    expect(initialBearingDeg({ latitude: 0, longitude: 0 }, { latitude: -90, longitude: 0 })).toBeNull();
  });
});

describe('initialBearingDeg — E-02 / E-04 有限値', () => {
  it('E-02 対蹠点は 0 <= θ < 360 の有限値', () => {
    const b = initialBearingDeg({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
    expect(b).not.toBeNull();
    expect(Number.isFinite(b)).toBe(true);
    expect(b as number).toBeGreaterThanOrEqual(0);
    expect(b as number).toBeLessThan(360);
  });

  it('E-04 高緯度 ±89.9° は 0 <= θ < 360 の有限値', () => {
    const b = initialBearingDeg({ latitude: 89.9, longitude: 0 }, { latitude: 89.9, longitude: 10 });
    expect(b).not.toBeNull();
    expect(Number.isFinite(b)).toBe(true);
    expect(b as number).toBeGreaterThanOrEqual(0);
    expect(b as number).toBeLessThan(360);
  });
});

describe('initialBearingDeg — E-12 不正入力', () => {
  const valid: GeoPoint = { latitude: 35.68, longitude: 139.76 };

  it('NaN / Infinity / 範囲外は null（throw しない）', () => {
    expect(initialBearingDeg({ latitude: NaN, longitude: 0 }, valid)).toBeNull();
    expect(initialBearingDeg(valid, { latitude: Infinity, longitude: 0 })).toBeNull();
    expect(initialBearingDeg({ latitude: 91, longitude: 0 }, valid)).toBeNull();
    expect(initialBearingDeg(valid, { latitude: 0, longitude: -181 })).toBeNull();
    expect(initialBearingDeg({ latitude: 0, longitude: -Infinity }, valid)).toBeNull();
  });

  it('型不正（null / 欠損）でも throw せず null', () => {
    expect(initialBearingDeg(null as unknown as GeoPoint, valid)).toBeNull();
    expect(initialBearingDeg(valid, {} as unknown as GeoPoint)).toBeNull();
  });
});

describe('initialBearingDeg — プロパティ（乱数 1,000 件）', () => {
  it('常に [0, 360) に入る（決定的 LCG）', () => {
    let state = 2_468_013_579; // 自前 LCG（Math.random 不使用）
    const next = (): number => {
      state = (1_664_525 * state + 1_013_904_223) % 4_294_967_296;
      return state / 4_294_967_296;
    };
    for (let i = 0; i < 1_000; i += 1) {
      const from: GeoPoint = { latitude: next() * 170 - 85, longitude: next() * 360 - 180 };
      const to: GeoPoint = { latitude: next() * 170 - 85, longitude: next() * 360 - 180 };
      const b = initialBearingDeg(from, to);
      expect(b).not.toBeNull();
      expect(Number.isFinite(b)).toBe(true);
      expect(b as number).toBeGreaterThanOrEqual(0);
      expect(b as number).toBeLessThan(360);
    }
  });
});

describe('relativeBearingDeg — E-07 正規化 (-180, 180]', () => {
  it('境界と代表値', () => {
    expect(relativeBearingDeg(0, 180)).toBe(180);
    expect(relativeBearingDeg(0, -180)).toBe(180);
    expect(relativeBearingDeg(180, 0)).toBe(180);
    // 引数は (target, heading)。FR-05 の式 `normalize(targetBearing - heading)` に従う。
    // tasks.md T05 の `(359,1)=2` / `(1,359)=-2` は引数順が逆に読めるため、
    // 式どおりの値（(359,1) = -2、(1,359) = +2）をここで固定する。
    expect(relativeBearingDeg(359, 1)).toBe(-2);
    expect(relativeBearingDeg(1, 359)).toBe(2);
    expect(relativeBearingDeg(540, 0)).toBe(180);
    expect(relativeBearingDeg(0, 540)).toBe(180);
    expect(relativeBearingDeg(0, 0)).toBe(0);
    expect(Object.is(relativeBearingDeg(0, 0), -0)).toBe(false);
  });

  it('右 = +90 / 左 = -90（FR-06 の意味）', () => {
    expect(relativeBearingDeg(90, 0)).toBe(90);
    expect(relativeBearingDeg(270, 0)).toBe(-90);
    expect(relativeBearingDeg(0, 90)).toBe(-90);
  });

  it('非有限は null', () => {
    expect(relativeBearingDeg(NaN, 0)).toBeNull();
    expect(relativeBearingDeg(0, NaN)).toBeNull();
    expect(relativeBearingDeg(Infinity, 0)).toBeNull();
    expect(relativeBearingDeg(0, -Infinity)).toBeNull();
  });

  it('出力は常に (-180, 180]（乱数 10,000 件）', () => {
    let state = 135_791_357; // 自前 LCG
    const next = (): number => {
      state = (1_664_525 * state + 1_013_904_223) % 4_294_967_296;
      return state / 4_294_967_296;
    };
    for (let i = 0; i < 10_000; i += 1) {
      const target = (next() * 2 - 1) * 5_000;
      const heading = (next() * 2 - 1) * 5_000;
      const r = relativeBearingDeg(target, heading);
      expect(r).not.toBeNull();
      expect(r as number).toBeGreaterThan(-180);
      expect(r as number).toBeLessThanOrEqual(180);
    }
  });
});

import {
  normalizeDegrees360,
  normalizeSignedDegrees,
  toDegrees,
  toRadians,
} from '../normalize';

/**
 * 決定的な擬似乱数生成器（自前 LCG）。プロパティテストで Math.random を使わないため。
 * 係数は Numerical Recipes の LCG。state は 32bit 符号なしに保つので倍精度で正確に計算できる。
 */
function createLcg(seed: number): () => number {
  const LCG_A = 1_664_525;
  const LCG_C = 1_013_904_223;
  const LCG_M = 4_294_967_296;
  let state = seed >>> 0;
  return (): number => {
    state = (LCG_A * state + LCG_C) % LCG_M;
    return state / LCG_M; // [0, 1)
  };
}

/** [-range, range] の決定的な乱数配列を作る。 */
function makeAngles(count: number, range: number, seed: number): readonly number[] {
  const next = createLcg(seed);
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    values.push((next() * 2 - 1) * range);
  }
  return values;
}

describe('toRadians / toDegrees', () => {
  it('180° = π rad、π rad = 180°（相互変換）', () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI, 12);
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 12);
  });

  it('0 / 90 / 360 度の変換', () => {
    expect(toRadians(0)).toBe(0);
    expect(toRadians(90)).toBeCloseTo(Math.PI / 2, 12);
    expect(toDegrees(toRadians(45))).toBeCloseTo(45, 12);
    expect(toDegrees(0)).toBe(0);
  });
});

describe('normalizeDegrees360 — [0, 360)', () => {
  it('境界と代表値（E-07 の [0,360) 側）', () => {
    expect(normalizeDegrees360(0)).toBe(0);
    expect(normalizeDegrees360(-180)).toBe(180);
    expect(normalizeDegrees360(180)).toBe(180);
    expect(normalizeDegrees360(359.999)).toBe(359.999);
    expect(normalizeDegrees360(360)).toBe(0);
    expect(normalizeDegrees360(540)).toBe(180);
    expect(normalizeDegrees360(720)).toBe(0);
    expect(normalizeDegrees360(-1)).toBe(359);
    expect(normalizeDegrees360(-360)).toBe(0);
    expect(normalizeDegrees360(1080)).toBe(0);
  });

  it('-0 は 0 に正規化される（Object.is で -0 でないことを確認）', () => {
    const result = normalizeDegrees360(-0);
    expect(result).toBe(0);
    expect(Object.is(result, -0)).toBe(false);
  });

  it('非有限は NaN（throw しない）', () => {
    expect(normalizeDegrees360(NaN)).toBeNaN();
    expect(normalizeDegrees360(Infinity)).toBeNaN();
    expect(normalizeDegrees360(-Infinity)).toBeNaN();
  });

  it('出力は常に [0, 360) に入り、-0 を返さない（乱数 10,000 件）', () => {
    const angles = makeAngles(10_000, 5_000, 12_345);
    for (const deg of angles) {
      const r = normalizeDegrees360(deg);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(360);
      expect(Object.is(r, -0)).toBe(false);
      // 2 回適用と 1 回適用が一致する（冪等）
      expect(normalizeDegrees360(r)).toBe(r);
    }
  });
});

describe('normalizeSignedDegrees — (-180, 180]', () => {
  it('境界と代表値（E-07 の (-180,180] 側）', () => {
    expect(normalizeSignedDegrees(0)).toBe(0);
    expect(normalizeSignedDegrees(-180)).toBe(180); // -180 は 180 に寄せる（一意性）
    expect(normalizeSignedDegrees(180)).toBe(180);
    expect(normalizeSignedDegrees(359.999)).toBeCloseTo(-0.001, 9);
    expect(normalizeSignedDegrees(360)).toBe(0);
    expect(normalizeSignedDegrees(540)).toBe(180);
    expect(normalizeSignedDegrees(720)).toBe(0);
    expect(normalizeSignedDegrees(-1)).toBe(-1);
    expect(normalizeSignedDegrees(-540)).toBe(180);
    expect(normalizeSignedDegrees(180.0001)).toBeCloseTo(-179.9999, 9);
  });

  it('-0 は 0 に正規化される', () => {
    const result = normalizeSignedDegrees(-0);
    expect(result).toBe(0);
    expect(Object.is(result, -0)).toBe(false);
  });

  it('非有限は NaN（throw しない）', () => {
    expect(normalizeSignedDegrees(NaN)).toBeNaN();
    expect(normalizeSignedDegrees(Infinity)).toBeNaN();
    expect(normalizeSignedDegrees(-Infinity)).toBeNaN();
  });

  it('出力は常に (-180, 180] に入り、2 回適用と 1 回適用が一致する（乱数 10,000 件）', () => {
    const angles = makeAngles(10_000, 5_000, 678_901);
    for (const deg of angles) {
      const r = normalizeSignedDegrees(deg);
      expect(r).toBeGreaterThan(-180);
      expect(r).toBeLessThanOrEqual(180);
      expect(Object.is(r, -0)).toBe(false);
      expect(normalizeSignedDegrees(r)).toBe(r); // 冪等
    }
  });
});

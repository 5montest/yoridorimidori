import { normalizeDegrees360, normalizeSignedDegrees } from '../normalize';
import { nextContinuousAngleDeg, reduceContinuousAngle } from '../rotation';

/** 角度の円周上の差（ラップを考慮した絶対差）。 */
function circularDiffDeg(a: number, b: number): number {
  return Math.abs(normalizeSignedDegrees(a - b));
}

/** 決定的な擬似乱数生成器（自前 LCG。Math.random を使わない）。 */
function createLcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (1_664_525 * state + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

describe('nextContinuousAngleDeg — E-14 最短経路', () => {
  it('359° → 1° は +2°（361°）で、-358° の逆回転をしない', () => {
    expect(nextContinuousAngleDeg(359, 1)).toBe(361);
  });

  it('1° → 359° は -2°（-1°）', () => {
    expect(nextContinuousAngleDeg(1, 359)).toBe(-1);
  });

  it('0° → 180° / 0° → -180° はいずれも +180°（一意性規則）', () => {
    expect(nextContinuousAngleDeg(0, 180)).toBe(180);
    expect(nextContinuousAngleDeg(0, -180)).toBe(180);
  });

  it('同じ角度なら変化しない', () => {
    expect(nextContinuousAngleDeg(0, 0)).toBe(0);
    expect(nextContinuousAngleDeg(90, 90)).toBe(90);
    expect(nextContinuousAngleDeg(-90, -90)).toBe(-90);
  });

  it('ニュートラル（目標 0°）へは最短経路で戻る', () => {
    expect(nextContinuousAngleDeg(10, 0)).toBe(0);
    expect(nextContinuousAngleDeg(-10, 0)).toBe(0);
    expect(nextContinuousAngleDeg(359, 0)).toBe(360); // +1（見た目は 0°。逆回転しない）
    expect(nextContinuousAngleDeg(1, 0)).toBe(0); // -1
  });

  it('-0 を返さない', () => {
    const result = nextContinuousAngleDeg(-0, 0);
    expect(result).toBe(0);
    expect(Object.is(result, -0)).toBe(false);
  });

  it('累積値（360 を超えた値）からでも見た目どおりに向く', () => {
    expect(nextContinuousAngleDeg(361, 1)).toBe(361);
    expect(nextContinuousAngleDeg(361, 3)).toBe(363);
    expect(nextContinuousAngleDeg(-359, 1)).toBe(-359); // 見た目 1° なので変化なし
  });
});

describe('nextContinuousAngleDeg — 非有限の防御', () => {
  it('prev が NaN なら NaN を返す（prev をそのまま返す仕様。Number.isNaN で確認）', () => {
    const result = nextContinuousAngleDeg(NaN, 10);
    expect(Number.isNaN(result)).toBe(true);
  });

  it('target が NaN なら prev を返す', () => {
    expect(nextContinuousAngleDeg(45, NaN)).toBe(45);
  });

  it('Infinity は prev を返す / prev が Infinity なら Infinity を返す', () => {
    expect(nextContinuousAngleDeg(45, Infinity)).toBe(45);
    expect(nextContinuousAngleDeg(Infinity, 10)).toBe(Infinity);
  });
});

describe('nextContinuousAngleDeg — プロパティ（乱数 1,000 件）', () => {
  it('見た目が目標と一致し、|結果 − prev| <= 180（最短経路）', () => {
    const next = createLcg(31_415_926);
    for (let i = 0; i < 1_000; i += 1) {
      const prev = (next() * 2 - 1) * 720;
      const target = (next() * 2 - 1) * 180;
      const result = nextContinuousAngleDeg(prev, target);

      // 見た目の一致（360° のラップを考慮して比較）
      expect(circularDiffDeg(normalizeDegrees360(result), normalizeDegrees360(target))).toBeLessThan(1e-9);
      // 最短経路（1e-9 は浮動小数の加算誤差の許容）
      expect(Math.abs(result - prev)).toBeLessThanOrEqual(180 + 1e-9);
    }
  });
});

describe('reduceContinuousAngle', () => {
  it('±720° 以内なら変化しない', () => {
    expect(reduceContinuousAngle(700)).toBe(700);
    expect(reduceContinuousAngle(-700)).toBe(-700);
    expect(reduceContinuousAngle(720)).toBe(720);
    expect(reduceContinuousAngle(-720)).toBe(-720);
    expect(reduceContinuousAngle(0)).toBe(0);
  });

  it('1080° は <= 720 に収まり、見た目は 1080 % 360 と一致する', () => {
    const reduced = reduceContinuousAngle(1_080);
    expect(reduced).toBeLessThanOrEqual(720);
    expect(circularDiffDeg(normalizeDegrees360(reduced), normalizeDegrees360(1_080))).toBeLessThan(1e-9);
  });

  it('-1080° は >= -720 に収まり、見た目が一致する', () => {
    const reduced = reduceContinuousAngle(-1_080);
    expect(reduced).toBeGreaterThanOrEqual(-720);
    expect(circularDiffDeg(normalizeDegrees360(reduced), normalizeDegrees360(-1_080))).toBeLessThan(1e-9);
  });

  it('NaN / Infinity は 0', () => {
    expect(reduceContinuousAngle(NaN)).toBe(0);
    expect(reduceContinuousAngle(Infinity)).toBe(0);
    expect(reduceContinuousAngle(-Infinity)).toBe(0);
  });

  it('-0 を返さない', () => {
    const result = reduceContinuousAngle(-0);
    expect(Object.is(result, -0)).toBe(false);
  });

  it('maxAbs を指定できる（360 未満に収める）', () => {
    expect(Math.abs(reduceContinuousAngle(1_080, 359))).toBeLessThanOrEqual(359);
    expect(Math.abs(reduceContinuousAngle(-1_080, 359))).toBeLessThanOrEqual(359);
  });

  it('不正な maxAbs（0 以下・非有限）でも無限ループせず既定 720 として扱う', () => {
    expect(reduceContinuousAngle(1_080, 0)).toBe(720);
    expect(reduceContinuousAngle(1_080, -100)).toBe(720);
    expect(reduceContinuousAngle(1_080, NaN)).toBe(720);
    expect(reduceContinuousAngle(1_080, Infinity)).toBe(720);
  });

  it('冪等（2 回適用しても同じ）かつ |結果| <= 720（乱数 1,000 件）', () => {
    const next = createLcg(27_182_818);
    for (let i = 0; i < 1_000; i += 1) {
      const value = (next() * 2 - 1) * 10_000;
      const reduced = reduceContinuousAngle(value);
      expect(Math.abs(reduced)).toBeLessThanOrEqual(720);
      expect(circularDiffDeg(normalizeDegrees360(reduced), normalizeDegrees360(value))).toBeLessThan(1e-9);
      expect(reduceContinuousAngle(reduced)).toBe(reduced);
    }
  });
});

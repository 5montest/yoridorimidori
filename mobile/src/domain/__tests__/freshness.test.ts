import { DEFAULT_THRESHOLDS, type Thresholds } from '../constants';
import { classifyFreshness, elapsedMs } from '../freshness';

/** カスタム閾値（既定 3s/10s/30s を 1s/2s/3s に狭める）。閾値注入が効くことの検証用。 */
const TIGHT: Thresholds = {
  ...DEFAULT_THRESHOLDS,
  freshness: { freshMaxMs: 1_000, agingMaxMs: 2_000, staleMaxMs: 3_000 },
};

describe('classifyFreshness — 9 点の境界（E-10 / FR-08）', () => {
  it.each([
    [2_999, 'fresh'],
    [3_000, 'fresh'],
    [3_001, 'aging'],
    [9_999, 'aging'],
    [10_000, 'aging'],
    [10_001, 'stale'],
    [29_999, 'stale'],
    [30_000, 'stale'], // E-10: 30 秒ちょうどは stale（30 秒「超」が lost）
    [30_001, 'lost'],
  ] as const)('経過 %i ms → %s', (ageMs, expected) => {
    expect(classifyFreshness(ageMs, DEFAULT_THRESHOLDS)).toBe(expected);
  });

  it('既定引数（Thresholds 省略時）は DEFAULT_THRESHOLDS を使う', () => {
    expect(classifyFreshness(3_000)).toBe('fresh');
    expect(classifyFreshness(30_001)).toBe('lost');
  });

  it('null（未取得）は null', () => {
    expect(classifyFreshness(null)).toBeNull();
  });

  it('0 と負値は fresh（防御。0 未満は elapsedMs で 0 に丸める前提）', () => {
    expect(classifyFreshness(0)).toBe('fresh');
    expect(classifyFreshness(-1)).toBe('fresh');
  });

  it('非有限（NaN / Infinity）は null（防御）', () => {
    expect(classifyFreshness(NaN)).toBeNull();
    expect(classifyFreshness(Infinity)).toBeNull();
  });

  it('カスタム Thresholds で境界が動く', () => {
    expect(classifyFreshness(1_000, TIGHT)).toBe('fresh');
    expect(classifyFreshness(1_001, TIGHT)).toBe('aging');
    expect(classifyFreshness(2_000, TIGHT)).toBe('aging');
    expect(classifyFreshness(2_001, TIGHT)).toBe('stale');
    expect(classifyFreshness(3_000, TIGHT)).toBe('stale');
    expect(classifyFreshness(3_001, TIGHT)).toBe('lost');
  });
});

describe('elapsedMs — E-11 タイムスタンプ逆転と防御', () => {
  it('通常の差分', () => {
    expect(elapsedMs(5_000, 1_000)).toBe(4_000);
    expect(elapsedMs(1_000, 1_000)).toBe(0);
  });

  it('逆転（now < updated）は 0 に丸める（負にしない）', () => {
    expect(elapsedMs(1_000, 2_000)).toBe(0);
    expect(elapsedMs(0, 30_000)).toBe(0);
  });

  it('NaN / Infinity が混じったら 0', () => {
    expect(elapsedMs(NaN, 100)).toBe(0);
    expect(elapsedMs(100, NaN)).toBe(0);
    expect(elapsedMs(Infinity, 0)).toBe(0);
    expect(elapsedMs(0, Infinity)).toBe(0);
  });

  it('-0 を返さない', () => {
    const result = elapsedMs(1_000, 1_000);
    expect(result).toBe(0);
    expect(Object.is(result, -0)).toBe(false);
  });

  it('任意の入力で結果は常に有限・非負', () => {
    const pairs: readonly (readonly [number, number])[] = [
      [0, 0],
      [-5, -10],
      [-10, -5],
      [1e15, 1],
      [1, 1e15],
      [Number.MAX_SAFE_INTEGER, 0],
    ];
    for (const [now, updated] of pairs) {
      const e = elapsedMs(now, updated);
      expect(Number.isFinite(e)).toBe(true);
      expect(e).toBeGreaterThanOrEqual(0);
    }
  });
});

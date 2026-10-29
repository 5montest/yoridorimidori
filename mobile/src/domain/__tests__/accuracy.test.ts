import { classifyGpsAccuracy, classifyHeadingAccuracy } from '../accuracy';
import { DEFAULT_THRESHOLDS, type Thresholds } from '../constants';
import type { HeadingAccuracyLevel } from '../types';

/** カスタム閾値（既定 10/30 m を 5/15 m に狭める）。 */
const TIGHT: Thresholds = {
  ...DEFAULT_THRESHOLDS,
  gpsAccuracy: { goodMaxM: 5, fairMaxM: 15 },
};

/** 0〜3 以外の数値を「ライブラリから来た不正値」として渡すためのキャスト。 */
function asLevel(value: number): HeadingAccuracyLevel {
  return value as unknown as HeadingAccuracyLevel;
}

describe('classifyHeadingAccuracy — E-09（0〜3）', () => {
  it('3=good / 2=fair / 1=poor / 0=uncalibrated', () => {
    expect(classifyHeadingAccuracy(3)).toBe('good');
    expect(classifyHeadingAccuracy(2)).toBe('fair');
    expect(classifyHeadingAccuracy(1)).toBe('poor');
    expect(classifyHeadingAccuracy(0)).toBe('uncalibrated');
  });

  it('0（uncalibrated）と null（unknown）を区別する', () => {
    expect(classifyHeadingAccuracy(0)).toBe('uncalibrated');
    expect(classifyHeadingAccuracy(null)).toBe('unknown');
  });

  it('0〜3 以外の数値は unknown（4 / -1 / 1.5 / NaN / Infinity）', () => {
    expect(classifyHeadingAccuracy(asLevel(4))).toBe('unknown');
    expect(classifyHeadingAccuracy(asLevel(-1))).toBe('unknown');
    expect(classifyHeadingAccuracy(asLevel(1.5))).toBe('unknown');
    expect(classifyHeadingAccuracy(asLevel(NaN))).toBe('unknown');
    expect(classifyHeadingAccuracy(asLevel(Infinity))).toBe('unknown');
  });
});

describe('classifyGpsAccuracy — 6 点の境界（FR-08 / D-08）', () => {
  it.each([
    [null, 'unknown'],
    [0, 'unknown'], // ADR-01: 0 は「未取得」と区別できないため unknown
    [0.5, 'good'],
    [10, 'good'],
    [10.001, 'fair'],
    [30, 'fair'],
    [30.001, 'poor'],
    [-1, 'unknown'],
    [NaN, 'unknown'],
    [Infinity, 'unknown'],
  ] as const)('精度 %s m → %s', (accuracyM, expected) => {
    expect(classifyGpsAccuracy(accuracyM, DEFAULT_THRESHOLDS)).toBe(expected);
  });

  it('既定引数（Thresholds 省略時）は DEFAULT_THRESHOLDS を使う', () => {
    expect(classifyGpsAccuracy(10)).toBe('good');
    expect(classifyGpsAccuracy(30)).toBe('fair');
  });

  it('カスタム Thresholds で境界が動く', () => {
    expect(classifyGpsAccuracy(5, TIGHT)).toBe('good');
    expect(classifyGpsAccuracy(5.001, TIGHT)).toBe('fair');
    expect(classifyGpsAccuracy(15, TIGHT)).toBe('fair');
    expect(classifyGpsAccuracy(15.001, TIGHT)).toBe('poor');
  });

  it('区分は GPS 4 種・方位 5 種のいずれか（未知の値を返さない）', () => {
    const gpsValues = [null, 0, 1, 10, 20, 30, 31, -5, NaN];
    for (const value of gpsValues) {
      expect(['good', 'fair', 'poor', 'unknown']).toContain(classifyGpsAccuracy(value));
    }
    const headingValues = [null, 0, 1, 2, 3, 4, -1, 1.5, NaN];
    for (const value of headingValues) {
      expect(['good', 'fair', 'poor', 'uncalibrated', 'unknown']).toContain(
        classifyHeadingAccuracy(value === null ? null : asLevel(value)),
      );
    }
  });
});

import { formatAgeMs, formatBearingDeg, formatDistanceM } from '../format';

describe('formatDistanceM — E-13 距離の丸め', () => {
  it.each([
    [null, '—'],
    [0, '0 m'],
    [0.4, '0 m'],
    [999.4, '999 m'],
    [999.5, '1000 m'], // 生値 < 1000 なので m 表記のまま四捨五入
    [999.6, '1000 m'], // E-13 の確定値（生値で閾値判定する）
    [999.999, '1000 m'],
    [1_000, '1.00 km'], // 1,000 以上は km（小数 2 桁）
    [1_234.567, '1.23 km'],
    [1_500, '1.50 km'],
    [10_000, '10.00 km'],
  ] as const)('%s m → %s', (input, expected) => {
    expect(formatDistanceM(input)).toBe(expected);
  });

  it('null / 負値 / 非有限は「—」（throw しない）', () => {
    expect(formatDistanceM(null)).toBe('—');
    expect(formatDistanceM(-1)).toBe('—');
    expect(formatDistanceM(-0.001)).toBe('—');
    expect(formatDistanceM(NaN)).toBe('—');
    expect(formatDistanceM(Infinity)).toBe('—');
    expect(formatDistanceM(-Infinity)).toBe('—');
  });

  it('-0 は 0 m として扱う', () => {
    expect(formatDistanceM(-0)).toBe('0 m');
  });
});

describe('formatAgeMs — 経過時間（秒）', () => {
  it.each([
    [0, '0 秒'],
    [499, '0 秒'],
    [500, '1 秒'],
    [1_000, '1 秒'],
    [1_499, '1 秒'],
    [1_500, '2 秒'],
    [12_000, '12 秒'],
    [12_500, '13 秒'],
    [30_001, '30 秒'],
  ] as const)('%s ms → %s', (input, expected) => {
    expect(formatAgeMs(input)).toBe(expected);
  });

  it('null / 負値 / 非有限は「—」', () => {
    expect(formatAgeMs(null)).toBe('—');
    expect(formatAgeMs(-1)).toBe('—');
    expect(formatAgeMs(NaN)).toBe('—');
    expect(formatAgeMs(Infinity)).toBe('—');
    expect(formatAgeMs(-Infinity)).toBe('—');
  });
});

describe('formatBearingDeg — 方位（整数・360 を出さない）', () => {
  it.each([
    [0, '0°'],
    [123.4, '123°'],
    [123.5, '124°'],
    [359.4, '359°'],
    [359.6, '0°'], // 丸め後 360 になるため 0 に戻す
    [360, '0°'],
    [720, '0°'],
    [-1, '359°'],
    [-180, '180°'],
    [180, '180°'],
    [540, '180°'],
  ] as const)('%s° → %s', (input, expected) => {
    expect(formatBearingDeg(input)).toBe(expected);
  });

  it('-0 は 0° として扱う', () => {
    expect(formatBearingDeg(-0)).toBe('0°');
  });

  it('null / 非有限は「—」', () => {
    expect(formatBearingDeg(null)).toBe('—');
    expect(formatBearingDeg(NaN)).toBe('—');
    expect(formatBearingDeg(Infinity)).toBe('—');
    expect(formatBearingDeg(-Infinity)).toBe('—');
  });
});

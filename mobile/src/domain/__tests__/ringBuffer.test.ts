import { ringPush, ringTrim } from '../ringBuffer';

describe('ringPush — FR-09 上限', () => {
  it('300 件で満杯になり、301 件目で先頭（最古）が落ちる', () => {
    let buffer: readonly number[] = [];
    for (let i = 0; i < 300; i += 1) {
      buffer = ringPush(buffer, i, 300);
    }
    expect(buffer).toHaveLength(300);
    expect(buffer[0]).toBe(0);
    expect(buffer[299]).toBe(299);

    buffer = ringPush(buffer, 300, 300);
    expect(buffer).toHaveLength(300);
    expect(buffer[0]).toBe(1); // 先頭（0）が落ちる
    expect(buffer[299]).toBe(300);
  });

  it('capacity = 1 は最新 1 件のみ', () => {
    let buffer: readonly number[] = [];
    buffer = ringPush(buffer, 1, 1);
    buffer = ringPush(buffer, 2, 1);
    expect(buffer).toEqual([2]);
  });

  it('capacity < 1 は空配列（0 / -1 / 0.5）', () => {
    expect(ringPush([1, 2, 3], 4, 0)).toEqual([]);
    expect(ringPush([1, 2, 3], 4, -1)).toEqual([]);
    expect(ringPush([1, 2, 3], 4, 0.5)).toEqual([]); // Math.floor(0.5) = 0
  });

  it('小数容量は Math.floor される（2.9 → 2）', () => {
    expect(ringPush([1, 2], 3, 2.9)).toEqual([2, 3]);
  });

  it('非有限の容量は空配列（防御）', () => {
    expect(ringPush([1], 2, NaN)).toEqual([]);
    expect(ringPush([1], 2, Infinity)).toEqual([]);
  });

  it('空配列への push', () => {
    expect(ringPush([], 'a', 3)).toEqual(['a']);
    expect(ringPush<number>([], 0, 3)).toEqual([0]);
  });

  it('元配列を変更しない（参照も新規）', () => {
    const original: readonly number[] = [1, 2, 3];
    const snapshot = [...original];
    const pushed = ringPush(original, 4, 3);
    expect(original).toEqual(snapshot);
    expect(pushed).not.toBe(original);
    expect(pushed).toEqual([2, 3, 4]);
  });
});

describe('ringTrim — 古いものを捨てる', () => {
  it('容量超過なら新しい方を残す', () => {
    expect(ringTrim([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });

  it('容量以内ならそのまま（新しい配列を返す）', () => {
    const original: readonly number[] = [1, 2];
    const trimmed = ringTrim(original, 3);
    expect(trimmed).toEqual([1, 2]);
    expect(trimmed).not.toBe(original);
    expect(original).toEqual([1, 2]);
  });

  it('空配列は空配列', () => {
    expect(ringTrim([], 5)).toEqual([]);
  });

  it('capacity < 1 は空配列 / 小数は floor', () => {
    expect(ringTrim([1, 2, 3], 0)).toEqual([]);
    expect(ringTrim([1, 2, 3], -2)).toEqual([]);
    expect(ringTrim([1, 2, 3], 2.9)).toEqual([2, 3]);
  });

  it('非有限の容量は空配列（防御）', () => {
    expect(ringTrim([1, 2], NaN)).toEqual([]);
    expect(ringTrim([1, 2], Infinity)).toEqual([]);
  });

  it('300 件の上限で最新 300 件に収まる', () => {
    const values = Array.from({ length: 305 }, (_, index) => index);
    const trimmed = ringTrim(values, 300);
    expect(trimmed).toHaveLength(300);
    expect(trimmed[0]).toBe(5);
    expect(trimmed[299]).toBe(304);
  });
});

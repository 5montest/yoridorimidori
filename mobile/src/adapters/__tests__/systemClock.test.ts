import { SystemClock } from '../clock/SystemClock';

describe('SystemClock — 単調時計', () => {
  it('注入した perfNow の値がそのまま返る', () => {
    const clock = new SystemClock({ perfNow: () => 500, epochNow: () => 1_000 });
    expect(clock.nowMonotonicMs()).toBe(500);
  });

  it('perfNow が巻き戻っても max() で単調性を保つ', () => {
    let now = 1_000;
    const clock = new SystemClock({ perfNow: () => now, epochNow: () => 0 });
    expect(clock.nowMonotonicMs()).toBe(1_000);
    now = 700; // 巻き戻り
    expect(clock.nowMonotonicMs()).toBe(1_000);
    now = 1_200;
    expect(clock.nowMonotonicMs()).toBe(1_200);
  });

  it('perfNow: null なら epochNow にフォールバックし、戻っても単調', () => {
    let wall = 10_000;
    const clock = new SystemClock({ perfNow: null, epochNow: () => wall });
    expect(clock.nowMonotonicMs()).toBe(10_000);
    wall = 9_000; // NTP などで壁時計が戻る
    expect(clock.nowMonotonicMs()).toBe(10_000);
    wall = 10_500;
    expect(clock.nowMonotonicMs()).toBe(10_500);
  });

  it('nowEpochMs は注入した epochNow を返す（単調性の影響を受けない）', () => {
    let wall = 1_700_000_000_000;
    const clock = new SystemClock({ perfNow: () => 100, epochNow: () => wall });
    expect(clock.nowEpochMs()).toBe(1_700_000_000_000);
    wall = 1_699_000_000_000; // 壁時計は戻りうる
    expect(clock.nowEpochMs()).toBe(1_699_000_000_000);
    expect(clock.nowMonotonicMs()).toBe(100); // 単調時計は影響を受けない
  });

  it('非有限の perfNow 値は前回値を返す（データモデルを汚さない）', () => {
    let value = 42;
    const clock = new SystemClock({ perfNow: () => value, epochNow: () => 0 });
    expect(clock.nowMonotonicMs()).toBe(42);
    value = NaN;
    expect(clock.nowMonotonicMs()).toBe(42);
    value = Infinity;
    expect(clock.nowMonotonicMs()).toBe(42);
  });

  it('機能検出（既定オプション）でも有限・非減少の値を返す', () => {
    const clock = new SystemClock();
    const first = clock.nowMonotonicMs();
    const second = clock.nowMonotonicMs();
    expect(Number.isFinite(first)).toBe(true);
    expect(Number.isFinite(second)).toBe(true);
    expect(second).toBeGreaterThanOrEqual(first);
    expect(Number.isFinite(clock.nowEpochMs())).toBe(true);
  });
});

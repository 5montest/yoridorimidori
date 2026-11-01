import {
  createHeadingFilterState,
  filterHeadingSample,
  shortestAngleDelta,
  type HeadingFilterState,
} from '../headingFilter';
import type { HeadingFix } from '../types';

const EPOCH = 1_700_000_000_000;

function heading(
  headingDeg: number | null,
  accuracy: HeadingFix['accuracy'] = 3,
  receivedAtMonotonicMs = 0,
  reference: HeadingFix['reference'] = 'true-north',
): HeadingFix {
  return {
    headingDeg,
    reference,
    accuracy,
    receivedAtMonotonicMs,
    receivedAtEpochMs: EPOCH,
    source: 'mock',
  };
}

/** 指定回数サンプルを流して最終結果を返す。 */
function run(
  state: HeadingFilterState,
  samples: readonly HeadingFix[],
): ReturnType<typeof filterHeadingSample> {
  let current = state;
  let result = filterHeadingSample(current, { reading: samples[0]!, nowMonotonicMs: 0 });
  for (const sample of samples.slice(1)) {
    result = filterHeadingSample(result.state, {
      reading: sample,
      nowMonotonicMs: sample.receivedAtMonotonicMs,
    });
    current = result.state;
  }
  return result;
}

describe('shortestAngleDelta', () => {
  it('0°/360° をまたいでも最短角差を返す', () => {
    expect(shortestAngleDelta(10, 350)).toBe(20);
    expect(shortestAngleDelta(350, 10)).toBe(-20);
    expect(shortestAngleDelta(180, 0)).toBe(180);
    expect(shortestAngleDelta(0, 180)).toBe(180);
  });
});

describe('filterHeadingSample — 平滑化', () => {
  it('初回はそのまま採用する', () => {
    const result = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(30, 3, 0),
      nowMonotonicMs: 0,
    });
    expect(result.decision).toBe('accepted');
    expect(result.valueDeg).toBeCloseTo(30, 6);
    expect(result.acceptedFix?.headingDeg).toBeCloseTo(30, 6);
  });

  it('小さな変化は指数移動平均で平滑化する（円周対応）', () => {
    const first = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(350, 3, 0),
      nowMonotonicMs: 0,
    });
    const second = filterHeadingSample(first.state, {
      reading: heading(10, 3, 100),
      nowMonotonicMs: 100,
    });
    // delta = +20, alpha = 1 - exp(-100/500) ≈ 0.1813 → 350 + 3.63 ≈ 353.6
    expect(second.decision).toBe('smoothed');
    expect(second.valueDeg).toBeCloseTo(353.63, 1);
  });

  it('同じ向きの連続ではほぼその向きに収束する', () => {
    let result = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(0, 3, 0),
      nowMonotonicMs: 0,
    });
    for (let index = 1; index <= 20; index += 1) {
      result = filterHeadingSample(result.state, {
        reading: heading(90, 3, index * 100),
        nowMonotonicMs: index * 100,
      });
    }
    expect(result.valueDeg).toBeCloseTo(90, 0);
  });
});

describe('filterHeadingSample — 外れ値の一時保持', () => {
  it('急な大ジャンプは保持し、前回値を表示する', () => {
    const first = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(0, 3, 0),
      nowMonotonicMs: 0,
    });
    const second = filterHeadingSample(first.state, {
      reading: heading(180, 3, 200),
      nowMonotonicMs: 200,
    });
    expect(second.decision).toBe('held');
    expect(second.mode).toBe('transient');
    expect(second.valueDeg).toBe(0);
    expect(second.acceptedFix).toBeNull();
    // 保持中は「採用時刻」を更新しない（古い値を新しく見せない）。
    expect(second.state.lastAcceptedAtMonotonicMs).toBe(0);
  });

  it('同じ新しい向きが連続したら実回転として採用する', () => {
    let result = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(0, 3, 0),
      nowMonotonicMs: 0,
    });
    result = filterHeadingSample(result.state, {
      reading: heading(180, 3, 100),
      nowMonotonicMs: 100,
    });
    expect(result.decision).toBe('held');
    result = filterHeadingSample(result.state, {
      reading: heading(180, 3, 200),
      nowMonotonicMs: 200,
    });
    expect(result.decision).toBe('held');
    result = filterHeadingSample(result.state, {
      reading: heading(180, 3, 300),
      nowMonotonicMs: 300,
    });
    expect(result.decision).toBe('accepted');
    expect(result.valueDeg).toBe(180);
  });

  it('時間が空いた後のジャンプは平滑化せず採用する（再初期化）', () => {
    const first = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(0, 3, 0),
      nowMonotonicMs: 0,
    });
    const second = filterHeadingSample(first.state, {
      reading: heading(180, 3, 5_000),
      nowMonotonicMs: 5_000,
    });
    expect(second.decision).toBe('accepted');
    expect(second.valueDeg).toBe(180);
  });
});

describe('filterHeadingSample — 低精度・不明', () => {
  it('精度 1 は採用せず保持する', () => {
    const first = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(0, 3, 0),
      nowMonotonicMs: 0,
    });
    const second = filterHeadingSample(first.state, {
      reading: heading(45, 1, 100),
      nowMonotonicMs: 100,
    });
    expect(second.decision).toBe('held');
    expect(second.valueDeg).toBe(0);
    expect(second.reason).toBe('heading-low-accuracy');
  });

  it('保持時間を超えたら unavailable（値は出さない）', () => {
    const first = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(0, 3, 0),
      nowMonotonicMs: 0,
    });
    const second = filterHeadingSample(first.state, {
      reading: heading(null, null, 10_000),
      nowMonotonicMs: 10_000,
    });
    expect(second.mode).toBe('unavailable');
    expect(second.valueDeg).toBeNull();
    expect(second.acceptedFix).toBeNull();
  });

  it('unavailable からは連続妥当で normal に戻る（ヒステリシス）', () => {
    let result = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(0, 3, 0),
      nowMonotonicMs: 0,
    });
    result = filterHeadingSample(result.state, {
      reading: heading(null, null, 10_000),
      nowMonotonicMs: 10_000,
    });
    expect(result.mode).toBe('unavailable');

    result = filterHeadingSample(result.state, {
      reading: heading(10, 3, 10_100),
      nowMonotonicMs: 10_100,
    });
    expect(result.mode).toBe('unavailable');
    result = filterHeadingSample(result.state, {
      reading: heading(10, 3, 10_200),
      nowMonotonicMs: 10_200,
    });
    expect(result.mode).toBe('unavailable');
    result = filterHeadingSample(result.state, {
      reading: heading(10, 3, 10_300),
      nowMonotonicMs: 10_300,
    });
    expect(result.mode).toBe('normal');
  });
});

describe('filterHeadingSample — 基準の変更', () => {
  it('真北→磁北に変わったら平滑化をやり直す（混ぜない）', () => {
    const first = filterHeadingSample(createHeadingFilterState(), {
      reading: heading(0, 3, 0, 'true-north'),
      nowMonotonicMs: 0,
    });
    const second = filterHeadingSample(first.state, {
      reading: heading(90, 3, 100, 'magnetic-north'),
      nowMonotonicMs: 100,
    });
    expect(second.decision).toBe('accepted');
    expect(second.reason).toBe('reference-changed');
    expect(second.valueDeg).toBe(90);
  });
});

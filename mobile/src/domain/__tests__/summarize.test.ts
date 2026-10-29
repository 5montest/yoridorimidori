import { DEFAULT_THRESHOLDS, type Thresholds } from '../constants';
import { summarizeSamples } from '../summarize';
import type { HeadingAccuracyLevel, SampleLogEntry } from '../types';

interface SampleOptions {
  readonly gpsAccuracyM?: number | null;
  readonly headingAccuracy?: HeadingAccuracyLevel | null;
  readonly locationAgeMs?: number;
}

function makeSample(options: SampleOptions = {}): SampleLogEntry {
  return {
    recordedAtEpochMs: 1_700_000_000_000,
    latitude: 35.68,
    longitude: 139.76,
    gpsAccuracyM: options.gpsAccuracyM === undefined ? 8 : options.gpsAccuracyM,
    headingDeg: 90,
    headingReference: 'true-north',
    headingAccuracy: options.headingAccuracy === undefined ? 3 : options.headingAccuracy,
    locationAgeMs: options.locationAgeMs ?? 0,
    headingAgeMs: 0,
  };
}

describe('summarizeSamples — 空配列', () => {
  it('平均 null・分布 [0,0,0,0]・古い率 null', () => {
    const summary = summarizeSamples([]);
    expect(summary.averageGpsAccuracyM).toBeNull();
    expect(summary.gpsAccuracySampleCount).toBe(0);
    expect(summary.headingAccuracyDistribution).toEqual([0, 0, 0, 0]);
    expect(summary.staleRatio).toBeNull();
    expect(summary.totalCount).toBe(0);
  });
});

describe('summarizeSamples — 平均 GPS 精度', () => {
  it('null を除外して平均し、件数を返す', () => {
    const entries: readonly SampleLogEntry[] = [
      makeSample({ gpsAccuracyM: 10 }),
      makeSample({ gpsAccuracyM: null }),
      makeSample({ gpsAccuracyM: 20 }),
      makeSample({ gpsAccuracyM: null }),
    ];
    const summary = summarizeSamples(entries);
    expect(summary.averageGpsAccuracyM).toBe(15);
    expect(summary.gpsAccuracySampleCount).toBe(2);
    expect(summary.totalCount).toBe(4);
  });

  it('すべて null なら平均 null・件数 0', () => {
    const summary = summarizeSamples([
      makeSample({ gpsAccuracyM: null }),
      makeSample({ gpsAccuracyM: null }),
    ]);
    expect(summary.averageGpsAccuracyM).toBeNull();
    expect(summary.gpsAccuracySampleCount).toBe(0);
    expect(summary.totalCount).toBe(2);
  });

  it('0 も有効な値として平均に含める（null のみ除外）', () => {
    const summary = summarizeSamples([
      makeSample({ gpsAccuracyM: 0 }),
      makeSample({ gpsAccuracyM: 10 }),
    ]);
    expect(summary.averageGpsAccuracyM).toBe(5);
    expect(summary.gpsAccuracySampleCount).toBe(2);
  });
});

describe('summarizeSamples — 方位精度の分布', () => {
  it('0〜3 の件数を数え、null は含めない', () => {
    const entries: readonly SampleLogEntry[] = [
      makeSample({ headingAccuracy: 0 }),
      makeSample({ headingAccuracy: 1 }),
      makeSample({ headingAccuracy: 1 }),
      makeSample({ headingAccuracy: 2 }),
      makeSample({ headingAccuracy: 3 }),
      makeSample({ headingAccuracy: 3 }),
      makeSample({ headingAccuracy: 3 }),
      makeSample({ headingAccuracy: null }),
    ];
    const summary = summarizeSamples(entries);
    expect(summary.headingAccuracyDistribution).toEqual([1, 2, 1, 3]);
    expect(summary.totalCount).toBe(8);
  });

  it('すべて null なら分布は [0,0,0,0]', () => {
    const summary = summarizeSamples([
      makeSample({ headingAccuracy: null }),
      makeSample({ headingAccuracy: null }),
    ]);
    expect(summary.headingAccuracyDistribution).toEqual([0, 0, 0, 0]);
  });
});

describe('summarizeSamples — 古いサンプル率', () => {
  it('staleMaxMs を超える locationAgeMs の割合（境界は「超」）', () => {
    const entries: readonly SampleLogEntry[] = [
      makeSample({ locationAgeMs: 10_000 }),
      makeSample({ locationAgeMs: 30_000 }), // ちょうどは stale（古い扱いにしない）
      makeSample({ locationAgeMs: 30_001 }), // 超えたら古い
      makeSample({ locationAgeMs: 60_000 }),
    ];
    const summary = summarizeSamples(entries);
    expect(summary.staleRatio).toBe(0.5); // 4 件中 2 件
  });

  it('カスタム Thresholds で境界が動く', () => {
    const tight: Thresholds = {
      ...DEFAULT_THRESHOLDS,
      freshness: { freshMaxMs: 1_000, agingMaxMs: 2_000, staleMaxMs: 5_000 },
    };
    const entries: readonly SampleLogEntry[] = [
      makeSample({ locationAgeMs: 1_000 }),
      makeSample({ locationAgeMs: 5_000 }),
      makeSample({ locationAgeMs: 5_001 }),
    ];
    // 既定（30 秒）では 3 件とも古くない
    expect(summarizeSamples(entries).staleRatio).toBe(0);
    // カスタム閾値（5 秒）では 5_001 ms の 1 件だけが「古い」
    expect(summarizeSamples(entries, tight).staleRatio).toBeCloseTo(1 / 3, 12);
    expect(summarizeSamples([makeSample({ locationAgeMs: 6_000 })], tight).staleRatio).toBe(1);
    expect(summarizeSamples([makeSample({ locationAgeMs: 6_000 })]).staleRatio).toBe(0);
  });

  it('全件が古ければ 1・全件が新しければ 0', () => {
    expect(summarizeSamples([makeSample({ locationAgeMs: 31_000 })]).staleRatio).toBe(1);
    expect(summarizeSamples([makeSample({ locationAgeMs: 0 })]).staleRatio).toBe(0);
  });
});

describe('summarizeSamples — 入力の不変性', () => {
  it('入力配列・要素を変更しない', () => {
    const entries: readonly SampleLogEntry[] = [
      makeSample({ gpsAccuracyM: 10 }),
      makeSample({ gpsAccuracyM: null }),
    ];
    const snapshot = entries.map((entry) => ({ ...entry }));
    summarizeSamples(entries);
    expect(entries).toEqual(snapshot);
  });
});

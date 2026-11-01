import {
  createLocationFilterState,
  filterLocationSample,
  type LocationFilterState,
} from '../locationFilter';
import type { GeoPoint, SensorFix } from '../types';

const EPOCH = 1_700_000_000_000;
const ORIGIN: GeoPoint = { latitude: 0, longitude: 0 };
/** 赤道 1 度あたりの距離（m）。 */
const METERS_PER_DEGREE = 111_195.08;

function location(
  latitude: number,
  longitude: number,
  accuracyM: number | null,
  receivedAtMonotonicMs: number,
): SensorFix {
  return {
    point: { latitude, longitude },
    accuracyM,
    capturedAtEpochMs: EPOCH,
    receivedAtMonotonicMs,
    receivedAtEpochMs: EPOCH,
    source: 'mock',
  };
}

function eastPointAt(meters: number): GeoPoint {
  return { latitude: 0, longitude: meters / METERS_PER_DEGREE };
}

function run(
  state: LocationFilterState,
  samples: readonly SensorFix[],
): ReturnType<typeof filterLocationSample> {
  let result = filterLocationSample(state, {
    reading: samples[0]!,
    nowMonotonicMs: samples[0]!.receivedAtMonotonicMs,
  });
  for (const sample of samples.slice(1)) {
    result = filterLocationSample(result.state, {
      reading: sample,
      nowMonotonicMs: sample.receivedAtMonotonicMs,
    });
  }
  return result;
}

describe('filterLocationSample — 精度', () => {
  it('初回の良好な測位は採用', () => {
    const result = filterLocationSample(createLocationFilterState(), {
      reading: location(0, 0, 8, 0),
      nowMonotonicMs: 0,
    });
    expect(result.decision).toBe('accepted');
    expect(result.acceptedFix?.accuracyM).toBe(8);
  });

  it('精度が悪い初回測位は unavailable', () => {
    const result = filterLocationSample(createLocationFilterState(), {
      reading: location(0, 0, 50, 0),
      nowMonotonicMs: 0,
    });
    expect(result.mode).toBe('unavailable');
    expect(result.acceptedFix).toBeNull();
  });

  it('精度が悪い測位は前回値を保持する', () => {
    const first = filterLocationSample(createLocationFilterState(), {
      reading: location(0, 0, 8, 0),
      nowMonotonicMs: 0,
    });
    const second = filterLocationSample(first.state, {
      reading: location(0, 0.001, 50, 1_000),
      nowMonotonicMs: 1_000,
    });
    expect(second.decision).toBe('held');
    expect(second.reason).toBe('location-poor-accuracy');
    expect(second.acceptedFix).toBeNull();
  });
});

describe('filterLocationSample — 位置飛び', () => {
  it('大きなジャンプは保持し、同じ位置が続いたら採用する', () => {
    const first = filterLocationSample(createLocationFilterState(), {
      reading: location(0, 0, 8, 0),
      nowMonotonicMs: 0,
    });
    const jumped = eastPointAt(1_000);
    const second = filterLocationSample(first.state, {
      reading: location(jumped.latitude, jumped.longitude, 8, 1_000),
      nowMonotonicMs: 1_000,
    });
    expect(second.decision).toBe('held');
    expect(second.reason).toBe('location-jump');

    const third = filterLocationSample(second.state, {
      reading: location(jumped.latitude, jumped.longitude, 8, 2_000),
      nowMonotonicMs: 2_000,
    });
    expect(third.decision).toBe('accepted');
  });

  it('電車移動のような高速移動（20m/s・1秒間隔）は拒否しない', () => {
    const first = filterLocationSample(createLocationFilterState(), {
      reading: location(0, 0, 8, 0),
      nowMonotonicMs: 0,
    });
    const moved = eastPointAt(20);
    const second = filterLocationSample(first.state, {
      reading: location(moved.latitude, moved.longitude, 8, 1_000),
      nowMonotonicMs: 1_000,
    });
    expect(second.decision).toBe('accepted');
  });
});

describe('filterLocationSample — 平滑化', () => {
  it('微小移動は前回位置を維持し、受信時刻を更新する', () => {
    const first = filterLocationSample(createLocationFilterState(), {
      reading: location(0, 0, 10, 0),
      nowMonotonicMs: 0,
    });
    const moved = eastPointAt(2);
    const second = filterLocationSample(first.state, {
      reading: location(moved.latitude, moved.longitude, 10, 1_000),
      nowMonotonicMs: 1_000,
    });
    expect(second.decision).toBe('smoothed');
    expect(second.acceptedFix?.point).toEqual(ORIGIN);
    expect(second.acceptedFix?.receivedAtMonotonicMs).toBe(1_000);
  });

  it('精度の範囲内の移動は採用する', () => {
    const first = filterLocationSample(createLocationFilterState(), {
      reading: location(0, 0, 8, 0),
      nowMonotonicMs: 0,
    });
    const moved = eastPointAt(30);
    const second = filterLocationSample(first.state, {
      reading: location(moved.latitude, moved.longitude, 8, 1_000),
      nowMonotonicMs: 1_000,
    });
    expect(second.decision).toBe('accepted');
    expect(second.acceptedFix?.point.longitude).toBeCloseTo(moved.longitude, 10);
  });
});

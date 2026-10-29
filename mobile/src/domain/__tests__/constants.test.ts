import {
  ARRIVAL_RADIUS_M,
  DEFAULT_ACCURACY_PROFILE,
  DEFAULT_THRESHOLDS,
  EARTH_RADIUS_M,
  HEADING_DISPATCH_MIN_INTERVAL_MS,
  LOCATION_UPDATE_INTERVAL_MS,
  POLE_EPS_DEG,
  SAME_POINT_EPS_M,
  SAMPLE_LOG_CAPACITY,
  SETTINGS_DEFAULT,
  TICK_INTERVAL_MS,
} from '../constants';

/**
 * T01: 定数の基準値を固定するテスト。
 * ここで固定した数値が後続タスク（T04〜T10）のテスト期待値の基準になるため、
 * 値を変える場合は利用側のテストも同時に更新すること（tasks.md §2 / D-08 / D-09）。
 */
describe('DEFAULT_THRESHOLDS', () => {
  it('鮮度閾値は 3s / 10s / 30s（FR-08 / D-09 の前提を固定）', () => {
    expect(DEFAULT_THRESHOLDS.freshness.freshMaxMs).toBe(3_000);
    expect(DEFAULT_THRESHOLDS.freshness.agingMaxMs).toBe(10_000);
    expect(DEFAULT_THRESHOLDS.freshness.staleMaxMs).toBe(30_000);
  });

  it('GPS 精度閾値は 10 / 30 m（FR-08 / D-08）', () => {
    expect(DEFAULT_THRESHOLDS.gpsAccuracy.goodMaxM).toBe(10);
    expect(DEFAULT_THRESHOLDS.gpsAccuracy.fairMaxM).toBe(30);
  });

  it('到着半径は 10 m・サンプル上限は 300 件（FR-06 / FR-09）', () => {
    expect(DEFAULT_THRESHOLDS.arrivalRadiusM).toBe(10);
    expect(DEFAULT_THRESHOLDS.arrivalRadiusM).toBe(ARRIVAL_RADIUS_M);
    expect(DEFAULT_THRESHOLDS.sampleLogCapacity).toBe(300);
    expect(DEFAULT_THRESHOLDS.sampleLogCapacity).toBe(SAMPLE_LOG_CAPACITY);
  });

  it('閾値はすべて有限の正値で、-0 / NaN / Infinity を含まない', () => {
    const values = [
      DEFAULT_THRESHOLDS.freshness.freshMaxMs,
      DEFAULT_THRESHOLDS.freshness.agingMaxMs,
      DEFAULT_THRESHOLDS.freshness.staleMaxMs,
      DEFAULT_THRESHOLDS.gpsAccuracy.goodMaxM,
      DEFAULT_THRESHOLDS.gpsAccuracy.fairMaxM,
      DEFAULT_THRESHOLDS.arrivalRadiusM,
      DEFAULT_THRESHOLDS.sampleLogCapacity,
    ];
    for (const value of values) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(Object.is(value, -0)).toBe(false);
    }
  });
});

describe('地理・角度の定数', () => {
  it('地球半径は IUGG 平均 6,371,008.8 m', () => {
    expect(EARTH_RADIUS_M).toBe(6_371_008.8);
  });

  it('同一地点 1 cm・極点 1e-9 度', () => {
    expect(SAME_POINT_EPS_M).toBe(0.01);
    expect(POLE_EPS_DEG).toBe(1e-9);
  });
});

describe('更新間隔の定数', () => {
  it('位置 1s / 方位 dispatch 100ms / ティッカー 1s（NFR-07）', () => {
    expect(LOCATION_UPDATE_INTERVAL_MS).toBe(1_000);
    expect(HEADING_DISPATCH_MIN_INTERVAL_MS).toBe(100);
    expect(TICK_INTERVAL_MS).toBe(1_000);
  });
});

describe('SETTINGS_DEFAULT', () => {
  it('既定の位置取得プロファイルは navigation', () => {
    expect(SETTINGS_DEFAULT.accuracyProfile).toBe('navigation');
    expect(SETTINGS_DEFAULT.accuracyProfile).toBe(DEFAULT_ACCURACY_PROFILE);
  });

  it('既定の更新間隔は LOCATION_UPDATE_INTERVAL_MS と一致する', () => {
    expect(SETTINGS_DEFAULT.locationUpdateIntervalMs).toBe(LOCATION_UPDATE_INTERVAL_MS);
  });
});

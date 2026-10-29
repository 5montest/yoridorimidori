import { DEG2RAD, EARTH_RADIUS_M, type Thresholds } from '../constants';
import { haversineDistanceM } from '../distance';
import { computeNavState, type NavStateInput } from '../nav';
import type {
  Destination,
  GeoPoint,
  HeadingAccuracyLevel,
  HeadingFix,
  HeadingReference,
  SensorFix,
} from '../types';

const NOW = 1_000_000;
const EPOCH = 1_700_000_000_000;
const ORIGIN: GeoPoint = { latitude: 0, longitude: 0 };
/**
 * 赤道 1 度あたりの距離（m）。目的地を「指定した距離だけ東」に置くために使う。
 * `distance.ts` と同じ `EARTH_RADIUS_M * DEG2RAD` で計算し、10.0 m ちょうどの境界を作れるようにする。
 */
const METERS_PER_DEGREE_AT_EQUATOR = EARTH_RADIUS_M * DEG2RAD;

interface LocationOptions {
  readonly point?: GeoPoint;
  readonly accuracyM?: number | null;
  readonly ageMs?: number;
}

function makeLocation(options: LocationOptions = {}): SensorFix {
  const point = options.point ?? ORIGIN;
  const accuracyM = options.accuracyM === undefined ? 5 : options.accuracyM;
  const ageMs = options.ageMs ?? 0;
  return {
    point,
    accuracyM,
    capturedAtEpochMs: EPOCH,
    receivedAtMonotonicMs: NOW - ageMs,
    receivedAtEpochMs: EPOCH,
    source: 'mock',
  };
}

interface HeadingOptions {
  readonly headingDeg?: number | null;
  readonly reference?: HeadingReference;
  readonly accuracy?: HeadingAccuracyLevel | null;
  readonly ageMs?: number;
}

function makeHeading(options: HeadingOptions = {}): HeadingFix {
  const headingDeg = options.headingDeg === undefined ? 0 : options.headingDeg;
  const reference = options.reference ?? 'true-north';
  const accuracy = options.accuracy === undefined ? 3 : options.accuracy;
  const ageMs = options.ageMs ?? 0;
  return {
    headingDeg,
    reference,
    accuracy,
    receivedAtMonotonicMs: NOW - ageMs,
    receivedAtEpochMs: EPOCH,
    source: 'mock',
  };
}

function makeDestination(point: GeoPoint, name = '目的地'): Destination {
  return { id: 'dest-1', name, point, createdAtEpochMs: EPOCH, origin: 'manual' };
}

/** 赤道上で `meters` だけ東に離れた点。距離の境界テスト用（float 誤差は 1e-9 程度）。 */
function eastPointAt(meters: number): GeoPoint {
  return { latitude: 0, longitude: meters / METERS_PER_DEGREE_AT_EQUATOR };
}

function makeInput(overrides: Partial<NavStateInput> = {}): NavStateInput {
  return {
    destination: makeDestination({ latitude: 1, longitude: 0 }),
    location: makeLocation(),
    heading: makeHeading(),
    nowMonotonicMs: NOW,
    ...overrides,
  };
}

describe('computeNavState — E-15 目的地未設定', () => {
  it('status=no-destination・距離/方位は null、鮮度と精度は計算される', () => {
    const state = computeNavState(
      makeInput({
        destination: null,
        location: makeLocation({ ageMs: 5_000, accuracyM: 50 }),
        heading: makeHeading({
          ageMs: 35_000,
          accuracy: 0,
          reference: 'magnetic-north',
          headingDeg: 120,
        }),
      }),
    );
    expect(state.status).toBe('no-destination');
    expect(state.distanceM).toBeNull();
    expect(state.targetBearingDeg).toBeNull();
    expect(state.relativeBearingDeg).toBeNull();
    // 鮮度・精度は「現在地は出せる」ため計算して返す（§6.8 手順 1）
    expect(state.locationFreshness).toBe('aging');
    expect(state.headingFreshness).toBe('lost');
    expect(state.locationAgeMs).toBe(5_000);
    expect(state.headingAgeMs).toBe(35_000);
    expect(state.gpsAccuracyClass).toBe('poor');
    expect(state.headingAccuracyClass).toBe('uncalibrated');
    expect(state.headingReference).toBe('magnetic-north');
  });

  it('位置も方位も無い場合でも安全に返す', () => {
    const state = computeNavState({ destination: null, location: null, heading: null, nowMonotonicMs: NOW });
    expect(state.status).toBe('no-destination');
    expect(state.locationFreshness).toBeNull();
    expect(state.headingFreshness).toBeNull();
    expect(state.locationAgeMs).toBeNull();
    expect(state.headingAgeMs).toBeNull();
    expect(state.gpsAccuracyClass).toBe('unknown');
    expect(state.headingAccuracyClass).toBe('unknown');
    expect(state.headingReference).toBe('unknown');
    expect(state.warnings).toEqual([]);
  });
});

describe('computeNavState — status の優先順位（§6.8）', () => {
  it('位置なし → locating・distanceM=null', () => {
    const state = computeNavState(makeInput({ location: null }));
    expect(state.status).toBe('locating');
    expect(state.distanceM).toBeNull();
    expect(state.targetBearingDeg).toBeNull();
    expect(state.relativeBearingDeg).toBeNull();
  });

  it('E-01 目的地 = 現在地 → arrived・distanceM=0・目標方位と相対方位は null', () => {
    const point: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };
    const state = computeNavState(
      makeInput({ destination: makeDestination(point), location: makeLocation({ point }) }),
    );
    expect(state.status).toBe('arrived');
    expect(state.distanceM).toBe(0);
    expect(state.targetBearingDeg).toBeNull();
    expect(state.relativeBearingDeg).toBeNull();
  });

  it('E-12 目的地座標が NaN でも throw せず locating', () => {
    // 呼び出しが例外を投げればこのテスト自体が失敗する（throw しないことの確認を兼ねる）。
    const state = computeNavState(
      makeInput({
        destination: makeDestination({ latitude: NaN, longitude: 0 }),
      }),
    );
    expect(state.status).toBe('locating');
    expect(state.distanceM).toBeNull();
    expect(state.targetBearingDeg).toBeNull();
  });

  it('E-12 目的地座標が範囲外（緯度 91）でも locating', () => {
    const state = computeNavState(
      makeInput({ destination: makeDestination({ latitude: 91, longitude: 0 }) }),
    );
    expect(state.status).toBe('locating');
    expect(state.warnings).toEqual([]);
  });
});

describe('computeNavState — 到着境界（FR-06: distance < 10 の strict）', () => {
  it('9.999 m → arrived', () => {
    const state = computeNavState(
      makeInput({ destination: makeDestination(eastPointAt(9.999)) }),
    );
    expect(state.distanceM).toBeLessThan(10);
    expect(state.status).toBe('arrived');
  });

  it('10.0 m ちょうど → navigating（strict なので到着しない）', () => {
    const destination = makeDestination(eastPointAt(10));
    const state = computeNavState(makeInput({ destination }));
    expect(state.distanceM).toBe(10);
    expect(state.status).toBe('navigating');
  });

  it('10.001 m → navigating', () => {
    const state = computeNavState(
      makeInput({ destination: makeDestination(eastPointAt(10.001)) }),
    );
    expect(state.distanceM).toBeGreaterThan(10);
    expect(state.status).toBe('navigating');
  });

  it('到着半径と距離が完全一致する場合も strict（<）で判定する', () => {
    // 距離 d を実測し、閾値を d と d + 1e-9 にして strict 比較を直接検証する。
    const destination = makeDestination(eastPointAt(25));
    const distance = haversineDistanceM(ORIGIN, destination.point);
    expect(distance).not.toBeNull();
    const exact = distance as number;

    const boundary: Thresholds = { ...defaultThresholds(), arrivalRadiusM: exact };
    expect(computeNavState(makeInput({ destination }), boundary).status).toBe('navigating');

    const justAbove: Thresholds = { ...defaultThresholds(), arrivalRadiusM: exact + 1e-9 };
    expect(computeNavState(makeInput({ destination }), justAbove).status).toBe('arrived');
  });

  it('thresholds 注入で到着判定が変わる（カスタム arrivalRadiusM）', () => {
    const destination = makeDestination(eastPointAt(25));
    expect(computeNavState(makeInput({ destination })).status).toBe('navigating');
    const loose: Thresholds = { ...defaultThresholds(), arrivalRadiusM: 30 };
    expect(computeNavState(makeInput({ destination }), loose).status).toBe('arrived');
  });
});

describe('computeNavState — navigating の派生値', () => {
  it('北の目的地・方位 0 → target 0 / relative 0', () => {
    const state = computeNavState(makeInput());
    expect(state.status).toBe('navigating');
    expect(state.distanceM).not.toBeNull();
    expect(state.distanceM as number).toBeCloseTo(111_195.08, 1);
    expect(state.targetBearingDeg).toBeCloseTo(0, 9);
    expect(state.relativeBearingDeg).toBeCloseTo(0, 9);
  });

  it('東の目的地・方位 0 → target 90 / relative 90（右）', () => {
    const state = computeNavState(
      makeInput({ destination: makeDestination({ latitude: 0, longitude: 1 }), heading: makeHeading({ headingDeg: 0 }) }),
    );
    expect(state.status).toBe('navigating');
    expect(state.targetBearingDeg).toBeCloseTo(90, 9);
    expect(state.relativeBearingDeg).toBeCloseTo(90, 9);
  });

  it('E-09 方位精度 0（uncalibrated）でも相対方位は計算し、警告を付ける', () => {
    const state = computeNavState(
      makeInput({
        destination: makeDestination({ latitude: 0, longitude: 1 }),
        heading: makeHeading({ headingDeg: 80, accuracy: 0 }),
      }),
    );
    expect(state.status).toBe('navigating');
    expect(state.relativeBearingDeg).not.toBeNull();
    expect(state.relativeBearingDeg as number).toBeCloseTo(10, 9); // 90 - 80
    expect(state.headingAccuracyClass).toBe('uncalibrated');
    expect(state.warnings).toContain('heading-uncalibrated');
  });

  it('E-09 方位精度 1（poor）でも回転し、heading-low-accuracy を付ける', () => {
    const state = computeNavState(makeInput({ heading: makeHeading({ accuracy: 1 }) }));
    expect(state.status).toBe('navigating');
    expect(state.relativeBearingDeg).not.toBeNull();
    expect(state.headingAccuracyClass).toBe('poor');
    expect(state.warnings).toContain('heading-low-accuracy');
  });

  it('方位精度が null（unknown）でも heading-low-accuracy を付ける', () => {
    const state = computeNavState(makeInput({ heading: makeHeading({ accuracy: null }) }));
    expect(state.status).toBe('navigating');
    expect(state.headingAccuracyClass).toBe('unknown');
    expect(state.warnings).toContain('heading-low-accuracy');
  });
});

describe('computeNavState — E-08 方位不明', () => {
  it('heading=null → heading-unknown・相対方位 null', () => {
    const state = computeNavState(makeInput({ heading: null }));
    expect(state.status).toBe('heading-unknown');
    expect(state.relativeBearingDeg).toBeNull();
    expect(state.targetBearingDeg).not.toBeNull();
    expect(state.headingFreshness).toBeNull();
    expect(state.warnings).not.toContain('heading-unavailable');
  });

  it('heading はあるが headingDeg=null → heading-unknown', () => {
    const state = computeNavState(makeInput({ heading: makeHeading({ headingDeg: null }) }));
    expect(state.status).toBe('heading-unknown');
    expect(state.relativeBearingDeg).toBeNull();
  });

  it('headingUnavailable=true なら heading-unavailable 警告を付ける', () => {
    const state = computeNavState(makeInput({ heading: null, headingUnavailable: true }));
    expect(state.status).toBe('heading-unknown');
    expect(state.warnings).toContain('heading-unavailable');
  });
});

describe('computeNavState — E-10 位置の鮮度', () => {
  it('30 秒ちょうど（位置 Age 30_000）は stale → navigating・location-stale', () => {
    const state = computeNavState(makeInput({ location: makeLocation({ ageMs: 30_000 }) }));
    expect(state.locationFreshness).toBe('stale');
    expect(state.status).toBe('navigating');
    expect(state.relativeBearingDeg).not.toBeNull();
    expect(state.warnings).toEqual(['location-stale']);
  });

  it('25 秒（stale）は navigating のまま警告のみ', () => {
    const state = computeNavState(makeInput({ location: makeLocation({ ageMs: 25_000 }) }));
    expect(state.status).toBe('navigating');
    expect(state.relativeBearingDeg).not.toBeNull();
    expect(state.warnings).toEqual(['location-stale']);
  });

  it('30 秒超（30_001）は position-lost・鳥ニュートラル・location-lost', () => {
    const state = computeNavState(makeInput({ location: makeLocation({ ageMs: 30_001 }) }));
    expect(state.locationFreshness).toBe('lost');
    expect(state.status).toBe('position-lost');
    expect(state.relativeBearingDeg).toBeNull();
    expect(state.warnings).toContain('location-lost');
  });

  it('E-11 タイムスタンプ逆転（received > now）は fresh として扱い落ちない', () => {
    const future = makeLocation();
    const state = computeNavState(
      makeInput({
        location: { ...future, receivedAtMonotonicMs: NOW + 5_000 },
      }),
    );
    expect(state.locationAgeMs).toBe(0);
    expect(state.locationFreshness).toBe('fresh');
    expect(state.status).toBe('navigating');
    expect(state.warnings).toEqual([]);
  });

  it('カスタム Thresholds で鮮度境界が動く', () => {
    const tight: Thresholds = {
      ...defaultThresholds(),
      freshness: { freshMaxMs: 1_000, agingMaxMs: 2_000, staleMaxMs: 3_000 },
    };
    const state = computeNavState(makeInput({ location: makeLocation({ ageMs: 2_500 }) }), tight);
    expect(state.locationFreshness).toBe('stale');
    expect(state.status).toBe('navigating');
  });
});

describe('computeNavState — 警告の合成', () => {
  it('磁北基準なら magnetic-reference', () => {
    const state = computeNavState(makeInput({ heading: makeHeading({ reference: 'magnetic-north' }) }));
    expect(state.headingReference).toBe('magnetic-north');
    expect(state.warnings).toContain('magnetic-reference');
  });

  it('GPS 精度 50m なら gps-low-accuracy', () => {
    const state = computeNavState(makeInput({ location: makeLocation({ accuracyM: 50 }) }));
    expect(state.gpsAccuracyClass).toBe('poor');
    expect(state.warnings).toContain('gps-low-accuracy');
  });

  it('方位が古い（stale）なら heading-stale', () => {
    const state = computeNavState(makeInput({ heading: makeHeading({ ageMs: 12_000 }) }));
    expect(state.headingFreshness).toBe('stale');
    expect(state.warnings).toContain('heading-stale');
  });

  it('警告は「位置系 → 方位系 → 精度系 → 基準系」の順に整列する', () => {
    const state = computeNavState(
      makeInput({
        location: makeLocation({ ageMs: 35_000, accuracyM: 50 }),
        heading: makeHeading({
          ageMs: 12_000,
          accuracy: 1,
          reference: 'magnetic-north',
          headingDeg: 0,
        }),
      }),
    );
    // 位置系（location-lost）→ 方位系（heading-stale）→ 精度系（heading-low-accuracy,
    // gps-low-accuracy）→ 基準系（magnetic-reference）の固定順。
    expect(state.status).toBe('position-lost');
    expect(state.warnings).toEqual([
      'location-lost',
      'heading-stale',
      'heading-low-accuracy',
      'gps-low-accuracy',
      'magnetic-reference',
    ]);
  });

  it('警告が無い正常状態では空配列', () => {
    const state = computeNavState(makeInput());
    expect(state.status).toBe('navigating');
    expect(state.warnings).toEqual([]);
  });
});

/** 既定閾値の複製（テスト内で 1 箇所だけ差し替えるため）。 */
function defaultThresholds(): Thresholds {
  return {
    freshness: { freshMaxMs: 3_000, agingMaxMs: 10_000, staleMaxMs: 30_000 },
    gpsAccuracy: { goodMaxM: 10, fairMaxM: 30 },
    arrivalRadiusM: 10,
    sampleLogCapacity: 300,
  };
}

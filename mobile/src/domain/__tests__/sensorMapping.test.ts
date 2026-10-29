import {
  mapHeadingReading,
  mapLocationReading,
  toHeadingAccuracyLevel,
  type HeadingReadingLike,
  type LocationReadingLike,
} from '../sensorMapping';
import type { GeoPoint } from '../types';

const RECEIVED_MONOTONIC = 1_000;
const RECEIVED_EPOCH = 1_700_000_000_000;

function locationReading(
  overrides: Partial<{ latitude: number; longitude: number; accuracy: number | null }> = {},
  timestamp = 1_699_999_999_000,
): LocationReadingLike {
  return {
    coords: {
      latitude: overrides.latitude === undefined ? 35.681236 : overrides.latitude,
      longitude: overrides.longitude === undefined ? 139.767125 : overrides.longitude,
      accuracy: overrides.accuracy === undefined ? 8 : overrides.accuracy,
    },
    timestamp,
  };
}

function headingReading(
  trueHeading: number,
  magHeading: number,
  accuracy: number,
): HeadingReadingLike {
  return { trueHeading, magHeading, accuracy };
}

describe('mapLocationReading', () => {
  it('有効な reading を SensorFix に変換する（source / 受信時刻は引数）', () => {
    const fix = mapLocationReading(
      locationReading({ accuracy: 8 }, 1_699_999_999_123),
      RECEIVED_MONOTONIC,
      RECEIVED_EPOCH,
      'device',
    );
    expect(fix).toEqual({
      point: { latitude: 35.681236, longitude: 139.767125 },
      accuracyM: 8,
      capturedAtEpochMs: 1_699_999_999_123,
      receivedAtMonotonicMs: RECEIVED_MONOTONIC,
      receivedAtEpochMs: RECEIVED_EPOCH,
      source: 'device',
    });
  });

  it('E-12: NaN / Infinity / 範囲外の座標は null（throw しない）', () => {
    expect(mapLocationReading(locationReading({ latitude: NaN }), 0, 0, 'device')).toBeNull();
    expect(mapLocationReading(locationReading({ longitude: Infinity }), 0, 0, 'device')).toBeNull();
    expect(mapLocationReading(locationReading({ latitude: 91 }), 0, 0, 'device')).toBeNull();
    expect(mapLocationReading(locationReading({ longitude: -181 }), 0, 0, 'device')).toBeNull();
  });

  it('accuracy は有限かつ >= 0 のみ採用（NaN / -1 / Infinity → null・0 はそのまま）', () => {
    const accuracyOf = (accuracy: number | null): number | null => {
      const fix = mapLocationReading(locationReading({ accuracy }), 0, 0, 'device');
      return fix === null ? null : fix.accuracyM;
    };
    expect(accuracyOf(5)).toBe(5);
    expect(accuracyOf(0)).toBe(0);
    expect(accuracyOf(null)).toBeNull();
    expect(accuracyOf(NaN)).toBeNull();
    expect(accuracyOf(-1)).toBeNull();
    expect(accuracyOf(Infinity)).toBeNull();
  });

  it('timestamp が不正なら capturedAtEpochMs は null', () => {
    const fix = mapLocationReading(locationReading({}, NaN), 0, 0, 'device');
    expect(fix).not.toBeNull();
    expect(fix?.capturedAtEpochMs).toBeNull();
  });

  it('型不正（coords 欠落・null）でも throw せず null', () => {
    expect(
      mapLocationReading({} as unknown as LocationReadingLike, 0, 0, 'device'),
    ).toBeNull();
    expect(
      mapLocationReading(null as unknown as LocationReadingLike, 0, 0, 'device'),
    ).toBeNull();
  });

  it('coords.heading（進行方向）は参照しない（方位に使わない）', () => {
    const reading = {
      coords: {
        latitude: 35.68,
        longitude: 139.76,
        accuracy: 5,
        heading: 123.4, // 進行方向。もし参照されたら方位と混同する
      },
      timestamp: 1,
    } as unknown as LocationReadingLike;
    const fix = mapLocationReading(reading, 0, 0, 'device');
    expect(fix).not.toBeNull();
    expect(fix?.point).toEqual({ latitude: 35.68, longitude: 139.76 });
  });

  it('プロパティ: 乱数 1,000 件は null か有効座標の SensorFix', () => {
    let state = 12_345_679;
    const next = (): number => {
      state = (1_664_525 * state + 1_013_904_223) % 4_294_967_296;
      return state / 4_294_967_296;
    };
    for (let index = 0; index < 1_000; index += 1) {
      const fix = mapLocationReading(
        {
          coords: {
            latitude: next() * 200 - 100,
            longitude: next() * 400 - 200,
            accuracy: next() * 100,
          },
          timestamp: next() * 1_700_000_000_000,
        },
        1,
        2,
        'device',
      );
      if (fix !== null) {
        expect(Number.isFinite(fix.point.latitude)).toBe(true);
        expect(Number.isFinite(fix.point.longitude)).toBe(true);
        expect(fix.point.latitude).toBeGreaterThanOrEqual(-90);
        expect(fix.point.latitude).toBeLessThanOrEqual(90);
        expect(fix.point.longitude).toBeGreaterThanOrEqual(-180);
        expect(fix.point.longitude).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('mapHeadingReading — E-08 / D-05', () => {
  it('E-08: trueHeading=-1 なら magHeading にフォールバックし magnetic-north', () => {
    const fix = mapHeadingReading(
      headingReading(-1, 123.4, 2),
      RECEIVED_MONOTONIC,
      RECEIVED_EPOCH,
      'device',
    );
    expect(fix).toEqual({
      headingDeg: 123.4,
      reference: 'magnetic-north',
      accuracy: 2,
      receivedAtMonotonicMs: RECEIVED_MONOTONIC,
      receivedAtEpochMs: RECEIVED_EPOCH,
      source: 'device',
    });
  });

  it('E-08: 両方 -1 なら headingDeg null・reference unknown', () => {
    const fix = mapHeadingReading(headingReading(-1, -1, 2), 0, 0, 'device');
    expect(fix.headingDeg).toBeNull();
    expect(fix.reference).toBe('unknown');
  });

  it('trueHeading 0 / 360 / 359.9（正規化）', () => {
    expect(mapHeadingReading(headingReading(0, 0, 3), 0, 0, 'device')).toMatchObject({
      headingDeg: 0,
      reference: 'true-north',
    });
    expect(mapHeadingReading(headingReading(360, 0, 3), 0, 0, 'device')).toMatchObject({
      headingDeg: 0,
      reference: 'true-north',
    });
    expect(
      mapHeadingReading(headingReading(359.9, 0, 3), 0, 0, 'device').headingDeg,
    ).toBeCloseTo(359.9, 9);
  });

  it('trueHeading が範囲外でも magHeading が有効なら磁北で継続する', () => {
    const fix = mapHeadingReading(headingReading(400, 45, 1), 0, 0, 'device');
    expect(fix.headingDeg).toBe(45);
    expect(fix.reference).toBe('magnetic-north');
  });

  it('accuracy は 0〜3 に正規化される（4 / -1 / 1.5 は null）', () => {
    expect(mapHeadingReading(headingReading(10, 0, 0), 0, 0, 'device').accuracy).toBe(0);
    expect(mapHeadingReading(headingReading(10, 0, 3), 0, 0, 'device').accuracy).toBe(3);
    expect(mapHeadingReading(headingReading(10, 0, 4), 0, 0, 'device').accuracy).toBeNull();
    expect(mapHeadingReading(headingReading(10, 0, -1), 0, 0, 'device').accuracy).toBeNull();
    expect(mapHeadingReading(headingReading(10, 0, 1.5), 0, 0, 'device').accuracy).toBeNull();
  });

  it('coords.heading を参照しない（heading reading に余計なフィールドがあっても無視）', () => {
    const reading = {
      trueHeading: 30,
      magHeading: 20,
      accuracy: 2,
      coords: { heading: 123.4 },
    } as unknown as HeadingReadingLike;
    const fix = mapHeadingReading(reading, 0, 0, 'device');
    expect(fix.headingDeg).toBe(30);
    expect(fix.reference).toBe('true-north');
  });

  it('プロパティ: 乱数 1,000 件で headingDeg は null か [0,360)', () => {
    let state = 987_654_321;
    const next = (): number => {
      state = (1_664_525 * state + 1_013_904_223) % 4_294_967_296;
      return state / 4_294_967_296;
    };
    for (let index = 0; index < 1_000; index += 1) {
      const fix = mapHeadingReading(
        headingReading(next() * 800 - 400, next() * 800 - 400, next() * 6 - 1),
        0,
        0,
        'device',
      );
      if (fix.headingDeg !== null) {
        expect(Number.isFinite(fix.headingDeg)).toBe(true);
        expect(fix.headingDeg).toBeGreaterThanOrEqual(0);
        expect(fix.headingDeg).toBeLessThan(360);
        expect(fix.reference).not.toBe('unknown');
      } else {
        expect(fix.reference).toBe('unknown');
      }
    }
  });
});

describe('toHeadingAccuracyLevel', () => {
  it('0〜3 はそのまま・それ以外は null', () => {
    expect(toHeadingAccuracyLevel(0)).toBe(0);
    expect(toHeadingAccuracyLevel(1)).toBe(1);
    expect(toHeadingAccuracyLevel(2)).toBe(2);
    expect(toHeadingAccuracyLevel(3)).toBe(3);
    for (const value of [4, -1, 1.5, NaN, Infinity, -Infinity, '2', null, undefined]) {
      expect(toHeadingAccuracyLevel(value)).toBeNull();
    }
  });
});

describe('補助: 合成座標の検算', () => {
  it('テスト用の地点が有効座標であること', () => {
    const point: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };
    const fix = mapLocationReading(
      {
        coords: { latitude: point.latitude, longitude: point.longitude, accuracy: 1 },
        timestamp: 0,
      },
      0,
      0,
      'mock',
    );
    expect(fix?.point).toEqual(point);
    expect(fix?.source).toBe('mock');
  });
});

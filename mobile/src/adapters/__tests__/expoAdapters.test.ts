// expo-location の公式モックデータは存在しない（空実装。notes §2.8 / §4.3）。
// 公式の一般手段どおり、テストファイル内でインラインに jest.mock する（§12.4）。
jest.mock('expo-location', () => {
  const watchPositionAsync = jest.fn();
  const watchHeadingAsync = jest.fn();
  const getLastKnownPositionAsync = jest.fn();
  const requestForegroundPermissionsAsync = jest.fn();
  const getForegroundPermissionsAsync = jest.fn();
  const hasServicesEnabledAsync = jest.fn();
  const Accuracy = {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  };
  return {
    watchPositionAsync,
    watchHeadingAsync,
    getLastKnownPositionAsync,
    requestForegroundPermissionsAsync,
    getForegroundPermissionsAsync,
    hasServicesEnabledAsync,
    Accuracy,
  };
});

import * as Location from 'expo-location';
import { FakeClock } from '../clock/FakeClock';
import { ExpoHeadingProvider } from '../expo/ExpoHeadingProvider';
import { ExpoLocationProvider } from '../expo/ExpoLocationProvider';
import type { HeadingFix, SensorFix } from '../../domain/types';
import type { ProviderError } from '../../ports/common';

interface MockedExpoLocation {
  readonly watchPositionAsync: jest.Mock;
  readonly watchHeadingAsync: jest.Mock;
  readonly getLastKnownPositionAsync: jest.Mock;
  readonly requestForegroundPermissionsAsync: jest.Mock;
  readonly getForegroundPermissionsAsync: jest.Mock;
  readonly hasServicesEnabledAsync: jest.Mock;
  readonly Accuracy: { readonly High: number; readonly BestForNavigation: number };
}

const mockedLocation = Location as unknown as MockedExpoLocation;

const EPOCH = 1_700_000_000_000;
const GRANTED_RESPONSE = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
  expires: 'never',
  android: { accuracy: 'fine' },
};
const DENIED_RESPONSE = {
  granted: false,
  status: 'denied',
  canAskAgain: true,
  expires: 'never',
};
const LOCATION_OBJECT = {
  coords: { latitude: 35.681236, longitude: 139.767125, accuracy: 8 },
  timestamp: 1_699_999_999_000,
};
const HEADING_OBJECT = { trueHeading: -1, magHeading: 123.4, accuracy: 2 };

type PositionCallback = (location: unknown) => void;
type ErrorCallback = (reason: string) => void;

function watchPositionArguments(): [Record<string, unknown>, PositionCallback, ErrorCallback] {
  const calls = mockedLocation.watchPositionAsync.mock.calls as unknown as [
    Record<string, unknown>,
    PositionCallback,
    ErrorCallback,
  ][];
  const call = calls[0];
  if (call === undefined) {
    throw new Error('watchPositionAsync が呼ばれていません');
  }
  return call;
}

function watchHeadingArguments(): [(heading: unknown) => void, ErrorCallback] {
  const calls = mockedLocation.watchHeadingAsync.mock.calls as unknown as [
    (heading: unknown) => void,
    ErrorCallback,
  ][];
  const call = calls[0];
  if (call === undefined) {
    throw new Error('watchHeadingAsync が呼ばれていません');
  }
  return call;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(GRANTED_RESPONSE);
  mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue(GRANTED_RESPONSE);
  mockedLocation.hasServicesEnabledAsync.mockResolvedValue(true);
  mockedLocation.getLastKnownPositionAsync.mockResolvedValue(null);
  mockedLocation.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });
  mockedLocation.watchHeadingAsync.mockResolvedValue({ remove: jest.fn() });
});

describe('ExpoLocationProvider — watch オプション（§5.1）', () => {
  it('navigation プロファイルは accuracy 6 / timeInterval 1000・distanceInterval なし', async () => {
    const provider = new ExpoLocationProvider({ clock: new FakeClock() });
    const unsubscribe = await provider.start(
      () => undefined,
      () => undefined,
    );
    const [options] = watchPositionArguments();
    expect(options).toEqual({ accuracy: 6, timeInterval: 1_000 });
    expect(Object.hasOwn(options, 'distanceInterval')).toBe(false);
    unsubscribe();
  });

  it('balanced プロファイルは accuracy 4', async () => {
    const provider = new ExpoLocationProvider({
      clock: new FakeClock(),
      accuracyProfile: 'balanced',
    });
    const unsubscribe = await provider.start(
      () => undefined,
      () => undefined,
    );
    const [options] = watchPositionArguments();
    expect(options.accuracy).toBe(4);
    unsubscribe();
  });
});

describe('ExpoLocationProvider — 変換とエラー', () => {
  it('有効な LocationObject は SensorFix（source: device・FakeClock の受信時刻）になる', async () => {
    const clock = new FakeClock(0, EPOCH);
    const provider = new ExpoLocationProvider({ clock });
    const fixes: SensorFix[] = [];
    const errors: ProviderError[] = [];
    const unsubscribe = await provider.start(
      (fix) => fixes.push(fix),
      (error) => errors.push(error),
    );
    clock.advance(10);
    const [, onLocation] = watchPositionArguments();
    onLocation(LOCATION_OBJECT);

    expect(errors).toEqual([]);
    expect(fixes).toEqual([
      {
        point: { latitude: 35.681236, longitude: 139.767125 },
        accuracyM: 8,
        capturedAtEpochMs: 1_699_999_999_000,
        receivedAtMonotonicMs: 10,
        receivedAtEpochMs: EPOCH + 10,
        source: 'device',
      },
    ]);
    unsubscribe();
  });

  it('latitude が NaN の LocationObject は invalid-data で onFix しない（E-12）', async () => {
    const provider = new ExpoLocationProvider({ clock: new FakeClock() });
    const fixes: SensorFix[] = [];
    const errors: ProviderError[] = [];
    const unsubscribe = await provider.start(
      (fix) => fixes.push(fix),
      (error) => errors.push(error),
    );
    const [, onLocation] = watchPositionArguments();
    onLocation({ coords: { latitude: NaN, longitude: 139.7, accuracy: 8 }, timestamp: 1 });

    expect(fixes).toEqual([]);
    expect(errors[0]?.code).toBe('invalid-data');
    unsubscribe();
  });

  it('watch の errorHandler は runtime-error になる', async () => {
    const provider = new ExpoLocationProvider({ clock: new FakeClock() });
    const errors: ProviderError[] = [];
    const unsubscribe = await provider.start(
      () => undefined,
      (error) => errors.push(error),
    );
    const [, , onError] = watchPositionArguments();
    onError('location unavailable');
    expect(errors[0]?.code).toBe('runtime-error');
    expect(errors[0]?.detail).toBe('location unavailable');
    unsubscribe();
  });

  it('権限 denied なら permission-denied を onError して watch を張らない', async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(DENIED_RESPONSE);
    const provider = new ExpoLocationProvider({ clock: new FakeClock() });
    const errors: ProviderError[] = [];
    const unsubscribe = await provider.start(
      () => undefined,
      (error) => errors.push(error),
    );
    expect(errors[0]?.code).toBe('permission-denied');
    expect(mockedLocation.watchPositionAsync).not.toHaveBeenCalled();
    unsubscribe(); // no-op でも安全
  });

  it('位置情報サービス OFF なら services-disabled を onError して watch を張らない', async () => {
    mockedLocation.hasServicesEnabledAsync.mockResolvedValue(false);
    const provider = new ExpoLocationProvider({ clock: new FakeClock() });
    const errors: ProviderError[] = [];
    const unsubscribe = await provider.start(
      () => undefined,
      (error) => errors.push(error),
    );
    expect(errors[0]?.code).toBe('services-disabled');
    expect(mockedLocation.watchPositionAsync).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('watchPositionAsync が reject しても start は throw せず runtime-error', async () => {
    mockedLocation.watchPositionAsync.mockRejectedValue(new Error('boom'));
    const provider = new ExpoLocationProvider({ clock: new FakeClock() });
    const errors: ProviderError[] = [];
    const unsubscribe = await provider.start(
      () => undefined,
      (error) => errors.push(error),
    );
    expect(errors[0]?.code).toBe('runtime-error');
    expect(errors[0]?.detail).toBe('boom');
    unsubscribe();
  });

  it('getLastKnown は null / 有効値を変換して返す', async () => {
    const clock = new FakeClock(0, EPOCH);
    const provider = new ExpoLocationProvider({ clock });
    await expect(provider.getLastKnown()).resolves.toBeNull();

    mockedLocation.getLastKnownPositionAsync.mockResolvedValue(LOCATION_OBJECT);
    const fix = await provider.getLastKnown();
    expect(fix).toMatchObject({
      point: { latitude: 35.681236, longitude: 139.767125 },
      accuracyM: 8,
      source: 'device',
    });
  });

  it('unsubscribe は subscription.remove() を 1 回だけ呼ぶ（冪等）', async () => {
    const remove = jest.fn();
    mockedLocation.watchPositionAsync.mockResolvedValue({ remove });
    const provider = new ExpoLocationProvider({ clock: new FakeClock() });
    const unsubscribe = await provider.start(
      () => undefined,
      () => undefined,
    );
    unsubscribe();
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('権限の問い合わせ・要求を PermissionOutcome に変換する', async () => {
    const provider = new ExpoLocationProvider({ clock: new FakeClock() });
    await expect(provider.getPermissionState()).resolves.toEqual({
      status: 'granted',
      canAskAgain: true,
      androidAccuracy: 'fine',
    });
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue(DENIED_RESPONSE);
    await expect(provider.requestPermission()).resolves.toEqual({
      status: 'denied',
      canAskAgain: true,
      androidAccuracy: undefined,
    });
  });
});

describe('ExpoHeadingProvider — 可用性と E-08', () => {
  it('isAvailable は platform と API 有無で決まる', async () => {
    const android = new ExpoHeadingProvider({
      clock: new FakeClock(),
      platform: 'android',
      hasWatchHeading: true,
    });
    await expect(android.isAvailable()).resolves.toBe(true);
    const web = new ExpoHeadingProvider({
      clock: new FakeClock(),
      platform: 'web',
      hasWatchHeading: true,
    });
    await expect(web.isAvailable()).resolves.toBe(false);
    const missing = new ExpoHeadingProvider({
      clock: new FakeClock(),
      platform: 'android',
      hasWatchHeading: false,
    });
    await expect(missing.isAvailable()).resolves.toBe(false);
  });

  it('E-08: trueHeading=-1 は magHeading にフォールバックし magnetic-north', async () => {
    const clock = new FakeClock(0, EPOCH);
    const provider = new ExpoHeadingProvider({
      clock,
      platform: 'android',
      hasWatchHeading: true,
    });
    const fixes: HeadingFix[] = [];
    const unsubscribe = await provider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    clock.advance(5);
    const [onHeading] = watchHeadingArguments();
    onHeading(HEADING_OBJECT);

    expect(fixes).toEqual([
      {
        headingDeg: 123.4,
        reference: 'magnetic-north',
        accuracy: 2,
        receivedAtMonotonicMs: 5,
        receivedAtEpochMs: EPOCH + 5,
        source: 'device',
      },
    ]);
    unsubscribe();
  });

  it('trueHeading=359.9 はそのまま（正規化のみ）', async () => {
    const provider = new ExpoHeadingProvider({
      clock: new FakeClock(),
      platform: 'ios',
      hasWatchHeading: true,
    });
    const fixes: HeadingFix[] = [];
    const unsubscribe = await provider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    const [onHeading] = watchHeadingArguments();
    onHeading({ trueHeading: 359.9, magHeading: 10, accuracy: 3 });
    expect(fixes[0]?.headingDeg).toBeCloseTo(359.9, 9);
    expect(fixes[0]?.reference).toBe('true-north');
    unsubscribe();
  });

  it('platform: web は unsupported-platform を onError して購読しない', async () => {
    const provider = new ExpoHeadingProvider({
      clock: new FakeClock(),
      platform: 'web',
      hasWatchHeading: true,
    });
    const errors: ProviderError[] = [];
    const unsubscribe = await provider.start(
      () => undefined,
      (error) => errors.push(error),
    );
    expect(errors[0]?.code).toBe('unsupported-platform');
    expect(mockedLocation.watchHeadingAsync).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('errorHandler は runtime-error になる', async () => {
    const provider = new ExpoHeadingProvider({
      clock: new FakeClock(),
      platform: 'android',
      hasWatchHeading: true,
    });
    const errors: ProviderError[] = [];
    const unsubscribe = await provider.start(
      () => undefined,
      (error) => errors.push(error),
    );
    const [, onError] = watchHeadingArguments();
    onError('sensor error');
    expect(errors[0]?.code).toBe('runtime-error');
    unsubscribe();
  });

  it('watchHeadingAsync が reject しても start は throw しない', async () => {
    mockedLocation.watchHeadingAsync.mockRejectedValue(new Error('boom'));
    const provider = new ExpoHeadingProvider({
      clock: new FakeClock(),
      platform: 'android',
      hasWatchHeading: true,
    });
    const errors: ProviderError[] = [];
    const unsubscribe = await provider.start(
      () => undefined,
      (error) => errors.push(error),
    );
    expect(errors[0]?.code).toBe('runtime-error');
    unsubscribe();
  });

  it('unsubscribe は subscription.remove() を 1 回だけ呼ぶ（冪等）', async () => {
    const remove = jest.fn();
    mockedLocation.watchHeadingAsync.mockResolvedValue({ remove });
    const provider = new ExpoHeadingProvider({
      clock: new FakeClock(),
      platform: 'android',
      hasWatchHeading: true,
    });
    const unsubscribe = await provider.start(
      () => undefined,
      () => undefined,
    );
    unsubscribe();
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

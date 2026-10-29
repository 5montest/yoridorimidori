// expo-location の公式なモックデータは無い（空実装）。公式の一般手段どおりインライン jest.mock（§12.4）。
jest.mock('expo-location', () => ({
  geocodeAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

import * as Location from 'expo-location';
import { FakeClock } from '../clock/FakeClock';
import { ExpoPlaceSearchProvider } from '../expo/ExpoPlaceSearchProvider';
import { FALLBACK_DESTINATION_NAME } from '../../domain/placeCandidate';
import type { ProviderError } from '../../ports/common';

interface MockedExpoLocation {
  readonly geocodeAsync: jest.Mock;
  readonly reverseGeocodeAsync: jest.Mock;
}

const mockedLocation = Location as unknown as MockedExpoLocation;

const TOKYO_TOWER = { latitude: 35.658581, longitude: 139.745433 };

function makeProvider(options: {
  readonly platform?: string;
  readonly hasGeocode?: boolean;
  readonly warnings?: ProviderError[];
  readonly clock?: FakeClock;
} = {}): ExpoPlaceSearchProvider {
  const warnings = options.warnings ?? [];
  return new ExpoPlaceSearchProvider({
    clock: options.clock ?? new FakeClock(),
    platform: options.platform ?? 'android',
    hasGeocode: options.hasGeocode ?? true,
    onError: (error) => warnings.push(error),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedLocation.geocodeAsync.mockResolvedValue([]);
  mockedLocation.reverseGeocodeAsync.mockResolvedValue([]);
});

describe('ExpoPlaceSearchProvider — isAvailable（geocode は Android/iOS のみ）', () => {
  it('android / ios は true・web は false', async () => {
    await expect(makeProvider({ platform: 'android' }).isAvailable()).resolves.toBe(true);
    await expect(makeProvider({ platform: 'ios' }).isAvailable()).resolves.toBe(true);
    await expect(makeProvider({ platform: 'web' }).isAvailable()).resolves.toBe(false);
  });

  it('geocode API が無ければ false', async () => {
    await expect(makeProvider({ hasGeocode: false }).isAvailable()).resolves.toBe(false);
  });
});

describe('ExpoPlaceSearchProvider — search（geocodeAsync）', () => {
  it('検索語を trim して geocodeAsync に渡し、候補を返す（name は検索語）', async () => {
    mockedLocation.geocodeAsync.mockResolvedValue([TOKYO_TOWER]);
    const candidates = await makeProvider().search('  東京タワー  ');

    expect(mockedLocation.geocodeAsync).toHaveBeenCalledWith('東京タワー');
    expect(candidates).toEqual([
      {
        id: 'geocode:35.658581,139.745433',
        name: '東京タワー',
        address: null,
        point: TOKYO_TOWER,
        source: 'geocode',
      },
    ]);
  });

  it('空文字・空白のみは []（geocodeAsync を呼ばない）', async () => {
    await expect(makeProvider().search('')).resolves.toEqual([]);
    await expect(makeProvider().search('   ')).resolves.toEqual([]);
    expect(mockedLocation.geocodeAsync).not.toHaveBeenCalled();
  });

  it('geocode API が無ければ []', async () => {
    await expect(makeProvider({ hasGeocode: false }).search('東京タワー')).resolves.toEqual([]);
    expect(mockedLocation.geocodeAsync).not.toHaveBeenCalled();
  });

  it('0 件は []', async () => {
    mockedLocation.geocodeAsync.mockResolvedValue([]);
    await expect(makeProvider().search('存在しない場所')).resolves.toEqual([]);
  });

  it('不正な戻り値（NaN / 範囲外）は捨て、有効なものだけ候補にする', async () => {
    mockedLocation.geocodeAsync.mockResolvedValue([
      { latitude: NaN, longitude: 139.7 },
      { latitude: 91, longitude: 139.7 },
      { latitude: 35.6, longitude: 139.7 },
    ]);
    const candidates = await makeProvider().search('どこか');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.point).toEqual({ latitude: 35.6, longitude: 139.7 });
  });

  it('失敗時は [] を返し onError に runtime-error を通知する（throw しない）', async () => {
    mockedLocation.geocodeAsync.mockRejectedValue(new Error('offline'));
    const warnings: ProviderError[] = [];
    const clock = new FakeClock(0, 1_000);
    clock.advance(500);

    await expect(makeProvider({ warnings, clock }).search('東京タワー')).resolves.toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: 'runtime-error',
      atMonotonicMs: 500,
      detail: 'offline',
    });
  });
});

describe('ExpoPlaceSearchProvider — reverse（reverseGeocodeAsync）', () => {
  it('住所から表示名・住所を作り、座標は入力点を使う', async () => {
    mockedLocation.reverseGeocodeAsync.mockResolvedValue([
      {
        name: '東京タワー',
        street: '芝公園',
        city: '港区',
        formattedAddress: '日本、東京都港区芝公園4丁目2-8',
      },
    ]);
    const candidate = await makeProvider().reverse(TOKYO_TOWER);

    expect(mockedLocation.reverseGeocodeAsync).toHaveBeenCalledWith({
      latitude: TOKYO_TOWER.latitude,
      longitude: TOKYO_TOWER.longitude,
    });
    expect(candidate).toEqual({
      id: 'reverse:35.658581,139.745433',
      name: '東京タワー',
      address: '日本、東京都港区芝公園4丁目2-8',
      point: TOKYO_TOWER,
      source: 'reverse-geocode',
    });
  });

  it('住所が空でも「選択した地点」にフォールバックする', async () => {
    mockedLocation.reverseGeocodeAsync.mockResolvedValue([{}]);
    const candidate = await makeProvider().reverse(TOKYO_TOWER);
    expect(candidate?.name).toBe(FALLBACK_DESTINATION_NAME);
    expect(candidate?.address).toBeNull();
  });

  it('不正な座標は null（reverseGeocodeAsync を呼ばない）', async () => {
    await expect(
      makeProvider().reverse({ latitude: NaN, longitude: 0 }),
    ).resolves.toBeNull();
    await expect(makeProvider().reverse({ latitude: 91, longitude: 0 })).resolves.toBeNull();
    expect(mockedLocation.reverseGeocodeAsync).not.toHaveBeenCalled();
  });

  it('0 件は null', async () => {
    mockedLocation.reverseGeocodeAsync.mockResolvedValue([]);
    await expect(makeProvider().reverse(TOKYO_TOWER)).resolves.toBeNull();
  });

  it('失敗時は null を返し onError に runtime-error を通知する（throw しない）', async () => {
    mockedLocation.reverseGeocodeAsync.mockRejectedValue(new Error('network'));
    const warnings: ProviderError[] = [];
    await expect(makeProvider({ warnings }).reverse(TOKYO_TOWER)).resolves.toBeNull();
    expect(warnings[0]?.code).toBe('runtime-error');
  });
});

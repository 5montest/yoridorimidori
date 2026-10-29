import {
  FALLBACK_DESTINATION_NAME,
  buildAddressLine,
  buildDestinationName,
  createPlaceCandidate,
  extractCoordinatePair,
  extractUrls,
} from '../placeCandidate';
import type { GeoPoint } from '../types';

const TOKYO_TOWER: GeoPoint = { latitude: 35.658581, longitude: 139.745433 };

describe('buildDestinationName — 共有テキスト（非座標行）', () => {
  it('場所名の行をそのまま返す', () => {
    expect(buildDestinationName('東京タワー')).toBe('東京タワー');
  });

  it('URL・座標の行をスキップして場所名の行を探す', () => {
    const text = '東京タワー\n35.6586, 139.7454\nhttps://maps.app.goo.gl/AbCdEf123';
    expect(buildDestinationName(text)).toBe('東京タワー');
  });

  it('座標の後ろに書かれた括弧付きの場所名も取り出す', () => {
    expect(buildDestinationName('35.6586, 139.7454（東京タワー）')).toBe('東京タワー');
  });

  it('空白を畳み、前後の括弧・区切り記号を落とす', () => {
    expect(buildDestinationName('  東京   タワー  ')).toBe('東京 タワー');
    expect(buildDestinationName('「東京タワー」')).toBe('東京タワー');
    expect(buildDestinationName('目的地: 東京タワー.')).toBe('目的地: 東京タワー');
  });

  it('50 文字を超える名前は 50 文字に切り詰める', () => {
    const longName = 'あ'.repeat(60);
    const name = buildDestinationName(longName);
    expect(name).not.toBeNull();
    expect(name).toHaveLength(50);
  });

  it('候補が無ければ null', () => {
    expect(buildDestinationName('')).toBeNull();
    expect(buildDestinationName('   \n  ')).toBeNull();
    expect(buildDestinationName('https://example.com')).toBeNull();
    expect(buildDestinationName('35.6586, 139.7454')).toBeNull();
  });
});

describe('buildDestinationName — 逆ジオコーディング結果（住所の連結）', () => {
  it('name を最優先する', () => {
    expect(
      buildDestinationName({
        name: '東京タワー',
        formattedAddress: '日本、東京都港区芝公園4丁目2-8',
        city: '港区',
      }),
    ).toBe('東京タワー');
  });

  it('name が無ければ formattedAddress', () => {
    expect(
      buildDestinationName({
        name: null,
        formattedAddress: '日本、東京都港区芝公園4丁目2-8',
        city: '港区',
      }),
    ).toBe('日本、東京都港区芝公園4丁目2-8');
  });

  it('構造化フィールドは streetNumber + street + district + city + region の順で連結する', () => {
    expect(
      buildDestinationName({
        name: null,
        streetNumber: '4-2-8',
        street: '芝公園',
        district: '港区',
        city: '東京都',
      }),
    ).toBe('4-2-8 芝公園 港区 東京都');
  });

  it('すべて空なら「選択した地点」にフォールバックする', () => {
    expect(buildDestinationName({})).toBe(FALLBACK_DESTINATION_NAME);
    expect(buildDestinationName(null)).toBe(FALLBACK_DESTINATION_NAME);
    expect(buildDestinationName(undefined)).toBe(FALLBACK_DESTINATION_NAME);
    expect(buildDestinationName({ name: '   ' })).toBe(FALLBACK_DESTINATION_NAME);
  });

  it('長い名前は 50 文字に切り詰める', () => {
    const name = buildDestinationName({ name: 'い'.repeat(80) });
    expect(name).toHaveLength(50);
  });
});

describe('buildAddressLine', () => {
  it('formattedAddress を優先する', () => {
    expect(
      buildAddressLine({
        formattedAddress: '日本、東京都港区芝公園4丁目2-8',
        city: '港区',
      }),
    ).toBe('日本、東京都港区芝公園4丁目2-8');
  });

  it('formattedAddress が無ければ構造化フィールドを連結する', () => {
    expect(buildAddressLine({ streetNumber: '4-2-8', street: '芝公園', city: '港区' })).toBe(
      '4-2-8 芝公園 港区',
    );
  });

  it('空・非オブジェクトは null', () => {
    expect(buildAddressLine({})).toBeNull();
    expect(buildAddressLine(null)).toBeNull();
    expect(buildAddressLine(undefined)).toBeNull();
    expect(buildAddressLine({ name: '東京タワー' })).toBeNull(); // 名前は住所ではない
  });
});

describe('createPlaceCandidate', () => {
  it('有効な入力を検証して候補を作る', () => {
    expect(
      createPlaceCandidate({
        id: 'map:35.658581,139.745433',
        name: '  東京タワー  ',
        address: ' 東京都港区芝公園4丁目2-8 ',
        point: TOKYO_TOWER,
        source: 'map',
      }),
    ).toEqual({
      id: 'map:35.658581,139.745433',
      name: '東京タワー',
      address: '東京都港区芝公園4丁目2-8',
      point: TOKYO_TOWER,
      source: 'map',
    });
  });

  it('name が空なら address を名前にする', () => {
    expect(
      createPlaceCandidate({ id: 'x', name: null, address: '東京都港区', point: TOKYO_TOWER, source: 'geocode' })
        ?.name,
    ).toBe('東京都港区');
  });

  it('name も address も空なら null', () => {
    expect(
      createPlaceCandidate({ id: 'x', name: '  ', address: '  ', point: TOKYO_TOWER, source: 'geocode' }),
    ).toBeNull();
  });

  it('不正な座標・id・source は null（throw しない）', () => {
    const point = TOKYO_TOWER;
    expect(
      createPlaceCandidate({ id: 'x', name: 'a', point: { latitude: NaN, longitude: 0 }, source: 'map' }),
    ).toBeNull();
    expect(
      createPlaceCandidate({ id: 'x', name: 'a', point: { latitude: 91, longitude: 0 }, source: 'map' }),
    ).toBeNull();
    expect(createPlaceCandidate({ id: '', name: 'a', point, source: 'map' })).toBeNull();
    expect(
      createPlaceCandidate({
        id: 'x',
        name: 'a',
        point,
        source: 'unknown' as unknown as 'map',
      }),
    ).toBeNull();
    expect(createPlaceCandidate(null as unknown as Parameters<typeof createPlaceCandidate>[0])).toBeNull();
  });

  it('長い名前は 50 文字に切り詰める', () => {
    const candidate = createPlaceCandidate({
      id: 'x',
      name: 'う'.repeat(80),
      point: TOKYO_TOWER,
      source: 'reverse-geocode',
    });
    expect(candidate?.name).toHaveLength(50);
  });
});

describe('extractUrls / extractCoordinatePair（共有テキストの低レベル抽出）', () => {
  it('http(s) と geo: の URL を抽出する', () => {
    expect(
      extractUrls('東京タワー\nhttps://maps.app.goo.gl/AbC\ngoe:35.6,139.7'),
    ).toEqual(['https://maps.app.goo.gl/AbC']);
    expect(extractUrls('geo:35.6,139.7')).toEqual(['geo:35.6,139.7']);
  });

  it('URL 末尾の句読点を落とす（ラベルの括弧は保持）', () => {
    expect(extractUrls('https://example.com/a。')).toEqual(['https://example.com/a']);
    expect(extractUrls('geo:0,0?q=1,2(Label)')).toEqual(['geo:0,0?q=1,2(Label)']);
  });

  it('座標ペアの最初の有効値を返す（無効値はスキップ）', () => {
    expect(extractCoordinatePair('91,0 と 35.6,139.7')).toEqual({
      latitude: 35.6,
      longitude: 139.7,
    });
    expect(extractCoordinatePair('座標なし')).toBeNull();
  });
});

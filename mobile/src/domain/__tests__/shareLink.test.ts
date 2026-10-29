import { isShortMapLink, parseDeepLinkDestination, parseSharedLocation } from '../shareLink';

describe('isShortMapLink', () => {
  it('maps.app.goo.gl の URL を短縮リンクとして認識する', () => {
    expect(isShortMapLink('https://maps.app.goo.gl/AbCdEf123')).toBe(true);
    expect(isShortMapLink('http://maps.app.goo.gl/AbCdEf123')).toBe(true);
    expect(isShortMapLink('  https://maps.app.goo.gl/AbCdEf123  ')).toBe(true);
    expect(isShortMapLink('maps.app.goo.gl/AbCdEf123')).toBe(true); // スキーム省略
  });

  it('通常の Google マップ URL・他ホスト・空文字は false', () => {
    expect(isShortMapLink('https://www.google.com/maps/search/?api=1&query=35.6,139.7')).toBe(false);
    expect(isShortMapLink('https://maps.google.com/?q=35.6,139.7')).toBe(false);
    expect(isShortMapLink('https://example.com/maps.app.goo.gl')).toBe(false);
    expect(isShortMapLink('')).toBe(false);
    expect(isShortMapLink('maps.app.goo.gl.example.com/x')).toBe(false);
  });
});

describe('parseSharedLocation — geo: URI', () => {
  it('geo:lat,lon を解析する', () => {
    expect(parseSharedLocation('geo:35.6586,139.7454')).toEqual({
      point: { latitude: 35.6586, longitude: 139.7454 },
      name: null,
      kind: 'geo-uri',
      needsResolution: false,
    });
  });

  it('?z= / ;z= などのパラメータ付きでも先頭の座標を解析する', () => {
    expect(parseSharedLocation('geo:35.6586,139.7454?z=15')?.point).toEqual({
      latitude: 35.6586,
      longitude: 139.7454,
    });
    expect(parseSharedLocation('geo:35.6586,139.7454;z=15')?.point).toEqual({
      latitude: 35.6586,
      longitude: 139.7454,
    });
  });

  it('geo:0,0?q=lat,lon(label) 形式（Google 公式）を解析する', () => {
    expect(parseSharedLocation('geo:0,0?q=34.99,-106.61(Treasure)')).toEqual({
      point: { latitude: 34.99, longitude: -106.61 },
      name: 'Treasure',
      kind: 'geo-uri',
      needsResolution: false,
    });
  });

  it('q= のパーセントエンコードされた日本語ラベルを名前にする', () => {
    const value = encodeURIComponent('35.6586,139.7454(東京タワー)');
    const result = parseSharedLocation(`geo:0,0?q=${value}`);
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
    expect(result?.name).toBe('東京タワー');
  });

  it('前後の場所名テキストを name として取り出す', () => {
    expect(parseSharedLocation('東京タワー\ngeo:35.6586,139.7454')?.name).toBe('東京タワー');
  });

  it('geo:0,0（位置指定なし）・不正・範囲外は null', () => {
    expect(parseSharedLocation('geo:0,0')).toBeNull();
    expect(parseSharedLocation('geo:abc')).toBeNull();
    expect(parseSharedLocation('geo:91,0')).toBeNull();
    expect(parseSharedLocation('geo:35.6,181')).toBeNull();
    expect(parseSharedLocation('geo:0,0?q=東京タワー')).toBeNull(); // 住所検索は座標なし
  });
});

describe('parseSharedLocation — Google マップ URL', () => {
  it('?q=lat,lon', () => {
    expect(parseSharedLocation('https://www.google.com/maps?q=35.6586,139.7454')).toEqual({
      point: { latitude: 35.6586, longitude: 139.7454 },
      name: null,
      kind: 'google-maps-url',
      needsResolution: false,
    });
  });

  it('?query=lat,lon（公式形式・%2C エンコード）', () => {
    expect(
      parseSharedLocation('https://www.google.com/maps/search/?api=1&query=35.6586%2C139.7454')
        ?.point,
    ).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });

  it('?ll=lat,lon', () => {
    expect(
      parseSharedLocation('https://maps.google.com/?ll=35.6586,139.7454&z=15')?.point,
    ).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });

  it('?daddr=lat,lon', () => {
    expect(
      parseSharedLocation('https://maps.google.com/?daddr=35.6586,139.7454')?.point,
    ).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });

  it('?destination=lat,lon（経路 URL）', () => {
    expect(
      parseSharedLocation('https://www.google.com/maps/dir/?api=1&destination=35.6586,139.7454')
        ?.point,
    ).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });

  it('q=lat,lon(label) のラベルを名前にする', () => {
    const url = `https://www.google.com/maps?q=35.6586,139.7454(${encodeURIComponent('東京タワー')})`;
    const result = parseSharedLocation(url);
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
    expect(result?.name).toBe('東京タワー');
  });

  it('前後の場所名テキストを name として取り出す', () => {
    const result = parseSharedLocation(
      '東京タワー\nhttps://www.google.com/maps?q=35.6586,139.7454',
    );
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
    expect(result?.name).toBe('東京タワー');
  });

  it('座標を含まない Google マップ URL（地名検索・@座標）は null', () => {
    expect(
      parseSharedLocation('https://www.google.com/maps/search/?api=1&query=東京タワー'),
    ).toBeNull();
    expect(parseSharedLocation('https://www.google.com/maps/@35.6586,139.7454,15z')).toBeNull();
  });

  it('Google 以外のホストは null', () => {
    expect(parseSharedLocation('https://example.com/?q=35.6586,139.7454')).toBeNull();
  });
});

describe('parseSharedLocation — 短縮リンク', () => {
  it('座標を持たないため needsResolution=true / point=null', () => {
    expect(parseSharedLocation('https://maps.app.goo.gl/AbCdEf123')).toEqual({
      point: null,
      name: null,
      kind: 'google-maps-url',
      needsResolution: true,
    });
  });

  it('前後の場所名テキストは name として取り出す', () => {
    expect(parseSharedLocation('東京タワー\nhttps://maps.app.goo.gl/AbCdEf123')).toEqual({
      point: null,
      name: '東京タワー',
      kind: 'google-maps-url',
      needsResolution: true,
    });
  });
});

describe('parseSharedLocation — 本文中の座標', () => {
  it('lat, lon を解析する（kind=coordinates）', () => {
    expect(parseSharedLocation('35.6586, 139.7454')).toEqual({
      point: { latitude: 35.6586, longitude: 139.7454 },
      name: null,
      kind: 'coordinates',
      needsResolution: false,
    });
  });

  it('前後の場所名テキストを name として取り出す', () => {
    expect(parseSharedLocation('東京タワー\n35.6586, 139.7454')?.name).toBe('東京タワー');
  });

  it('座標の後ろに括弧書きの場所名があれば name にする', () => {
    expect(parseSharedLocation('35.6586, 139.7454（東京タワー）')?.name).toBe('東京タワー');
  });

  it('日本語の読点・前置き・文末ピリオドを許容する', () => {
    expect(parseSharedLocation('35.6586、139.7454')?.point).toEqual({
      latitude: 35.6586,
      longitude: 139.7454,
    });
    const result = parseSharedLocation('目的地: 35.6586, 139.7454.');
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
    expect(result?.name).toBe('目的地');
  });

  it('負の座標・境界値（±90 / ±180）は有効', () => {
    expect(parseSharedLocation('-33.8688, 151.2093')?.point).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
    });
    expect(parseSharedLocation('90, 180')?.point).toEqual({ latitude: 90, longitude: 180 });
    expect(parseSharedLocation('-90, -180')?.point).toEqual({ latitude: -90, longitude: -180 });
  });

  it('範囲外（緯度 91・経度 181）は null', () => {
    expect(parseSharedLocation('91, 0')).toBeNull();
    expect(parseSharedLocation('0, 181')).toBeNull();
  });

  it('不正・空・未知形式は null（throw しない）', () => {
    expect(parseSharedLocation('')).toBeNull();
    expect(parseSharedLocation('   ')).toBeNull();
    expect(parseSharedLocation('hello')).toBeNull();
    expect(parseSharedLocation('lat: 35, lon: 139')).toBeNull();
    expect(parseSharedLocation(null as unknown as string)).toBeNull();
    expect(parseSharedLocation(undefined as unknown as string)).toBeNull();
  });

  it('複数の座標のうち最初の有効値を採用する（無効値はスキップ）', () => {
    expect(parseSharedLocation('91,0 と 35.6,139.7')?.point).toEqual({
      latitude: 35.6,
      longitude: 139.7,
    });
  });
});

describe('parseSharedLocation — 複数 URL・優先順位', () => {
  it('geo: を Google マップ URL より優先する', () => {
    const result = parseSharedLocation(
      'https://www.google.com/maps?q=1,2\ngeo:35.6586,139.7454',
    );
    expect(result?.kind).toBe('geo-uri');
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });

  it('短縮リンクと座標付き URL が混在する場合は座標を優先する', () => {
    const result = parseSharedLocation(
      'https://maps.app.goo.gl/AbCdEf123\nhttps://www.google.com/maps?q=35.6586,139.7454',
    );
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
    expect(result?.needsResolution).toBe(false);
  });

  it('複数の Google マップ URL は最初に座標が取れたもの', () => {
    const result = parseSharedLocation(
      'https://www.google.com/maps?q=1,2\nhttps://www.google.com/maps?q=3,4',
    );
    expect(result?.point).toEqual({ latitude: 1, longitude: 2 });
  });

  it('短縮リンクだけの場合は最初の短縮リンクを needsResolution として返す', () => {
    const result = parseSharedLocation(
      'https://maps.app.goo.gl/AAA\nhttps://maps.app.goo.gl/BBB',
    );
    expect(result?.needsResolution).toBe(true);
    expect(result?.point).toBeNull();
  });
});

describe('parseDeepLinkDestination — アプリのディープリンク（UX 設計 §F6）', () => {
  const encodedName = encodeURIComponent('東京タワー');

  it('yoridorimidori://set?lat=&lon=&name=（development build 形式）', () => {
    expect(
      parseDeepLinkDestination(
        `yoridorimidori://set?lat=35.6586&lon=139.7454&name=${encodedName}`,
      ),
    ).toEqual({
      point: { latitude: 35.6586, longitude: 139.7454 },
      name: '東京タワー',
    });
  });

  it('Expo Go の /--/set 形式', () => {
    expect(
      parseDeepLinkDestination(
        `exp://127.0.0.1:8081/--/set?lat=35.6586&lon=139.7454&name=${encodedName}`,
      ),
    ).toEqual({
      point: { latitude: 35.6586, longitude: 139.7454 },
      name: '東京タワー',
    });
  });

  it('https の /--/set 形式（任意 scheme）', () => {
    expect(
      parseDeepLinkDestination('https://example.com/--/set?lat=35.6586&lon=139.7454'),
    ).toEqual({ point: { latitude: 35.6586, longitude: 139.7454 }, name: null });
  });

  it('name 省略時は null・+ は空白として復号される', () => {
    expect(parseDeepLinkDestination('yoridorimidori://set?lat=1&lon=2')).toEqual({
      point: { latitude: 1, longitude: 2 },
      name: null,
    });
    expect(parseDeepLinkDestination('yoridorimidori://set?lat=1&lon=2&name=Tokyo+Tower')?.name).toBe(
      'Tokyo Tower',
    );
  });

  it('lat / lon 欠落・不正・範囲外は null', () => {
    expect(parseDeepLinkDestination('yoridorimidori://set?lon=139.7')).toBeNull();
    expect(parseDeepLinkDestination('yoridorimidori://set?lat=35.6')).toBeNull();
    expect(parseDeepLinkDestination('yoridorimidori://set?lat=abc&lon=139.7')).toBeNull();
    expect(parseDeepLinkDestination('yoridorimidori://set?lat=91&lon=139.7')).toBeNull();
    expect(parseDeepLinkDestination('yoridorimidori://set?lat=35.6&lon=181')).toBeNull();
  });

  it('未知のパス・空文字・非文字列は null（throw しない）', () => {
    expect(parseDeepLinkDestination('yoridorimidori://login?lat=1&lon=2')).toBeNull();
    expect(parseDeepLinkDestination('yoridorimidori://set/sub?lat=1&lon=2')).not.toBeNull(); // set/ 配下は許可
    expect(parseDeepLinkDestination('')).toBeNull();
    expect(parseDeepLinkDestination(null as unknown as string)).toBeNull();
  });

  it('name は 50 文字に切り詰める', () => {
    const longName = 'あ'.repeat(60);
    const result = parseDeepLinkDestination(
      `yoridorimidori://set?lat=1&lon=2&name=${encodeURIComponent(longName)}`,
    );
    expect(result?.name).toHaveLength(50);
  });
});

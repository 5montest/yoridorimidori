import { extractUrls } from '../../domain/placeCandidate';
import {
  extractCoordinatesFromText,
  extractNameFromSharedText,
  extractTitleFromHtml,
  isGenericMapTitle,
  sanitizeDestinationName,
  resolveSharedText,
} from '../network/SharedTextResolver';

describe('resolveSharedText（共有テキスト → 目的地）', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('座標を含むテキストは通信せずに解決する', async () => {
    const result = await resolveSharedText('東京タワー 35.6586, 139.7454', fetchMock as never);
    expect(result).not.toBeNull();
    expect(result?.point.latitude).toBeCloseTo(35.6586, 6);
    expect(result?.point.longitude).toBeCloseTo(139.7454, 6);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('geo: URI を解決する', async () => {
    const result = await resolveSharedText('geo:35.681236,139.767125?z=17', fetchMock as never);
    expect(result?.point).toEqual({ latitude: 35.681236, longitude: 139.767125 });
  });

  it('座標入りの Google マップ URL を解決する', async () => {
    const result = await resolveSharedText(
      'https://www.google.com/maps?q=35.6586,139.7454',
      fetchMock as never,
    );
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });

  it('短縮リンクは HTTP リダイレクト先から座標を解決する', async () => {
    fetchMock.mockResolvedValue({
      url: 'https://www.google.com/maps/place/%E6%9D%B1%E4%BA%AC%E3%82%BF%E3%83%AF%E3%83%BC/@35.6586,139.7454,17z',
    });
    const result = await resolveSharedText(
      '東京タワー\nhttps://maps.app.goo.gl/abcdef',
      fetchMock as never,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });

  it('短縮リンクの解決に失敗したら null（throw しない）', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));
    const result = await resolveSharedText('https://maps.app.goo.gl/abcdef', fetchMock as never);
    expect(result).toBeNull();
  });

  it('展開先にも座標が無ければ null', async () => {
    fetchMock.mockResolvedValue({ url: 'https://www.google.com/maps' });
    const result = await resolveSharedText('https://maps.app.goo.gl/abcdef', fetchMock as never);
    expect(result).toBeNull();
  });

  it('未知のテキストは null', async () => {
    expect(await resolveSharedText('こんにちは', fetchMock as never)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('空文字は null', async () => {
    expect(await resolveSharedText('', fetchMock as never)).toBeNull();
    expect(await resolveSharedText('   ', fetchMock as never)).toBeNull();
  });

  it('extractUrls は短縮リンクを抽出できる（前提の確認）', () => {
    const urls = extractUrls('東京タワー\nhttps://maps.app.goo.gl/abcdef');
    expect(urls.some((url) => url.includes('maps.app.goo.gl'))).toBe(true);
  });
});

describe('resolveSharedText: HTML からの座標抽出（実 Google マップ共有対策）', () => {
  it('短縮リンクの応答 URL に座標が無くても HTML 本文から抽出する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      url: 'https://maps.app.goo.gl/abcdef',
      text: async () =>
        '<html><head><meta property="og:url" content="https://www.google.com/maps/place/X/@35.6586,139.7454,17z"></head><body>!3d35.6586!4d139.7454</body></html>',
    });
    const result = await resolveSharedText(
      '東京タワー\nhttps://maps.app.goo.gl/abcdef',
      fetchMock as never,
    );
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });

  it('座標の無い長い地図 URL も HTML から抽出する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      url: 'https://www.google.com/maps/place/%E6%9D%B1%E4%BA%AC%E3%82%BF%E3%83%AF%E3%83%BC',
      text: async () => '<script>window.data = {"latitude":35.6586,"longitude":139.7454};</script>',
    });
    const result = await resolveSharedText(
      'https://www.google.com/maps/place/%E6%9D%B1%E4%BA%AC%E3%82%BF%E3%83%AF%E3%83%BC',
      fetchMock as never,
    );
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });

  it('HTML にも座標が無ければ null', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      url: 'https://maps.app.goo.gl/abcdef',
      text: async () => '<html>no coordinates here</html>',
    });
    expect(await resolveSharedText('https://maps.app.goo.gl/abcdef', fetchMock as never)).toBeNull();
  });
});

describe('extractCoordinatesFromText', () => {
  it('代表的な座標埋め込み形式を抽出する', () => {
    expect(extractCoordinatesFromText('x!3d35.1!4d139.2')).toEqual({ latitude: 35.1, longitude: 139.2 });
    expect(extractCoordinatesFromText('https://x/maps/@35.1,139.2,17z')).toEqual({
      latitude: 35.1,
      longitude: 139.2,
    });
    expect(extractCoordinatesFromText('{"latitude":35.1,"longitude":139.2}')).toEqual({
      latitude: 35.1,
      longitude: 139.2,
    });
    expect(extractCoordinatesFromText('https://x/?ll=35.1,139.2')).toEqual({
      latitude: 35.1,
      longitude: 139.2,
    });
    expect(extractCoordinatesFromText('center=35.1%2C139.2')).toEqual({
      latitude: 35.1,
      longitude: 139.2,
    });
  });

  it('範囲外・原点・空文字は null', () => {
    expect(extractCoordinatesFromText('!3d95.0!4d139.0')).toBeNull();
    expect(extractCoordinatesFromText('!3d0!4d0')).toBeNull();
    expect(extractCoordinatesFromText('')).toBeNull();
  });
});

describe('resolveSharedText: 共有テキストから場所名を取り出す', () => {
  it('URL を除いた部分を名前にする（Google マップ共有形式）', () => {
    expect(extractNameFromSharedText('ららぽーとTOKYO-BAY\nhttps://maps.app.goo.gl/WCsJBbqQvS9wErts9')).toBe(
      'ららぽーとTOKYO-BAY',
    );
    expect(extractNameFromSharedText('https://maps.app.goo.gl/abc')).toBeNull();
    expect(extractNameFromSharedText('')).toBeNull();
  });

  it('短縮リンク共有では場所名を name に使う', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      url: 'https://maps.app.goo.gl/WCsJBbqQvS9wErts9',
      text: async () => '<html>!3d35.6586!4d139.7454</html>',
    });
    const result = await resolveSharedText(
      'ららぽーとTOKYO-BAY\nhttps://maps.app.goo.gl/WCsJBbqQvS9wErts9',
      fetchMock as never,
    );
    expect(result?.name).toBe('ららぽーとTOKYO-BAY');
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });
});

describe('extractTitleFromHtml / HTML タイトルから場所名', () => {
  it('og:title から場所名を取り出す（接尾辞を除去）', () => {
    expect(
      extractTitleFromHtml(
        '<meta property="og:title" content="ららぽーとTOKYO-BAY - Google マップ" />',
      ),
    ).toBe('ららぽーとTOKYO-BAY');
    expect(extractTitleFromHtml('<title>東京タワー - Google Maps</title>')).toBe('東京タワー');
  });

  it('HTML エンティティをデコードする', () => {
    expect(extractTitleFromHtml('<title>A &amp; B - Google マップ</title>')).toBe('A & B');
  });

  it('タイトルが無ければ null', () => {
    expect(extractTitleFromHtml('<html></html>')).toBeNull();
    expect(extractTitleFromHtml('')).toBeNull();
  });

  it('短縮リンク共有で HTML タイトルを目的地名に使う', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      url: 'https://maps.app.goo.gl/WCsJBbqQvS9wErts9',
      text: async () =>
        '<html><head><meta property="og:title" content="ららぽーとTOKYO-BAY - Google マップ"><script>!3d35.6586!4d139.7454</script></head></html>',
    });
    const result = await resolveSharedText(
      'https://maps.app.goo.gl/WCsJBbqQvS9wErts9',
      fetchMock as never,
    );
    expect(result?.name).toBe('ららぽーとTOKYO-BAY');
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });
});

describe('汎用タイトルの除外と nameHint', () => {
  it('「Google Maps」等は目的地名として使わない', () => {
    expect(isGenericMapTitle('Google Maps')).toBe(true);
    expect(isGenericMapTitle('Google マップ')).toBe(true);
    expect(isGenericMapTitle('地図')).toBe(true);
    expect(isGenericMapTitle('ららぽーとTOKYO-BAY')).toBe(false);
    expect(sanitizeDestinationName('Google Maps')).toBeNull();
    expect(sanitizeDestinationName('  ')).toBeNull();
    expect(sanitizeDestinationName('東京タワー')).toBe('東京タワー');
  });

  it('HTML タイトルが汎用でも nameHint（共有タイトル）を名前に使う', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      url: 'https://maps.app.goo.gl/WCsJBbqQvS9wErts9',
      text: async () =>
        '<html><head><title>Google Maps</title><script>!3d35.6586!4d139.7454</script></head></html>',
    });
    const result = await resolveSharedText(
      'https://maps.app.goo.gl/WCsJBbqQvS9wErts9',
      fetchMock as never,
      'ららぽーとTOKYO-BAY',
    );
    expect(result?.name).toBe('ららぽーとTOKYO-BAY');
    expect(result?.point).toEqual({ latitude: 35.6586, longitude: 139.7454 });
  });
});

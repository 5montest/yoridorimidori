import { extractUrls } from '../../domain/placeCandidate';
import { resolveSharedText } from '../network/SharedTextResolver';

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

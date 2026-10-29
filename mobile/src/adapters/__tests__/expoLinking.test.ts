// expo-linking はインライン jest.mock（§12.4）。
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(),
  addEventListener: jest.fn(),
  unwrapDevLaunchURL: jest.fn((url: string) => url),
}));

import * as Linking from 'expo-linking';
import { FakeClock } from '../clock/FakeClock';
import { ExpoLinkingProvider } from '../expo/ExpoLinkingProvider';
import type { ProviderError } from '../../ports/common';

interface MockedExpoLinking {
  readonly getInitialURL: jest.Mock;
  readonly addEventListener: jest.Mock;
  readonly unwrapDevLaunchURL: jest.Mock;
}

const mockedLinking = Linking as unknown as MockedExpoLinking;

const DEEP_LINK = 'yoridorimidori://set?lat=35.6586&lon=139.7454&name=%E6%9D%B1%E4%BA%AC%E3%82%BF%E3%83%AF%E3%83%BC';

beforeEach(() => {
  jest.clearAllMocks();
  mockedLinking.getInitialURL.mockResolvedValue(null);
  mockedLinking.unwrapDevLaunchURL.mockImplementation((url: string) => url);
  mockedLinking.addEventListener.mockImplementation(() => ({ remove: jest.fn() }));
});

describe('ExpoLinkingProvider — getInitialUrl', () => {
  it('生の URL を返し、unwrapDevLaunchURL を通す（SDK 58）', async () => {
    const wrapperUrl = `myapp://expo-development-client/?url=${encodeURIComponent(
      'exp://127.0.0.1:8081/--/set?lat=35.6&lon=139.7',
    )}`;
    mockedLinking.getInitialURL.mockResolvedValue(wrapperUrl);
    mockedLinking.unwrapDevLaunchURL.mockReturnValue(
      'exp://127.0.0.1:8081/--/set?lat=35.6&lon=139.7',
    );

    const provider = new ExpoLinkingProvider({ clock: new FakeClock() });
    await expect(provider.getInitialUrl()).resolves.toBe(
      'exp://127.0.0.1:8081/--/set?lat=35.6&lon=139.7',
    );
    expect(mockedLinking.unwrapDevLaunchURL).toHaveBeenCalledWith(wrapperUrl);
  });

  it('URL が無ければ null', async () => {
    mockedLinking.getInitialURL.mockResolvedValue(null);
    const provider = new ExpoLinkingProvider({ clock: new FakeClock() });
    await expect(provider.getInitialUrl()).resolves.toBeNull();
  });

  it('取得失敗時は null を返し onError に runtime-error を通知する（throw しない）', async () => {
    mockedLinking.getInitialURL.mockRejectedValue(new Error('boom'));
    const warnings: ProviderError[] = [];
    const provider = new ExpoLinkingProvider({
      clock: new FakeClock(),
      onError: (error) => warnings.push(error),
    });
    await expect(provider.getInitialUrl()).resolves.toBeNull();
    expect(warnings[0]?.code).toBe('runtime-error');
  });

  it('unwrapDevLaunchURL が失敗しても生 URL にフォールバックする', async () => {
    mockedLinking.getInitialURL.mockResolvedValue(DEEP_LINK);
    mockedLinking.unwrapDevLaunchURL.mockImplementation(() => {
      throw new Error('bad launcher url');
    });
    const provider = new ExpoLinkingProvider({ clock: new FakeClock() });
    await expect(provider.getInitialUrl()).resolves.toBe(DEEP_LINK);
  });
});

describe('ExpoLinkingProvider — subscribe', () => {
  it('url イベントの URL をハンドラへ渡し、解除で remove() を 1 回呼ぶ（冪等）', () => {
    const remove = jest.fn();
    let listener: ((event: { url: string }) => void) | null = null;
    mockedLinking.addEventListener.mockImplementation(
      (_type: string, handler: (event: { url: string }) => void) => {
        listener = handler;
        return { remove };
      },
    );

    const provider = new ExpoLinkingProvider({ clock: new FakeClock() });
    const received: string[] = [];
    const unsubscribe = provider.subscribe((url) => received.push(url));

    expect(mockedLinking.addEventListener).toHaveBeenCalledWith('url', expect.any(Function));
    if (listener !== null) {
      (listener as (event: { url: string }) => void)({ url: DEEP_LINK });
    }
    expect(received).toEqual([DEEP_LINK]);

    unsubscribe();
    unsubscribe(); // 冪等
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('購読失敗時は no-op の解除関数を返し onError に通知する（throw しない）', () => {
    mockedLinking.addEventListener.mockImplementation(() => {
      throw new Error('unsupported');
    });
    const warnings: ProviderError[] = [];
    const provider = new ExpoLinkingProvider({
      clock: new FakeClock(),
      onError: (error) => warnings.push(error),
    });

    let unsubscribe: (() => void) | null = null;
    expect(() => {
      unsubscribe = provider.subscribe(() => undefined);
    }).not.toThrow();
    expect(typeof unsubscribe).toBe('function');
    expect(warnings[0]?.code).toBe('runtime-error');
  });
});

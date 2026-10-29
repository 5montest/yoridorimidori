// expo-clipboard はインライン jest.mock（§12.4）。
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(),
}));

import * as Clipboard from 'expo-clipboard';
import { FakeClock } from '../clock/FakeClock';
import { ExpoClipboardProvider } from '../expo/ExpoClipboardProvider';
import type { ProviderError } from '../../ports/common';

interface MockedExpoClipboard {
  readonly getStringAsync: jest.Mock;
}

const mockedClipboard = Clipboard as unknown as MockedExpoClipboard;

beforeEach(() => {
  jest.clearAllMocks();
  mockedClipboard.getStringAsync.mockResolvedValue('');
});

describe('ExpoClipboardProvider', () => {
  it('生成だけではクリップボードを読まない（起動時自動読み取りの禁止）', () => {
    const provider = new ExpoClipboardProvider({ clock: new FakeClock() });
    expect(provider).toBeDefined();
    expect(mockedClipboard.getStringAsync).not.toHaveBeenCalled();
  });

  it('readText は trim 済みの文字列を返す', async () => {
    mockedClipboard.getStringAsync.mockResolvedValue('  東京タワー\n35.65,139.74  ');
    const provider = new ExpoClipboardProvider({ clock: new FakeClock() });
    await expect(provider.readText()).resolves.toBe('東京タワー\n35.65,139.74');
  });

  it('空文字・空白のみは null', async () => {
    const provider = new ExpoClipboardProvider({ clock: new FakeClock() });
    await expect(provider.readText()).resolves.toBeNull();
    mockedClipboard.getStringAsync.mockResolvedValue('   ');
    await expect(provider.readText()).resolves.toBeNull();
  });

  it('非文字列の戻り値は null', async () => {
    mockedClipboard.getStringAsync.mockResolvedValue(undefined);
    const provider = new ExpoClipboardProvider({ clock: new FakeClock() });
    await expect(provider.readText()).resolves.toBeNull();
  });

  it('失敗時は null を返し onError に runtime-error を通知する（throw しない）', async () => {
    mockedClipboard.getStringAsync.mockRejectedValue(new Error('denied'));
    const warnings: ProviderError[] = [];
    const provider = new ExpoClipboardProvider({
      clock: new FakeClock(),
      onError: (error) => warnings.push(error),
    });
    await expect(provider.readText()).resolves.toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('runtime-error');
  });
});

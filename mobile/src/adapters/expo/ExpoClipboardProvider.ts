import * as Clipboard from 'expo-clipboard';
import type { Clock } from '../../ports/clock';
import type { ProviderError, ProviderErrorCode } from '../../ports/common';
import type { ClipboardProvider } from '../../ports/clipboard';

export interface ExpoClipboardProviderOptions {
  readonly clock: Clock;
  /** 失敗の通知先（ログ・開発画面用）。ポートを汚さない実装詳細。 */
  readonly onError?: (error: ProviderError) => void;
}

/**
 * `expo-clipboard` による `ClipboardProvider`（Phase 4 / U03）。
 *
 * 使用する確定 API（research §2.1）: `Clipboard.getStringAsync(): Promise<string>`。
 *
 * 設計:
 *  - **throw しない**。空文字・失敗は `null`。
 *  - **起動時に自動で読まない**。UI の「コピーしたリンクから設定」バナーをユーザーが
 *    タップした時だけ `readText()` を呼ぶ（Android 10+ はフォーカス中のアプリのみ読める。
 *    research §2.2）。
 */
export class ExpoClipboardProvider implements ClipboardProvider {
  private readonly clock: Clock;
  private readonly onError: (error: ProviderError) => void;

  constructor(options: ExpoClipboardProviderOptions) {
    this.clock = options.clock;
    this.onError = options.onError ?? (() => undefined);
  }

  async readText(): Promise<string | null> {
    try {
      const text = await Clipboard.getStringAsync();
      if (typeof text !== 'string') {
        return null;
      }
      const trimmed = text.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch (error) {
      this.report('runtime-error', 'クリップボードを読み取れませんでした', error);
      return null;
    }
  }

  private report(code: ProviderErrorCode, message: string, detail?: unknown): void {
    this.onError({
      code,
      message,
      atMonotonicMs: this.clock.nowMonotonicMs(),
      ...(toDetail(detail) === undefined ? {} : { detail: toDetail(detail) }),
    });
  }
}

function toDetail(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : undefined;
}

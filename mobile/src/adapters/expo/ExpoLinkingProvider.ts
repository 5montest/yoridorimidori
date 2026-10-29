import * as Linking from 'expo-linking';
import type { Clock } from '../../ports/clock';
import type { ProviderError, ProviderErrorCode, Unsubscribe } from '../../ports/common';
import type { DeepLinkProvider } from '../../ports/deepLink';

export interface ExpoLinkingProviderOptions {
  readonly clock: Clock;
  /** 失敗の通知先（ログ・開発画面用）。ポートを汚さない実装詳細。 */
  readonly onError?: (error: ProviderError) => void;
}

/**
 * `expo-linking` による `DeepLinkProvider`（Phase 4 / U03）。
 *
 * 使用する確定 API（research §3.1）:
 *  - `Linking.getInitialURL(): Promise<string | null>`
 *  - `Linking.addEventListener('url', handler)`（戻り値は `remove()` 可能）
 *  - SDK 58 の `Linking.unwrapDevLaunchURL(url)`（launcher コマンド URL の展開）
 *
 * 設計:
 *  - **throw しない**。取得失敗は `null`、購読失敗は no-op の解除関数。
 *  - 返すのは**生の URL**。`/--/` の除去やクエリ解析は純粋関数
 *    `parseDeepLinkDestination()`（domain/shareLink.ts）が行う。
 *  - Expo Go は `exp://host:port/--/set?...`、カスタムスキーム `yoridorimidori://set?...`
 *    は development build のみ届く（research §3.2 / §3.3）。
 */
export class ExpoLinkingProvider implements DeepLinkProvider {
  private readonly clock: Clock;
  private readonly onError: (error: ProviderError) => void;

  constructor(options: ExpoLinkingProviderOptions) {
    this.clock = options.clock;
    this.onError = options.onError ?? (() => undefined);
  }

  async getInitialUrl(): Promise<string | null> {
    try {
      const raw = await Linking.getInitialURL();
      if (raw === null) {
        return null;
      }
      return unwrapDevLaunchUrl(raw);
    } catch (error) {
      this.report('runtime-error', '起動 URL を取得できませんでした', error);
      return null;
    }
  }

  subscribe(handler: (url: string) => void): Unsubscribe {
    try {
      const subscription = Linking.addEventListener('url', (event) => {
        handler(event.url);
      });
      let active = true;
      return () => {
        if (!active) {
          return; // 冪等
        }
        active = false;
        try {
          subscription.remove();
        } catch {
          // 解除失敗は無視
        }
      };
    } catch (error) {
      this.report('runtime-error', 'ディープリンクを購読できませんでした', error);
      return () => undefined;
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

/** SDK 58 の launcher コマンド URL を展開する（存在しない・失敗時は元の URL）。 */
function unwrapDevLaunchUrl(url: string): string {
  try {
    const unwrapped = Linking.unwrapDevLaunchURL(url);
    return typeof unwrapped === 'string' && unwrapped.length > 0 ? unwrapped : url;
  } catch {
    return url;
  }
}

function toDetail(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : undefined;
}

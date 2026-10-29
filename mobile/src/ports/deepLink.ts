import type { Unsubscribe } from './common';

/**
 * ディープリンク受信（Phase 4 / U02）。実装: `ExpoLinkingProvider`（expo-linking）。
 *
 * 契約:
 *  - Expo Go は `exp://<host>:<port>/--/set?lat=..&lon=..` 形式（research §3.2）。
 *    カスタムスキーム `yoridorimidori://set?...` は development build でのみ届く。
 *  - 生の URL を返す（`/--/` の除去やクエリ解析は呼び出し側の純粋関数が行う）。
 *  - `subscribe` の解除は冪等。**throw しない**（取得失敗は `null`）。
 */
export interface DeepLinkProvider {
  /** アプリを起動した URL。無ければ `null`。 */
  getInitialUrl(): Promise<string | null>;

  /** 起動中に届く URL を購読する。 */
  subscribe(handler: (url: string) => void): Unsubscribe;
}

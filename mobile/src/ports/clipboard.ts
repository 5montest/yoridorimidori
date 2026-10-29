/**
 * クリップボード読み取り（Phase 4 / U02）。実装: `ExpoClipboardProvider`（expo-clipboard）。
 *
 * 契約:
 *  - **throw しない**。空文字・権限なし・失敗は `null` を返す。
 *  - **起動時に自動で読まない**。UI の「コピーしたリンクから設定」バナーをユーザーが
 *    タップした時だけ読む（Android 10+ はフォーカス中のアプリのみ読める。
 *    research §2.2）。
 */
export interface ClipboardProvider {
  /** クリップボードのテキスト。空・失敗は `null`。 */
  readText(): Promise<string | null>;
}

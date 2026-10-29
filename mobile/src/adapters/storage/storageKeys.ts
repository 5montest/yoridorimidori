/**
 * AsyncStorage のキー定義（§10.1）。
 *
 * - キーに `v1` を含める（スキーマ変更時は `v2` へ移行し、`v1` は読み取りのみ）。
 * - すべて 1 キー = 1 JSON。目的地と選択 id は同一キー内に入れて整合を保証する。
 * - `mockMode` / シナリオ / 取得プロファイルは永続化しない（§10.1）。
 */

/** 目的地（FR-01）: `{ schemaVersion: 1, items: Destination[], selectedId: string | null }`。 */
export const DESTINATIONS_STORAGE_KEY = 'yoridorimidori/destinations/v1';

/** サンプルログ（FR-09）: `{ schemaVersion: 1, items: SampleLogEntry[] }`（リング 300 件）。 */
export const SAMPLES_STORAGE_KEY = 'yoridorimidori/samples/v1';

/** 破損データの退避キーのプレフィックス（§10.2）。 */
export const QUARANTINE_KEY_PREFIX = 'yoridorimidori/quarantine/';

/** 破損した生文字列を退避するキーを作る（`<prefix><storageKey>/<epochMs>`）。 */
export function quarantineKeyFor(storageKey: string, epochMs: number): string {
  return `${QUARANTINE_KEY_PREFIX}${storageKey}/${epochMs}`;
}

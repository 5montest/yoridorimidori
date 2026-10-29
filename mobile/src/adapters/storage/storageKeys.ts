/**
 * AsyncStorage のキー定義（§10.1）。
 *
 * - キーにスキーマバージョンを含める。**目的地は Phase 4（UX 刷新）で v2 に移行**し、
 *   v1 キーは**読み取りのみ**（移行用。書き込みは v2 のみ）。
 * - すべて 1 キー = 1 JSON。目的地と選択 id は同一キー内に入れて整合を保証する。
 * - `mockMode` / シナリオ / 取得プロファイルは永続化しない（§10.1）。
 */

/**
 * 目的地（FR-01）: `{ schemaVersion: 2, items: Destination[], selectedId: string | null }`。
 * v2 で `Destination.favorite` / `Destination.lastUsedAtEpochMs` を追加した。
 */
export const DESTINATIONS_STORAGE_KEY = 'yoridorimidori/destinations/v2';

/** 目的地ストア v1（移行用・**読み取りのみ**。favorite / lastUsedAtEpochMs を持たない）。 */
export const DESTINATIONS_STORAGE_KEY_V1 = 'yoridorimidori/destinations/v1';

/** サンプルログ（FR-09）: `{ schemaVersion: 1, items: SampleLogEntry[] }`（リング 300 件）。 */
export const SAMPLES_STORAGE_KEY = 'yoridorimidori/samples/v1';

/** 破損データの退避キーのプレフィックス（§10.2）。 */
export const QUARANTINE_KEY_PREFIX = 'yoridorimidori/quarantine/';

/** 破損した生文字列を退避するキーを作る（`<prefix><storageKey>/<epochMs>`）。 */
export function quarantineKeyFor(storageKey: string, epochMs: number): string {
  return `${QUARANTINE_KEY_PREFIX}${storageKey}/${epochMs}`;
}

/**
 * 端末内の小さな設定値の永続化（Phase 4 / U02）。
 * 実装: AsyncStorage ベース（U03 の配線で App が生成）またはメモリ実装。
 *
 * 現時点の対象は「オンボーディング表示済みフラグ」のみ（UX 設計 §F1 / S1）。
 * `mockMode` / シナリオ / 取得プロファイルは**永続化しない**（architecture §10.1）。
 */
export interface PreferencesRepository {
  /** オンボーディングを表示済みか。 */
  getOnboardingSeen(): Promise<boolean>;

  /** オンボーディング表示済みフラグを保存する。 */
  setOnboardingSeen(seen: boolean): Promise<void>;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PreferencesRepository } from '../../ports/preferences';
import { PREFERENCES_KEY } from './storageKeys';
import { decodePreferences, encodePreferences } from './codec';

/** 保存系の警告通知（実装詳細。UI 文言化は hooks / labels の責務）。 */
export type PreferencesWarningHandler = (message: string) => void;

/**
 * AsyncStorage 上の `PreferencesRepository`（Phase 4 / U02 ポート、U10 の配線用）。
 *
 * - 対象はオンボーディング表示済みフラグのみ（UX 設計 §F1 / S1）。
 * - **throw しない**: 読み取りの破損・型不正は「未見（false）」にフォールバックし、
 *   保存失敗は `onWarning` に通知して継続する（オンボーディングが毎回出るだけで致命的ではない）。
 * - 保存形式は codec の流儀に合わせて `{ schemaVersion: 1, onboardingSeen: boolean }`。
 * - `mockMode` / シナリオ / 取得プロファイルは永続化しない（architecture §10.1）。
 */
export class AsyncStoragePreferencesRepository implements PreferencesRepository {
  constructor(private readonly onWarning: PreferencesWarningHandler = () => undefined) {}

  async getOnboardingSeen(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
      return decodePreferences(raw);
    } catch {
      // 読み取り失敗も「未見」として扱う（throw しない）
      this.onWarning('設定の読み込みに失敗しました');
      return false;
    }
  }

  async setOnboardingSeen(seen: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(PREFERENCES_KEY, encodePreferences(seen === true));
    } catch {
      // 保存失敗は警告のみ（次回起動時に再表示されるだけ。アプリは継続）
      this.onWarning('設定の保存に失敗しました');
    }
  }
}

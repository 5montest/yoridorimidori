import type { SampleLogEntry } from '../domain/types';

/**
 * 精度・鮮度サンプルの記録（FR-09）。実装: AsyncStorageSampleLogRepository / InMemory。
 *
 * 契約:
 *  - リングバッファ（既定 300 件。上限は Thresholds.sampleLogCapacity と一致させる）。
 *  - 上限超過時は「最も古い」ものから捨てる（追加順 = 時系列順）。
 *  - append は非同期。内部で書込をバッチ/デバウンスしてよい（§10.5）。
 *    書込失敗は append の reject で通知する（呼び出し側が警告表示、アプリは継続）。
 *  - list() は古い順 → 新しい順で返す（表示側で reverse する）。
 */
export interface SampleLogRepository {
  /** 起動時に 1 回呼ぶ。保存済みサンプルを返す。壊れた要素は読み飛ばす。 */
  load(): Promise<readonly SampleLogEntry[]>;

  /** 1 件追記（リングバッファ）。 */
  append(entry: SampleLogEntry): Promise<void>;

  /** 保留中の書込を確定させる（アンマウント時・開発画面表示時）。 */
  flush(): Promise<void>;

  /** 現在の内容（古い順）。 */
  list(): Promise<readonly SampleLogEntry[]>;

  /** 全消去。 */
  clear(): Promise<void>;
}

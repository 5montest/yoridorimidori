import type {
  Destination,
  DestinationInput,
  DestinationPatch,
} from '../domain/types';

/**
 * 目的地の永続化（FR-01）。実装: AsyncStorageDestinationRepository / InMemory。
 *
 * 契約:
 *  - 入力は呼び出し側で validateDestinationInput() 済みであることを前提とする。
 *    アダプタも防御的に再検証し、不正なら保存せず例外ではなく null / エラー扱いを返す。
 *  - 保存に失敗した場合は例外を投げてよい（呼び出し側 hooks が捕捉して警告表示）。
 *  - 選択状態（現在の目的地）もここで永続化する（再起動後の復元: FR-01）。
 *  - 同一 id の追加は上書きしない（新規生成のみ）。
 */
export interface DestinationRepository {
  /** 保存済み目的地を古い順（作成順）で返す。壊れた要素は読み飛ばす。 */
  list(): Promise<readonly Destination[]>;

  /** 新規追加し、確定した Destination（id・作成時刻入り）を返す。 */
  add(input: DestinationInput): Promise<Destination>;

  /** 部分更新。存在しない id なら null。 */
  update(id: string, patch: DestinationPatch): Promise<Destination | null>;

  /** 削除。選択中の目的地が消えた場合は選択も解除する。 */
  remove(id: string): Promise<void>;

  /** 選択中 id。null = 未選択。 */
  readSelection(): Promise<string | null>;

  /** 選択中 id を保存。null で解除。存在しない id は保存しない（null 扱い）。 */
  writeSelection(id: string | null): Promise<void>;

  /**
   * 目的地として使ったことを記録する（`lastUsedAtEpochMs` を更新）。
   * 存在しない id は無視する（throw しない）。時刻は実装が注入 `Clock` から決める。
   */
  markUsed(id: string): Promise<void>;

  /** お気に入り（☆）の設定。存在しない id は無視する。 */
  setFavorite(id: string, favorite: boolean): Promise<void>;

  /** 全消去（開発用リセット・テスト用）。 */
  clear(): Promise<void>;
}

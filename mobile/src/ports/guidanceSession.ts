/** バックグラウンド案内に渡す情報。 */
export interface GuidanceSessionInfo {
  /** 目的地名（未選択なら `null`）。 */
  readonly destinationName: string | null;
  /** 目的地までの距離（m）。不明なら `null`。 */
  readonly distanceM: number | null;
}

/**
 * バックグラウンド案内（通知・スリープ防止・バックグラウンド位置更新）のポート。
 *
 * - 案内中だけ動く。実装は Expo アダプタ（`adapters/expo/ExpoGuidanceSession.ts`）。
 * - **throw しない**（通知やバックグラウンド権限が無くても前景の案内は継続できるようにする）。
 */
export interface GuidanceSessionPort {
  /** 案内を開始する（通知・スリープ防止・バックグラウンド更新）。 */
  start(info: GuidanceSessionInfo): Promise<void>;
  /** 通知の内容を更新する（実装側でスロットルする）。 */
  update(info: GuidanceSessionInfo): void;
  /** 案内を終了する（通知を消し、バックグラウンド更新とスリープ防止を止める）。 */
  stop(): Promise<void>;
}

import type { PlaceCandidate } from '../domain/placeCandidate';
import type { GeoPoint } from '../domain/types';

export type { PlaceCandidate, PlaceCandidateSource } from '../domain/placeCandidate';

/**
 * 場所検索（フォワードジオコーディング）と逆ジオコーディングの供給元（Phase 4 / U02）。
 * 実装: `ExpoPlaceSearchProvider`（expo-location の geocodeAsync / reverseGeocodeAsync）。
 *
 * 契約:
 *  - **throw しない**。失敗時（権限なし・ネットワークなし・レート制限）は
 *    `search` は `[]`、`reverse` は `null` を返す（UI は「地図から選ぶ」へ誘導する）。
 *  - `search` は 0 件なら `[]`。**Android 実装は最大 1 件**（research §1.2）を前提に、
 *    複数件前提の UI にしないこと。
 *  - 位置情報権限が無い・API 非対応（Web 等）なら `isAvailable()` は false。
 */
export interface PlaceSearchProvider {
  /** この環境で場所検索が使える見込みがあるか（geocode は Android/iOS のみ）。 */
  isAvailable(): Promise<boolean>;

  /** 場所名・住所文字列から候補を返す。0 件・失敗は `[]`。 */
  search(query: string): Promise<readonly PlaceCandidate[]>;

  /** 座標から場所名（逆ジオコーディング）。見つからなければ `null`。 */
  reverse(point: GeoPoint): Promise<PlaceCandidate | null>;
}

/**
 * 目的地リストの並び順・フィルタ（U01）。
 * 純粋関数のみで、`Destination` の一部フィールドだけを要求する構造的部分型を使う
 * （型拡張（U02）前でもテストできる）。
 */

/** 最近順ソート・お気に入りフィルタに必要な最小フィールド。 */
export interface RecentSortable {
  /** 最後に目的地として使った時刻（epoch ms）。未使用は null。 */
  readonly lastUsedAtEpochMs: number | null;
  readonly favorite: boolean;
}

/** 最近使った場所の既定表示件数（UX 設計 §7）。 */
export const RECENT_DESTINATIONS_LIMIT = 5;

/**
 * 最近使った順（`lastUsedAtEpochMs` の降順）に並べた**新しい配列**を返す。
 *
 * - `null`（未使用）は末尾に置く。
 * - 同値の場合は元の順序を保つ（Array.prototype.sort は安定）。
 * - 元配列は変更しない。
 */
export function sortRecent<T extends RecentSortable>(destinations: readonly T[]): readonly T[] {
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return [];
  }
  return [...destinations].sort((a, b) => {
    const aTime = a.lastUsedAtEpochMs;
    const bTime = b.lastUsedAtEpochMs;
    if (aTime === null && bTime === null) {
      return 0;
    }
    if (aTime === null) {
      return 1;
    }
    if (bTime === null) {
      return -1;
    }
    return bTime - aTime;
  });
}

/** お気に入りだけを元の順序で返す（新しい配列）。 */
export function filterFavorites<T extends RecentSortable>(
  destinations: readonly T[],
): readonly T[] {
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return [];
  }
  return destinations.filter((destination) => destination.favorite);
}

/**
 * 最近使った場所の上位 `limit` 件（既定 5）。`lastUsedAtEpochMs === null` は含めない
 * （「最近使った場所」に未使用の目的地を出さない）。
 */
export function recentDestinations<T extends RecentSortable>(
  destinations: readonly T[],
  limit: number = RECENT_DESTINATIONS_LIMIT,
): readonly T[] {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  if (max === 0) {
    return [];
  }
  const used = destinations.filter(
    (destination) => destination.lastUsedAtEpochMs !== null,
  );
  return sortRecent(used).slice(0, max);
}

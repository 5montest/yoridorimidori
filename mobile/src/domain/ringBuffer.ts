/**
 * リングバッファ操作（FR-09 / §6.12）。元配列は変更せず、常に新しい配列を返す。
 * `noUncheckedIndexedAccess` のため、要素アクセスは `slice` / スプレッドのみで行う。
 */

/**
 * 末尾に追加し、容量を超えたら先頭（最古）から捨てる。
 *
 * @param buffer 既存のバッファ（変更しない）
 * @param item 追加する要素
 * @param capacity 上限件数。`< 1` は `[]`、非整数は `Math.floor`、非有限は `[]`（防御）
 */
export function ringPush<T>(buffer: readonly T[], item: T, capacity: number): readonly T[] {
  const cap = normalizeCapacity(capacity);
  if (cap < 1) {
    return [];
  }
  const appended = [...buffer, item];
  if (appended.length <= cap) {
    return appended;
  }
  return appended.slice(appended.length - cap);
}

/**
 * 容量に収まるよう古いものから捨てる（新しい方を残す）。
 *
 * @param capacity 上限件数。`< 1` は `[]`、非整数は `Math.floor`、非有限は `[]`（防御）
 */
export function ringTrim<T>(buffer: readonly T[], capacity: number): readonly T[] {
  const cap = normalizeCapacity(capacity);
  if (cap < 1) {
    return [];
  }
  if (buffer.length <= cap) {
    return [...buffer];
  }
  return buffer.slice(buffer.length - cap);
}

/** 容量を「0 以上の整数」に正規化する。非有限・負値は 0（＝保持しない）。 */
function normalizeCapacity(capacity: number): number {
  if (!Number.isFinite(capacity)) {
    return 0;
  }
  return Math.floor(capacity);
}

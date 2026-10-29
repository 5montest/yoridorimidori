import type { Thresholds } from '../domain/constants';
import { computeNavState, type NavStateInput } from '../domain/nav';
import type { Destination, NavState } from '../domain/types';
import type { ProviderError } from '../ports/common';
import type { NavAppState } from './navState';

/**
 * 選択中の目的地を返す。§7.3。
 *
 * - 未選択（`null`）は `null`。
 * - `selectedDestinationId` が一覧に存在しない（削除直後など）場合も `null`。
 */
export function selectSelectedDestination(state: NavAppState): Destination | null {
  const id = state.selectedDestinationId;
  if (id === null) {
    return null;
  }
  return state.destinations.find((destination) => destination.id === id) ?? null;
}

/**
 * 表示用の `NavState` を合成する。§7.3。
 *
 * **`computeNavState()` にそのまま委譲する**（表示用の計算を二重実装しない）。
 * `thresholds` 省略時は起動時に注入された `state.thresholds` を使う。
 */
export function selectNavState(
  state: NavAppState,
  thresholds: Thresholds = state.thresholds,
): NavState {
  const input: NavStateInput = {
    destination: selectSelectedDestination(state),
    location: state.location,
    heading: state.heading,
    nowMonotonicMs: state.nowMonotonicMs,
    headingUnavailable: state.headingUnavailable,
  };
  return computeNavState(input, thresholds);
}

/** 直近のエラー（新しい順の先頭）。無ければ `null`。§7.3。 */
export function selectLatestError(state: NavAppState): ProviderError | null {
  return state.errors[0] ?? null;
}

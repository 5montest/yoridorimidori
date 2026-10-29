import type { PlaceCandidate } from '../domain/placeCandidate';
import { FALLBACK_DESTINATION_NAME } from '../domain/placeCandidate';
import { parseDeepLinkDestination, parseSharedLocation, type SharedLocation } from '../domain/shareLink';
import type { Destination, DestinationInput, GeoPoint } from '../domain/types';

/**
 * 目的地選択画面（S3〜S5）の状態と純粋ロジック（Phase 4 / U05）。
 *
 * React に依存しない reducer / セレクタ / 変換ヘルパのみを置く（テスト対象）。
 * 具体実装（adapters）は import しない（ポート型だけを受け取る）。
 */

/** 検索の 300ms debounce（UX 設計 / U05）。 */
export const SEARCH_DEBOUNCE_MS = 300;

/** 検索の進行状態。`pending` は debounce 待ち。 */
export type SearchStatus = 'idle' | 'pending' | 'loading' | 'success' | 'empty' | 'error';

/** 地図で選んだ地点の確定状態。 */
export type MapPickStatus = 'idle' | 'resolving' | 'ready';

/** クリップボード確認の状態。 */
export type ClipboardCheckStatus = 'idle' | 'checking' | 'none';

/** 共有リンク・ディープリンクから届いた目的地（確認シート待ち）。 */
export interface PendingShared {
  readonly source: 'clipboard' | 'deep-link';
  readonly location: SharedLocation;
}

export interface DestinationPickerState {
  readonly query: string;
  readonly searchStatus: SearchStatus;
  /** 入力変更のたびに増える世代番号。古い応答の破棄に使う（二重送信防止・順序保証）。 */
  readonly searchGeneration: number;
  readonly results: readonly PlaceCandidate[];
  readonly recent: readonly Destination[];
  readonly favorites: readonly Destination[];
  readonly clipboardStatus: ClipboardCheckStatus;
  readonly pendingShared: PendingShared | null;
  readonly mapPoint: GeoPoint | null;
  readonly mapStatus: MapPickStatus;
  /** 地図地点の逆ジオコーディング結果（失敗時は null）。 */
  readonly mapCandidate: PlaceCandidate | null;
  /** 地図選択の世代番号（古い逆ジオコーディング応答の破棄）。 */
  readonly mapGeneration: number;
}

export type DestinationPickerAction =
  | { readonly type: 'query/changed'; readonly query: string }
  | { readonly type: 'search/retried' }
  | { readonly type: 'search/started'; readonly generation: number }
  | { readonly type: 'search/succeeded'; readonly generation: number; readonly results: readonly PlaceCandidate[] }
  | { readonly type: 'search/failed'; readonly generation: number }
  | { readonly type: 'search/cleared' }
  | { readonly type: 'clipboard/check-started' }
  | { readonly type: 'clipboard/checked'; readonly shared: SharedLocation | null }
  | { readonly type: 'shared/received'; readonly pending: PendingShared }
  | { readonly type: 'shared/dismissed' }
  | { readonly type: 'map/point-selected'; readonly point: GeoPoint }
  | { readonly type: 'map/resolved'; readonly generation: number; readonly candidate: PlaceCandidate | null }
  | { readonly type: 'map/cleared' }
  | { readonly type: 'recent/synced'; readonly recent: readonly Destination[]; readonly favorites: readonly Destination[] };

/** 初期状態を作る（最近・お気に入りは呼び出し側の現在値を渡す）。 */
export function createDestinationPickerState(
  input: { readonly recent?: readonly Destination[]; readonly favorites?: readonly Destination[] } = {},
): DestinationPickerState {
  return {
    query: '',
    searchStatus: 'idle',
    searchGeneration: 0,
    results: [],
    recent: input.recent ?? [],
    favorites: input.favorites ?? [],
    clipboardStatus: 'idle',
    pendingShared: null,
    mapPoint: null,
    mapStatus: 'idle',
    mapCandidate: null,
    mapGeneration: 0,
  };
}

/** 目的地選択画面の純粋 reducer。 */
export function destinationPickerReducer(
  state: DestinationPickerState,
  action: DestinationPickerAction,
): DestinationPickerState {
  switch (action.type) {
    case 'query/changed': {
      if (state.query === action.query) {
        return state; // 同一入力では世代を進めない（多重検索の抑制）
      }
      const query = action.query;
      const hasQuery = query.trim().length > 0;
      return {
        ...state,
        query,
        searchStatus: hasQuery ? 'pending' : 'idle',
        searchGeneration: state.searchGeneration + 1, // 実行中の検索を無効化
        results: [],
      };
    }
    case 'search/retried': {
      if (state.query.trim().length === 0) {
        return state;
      }
      return {
        ...state,
        searchStatus: 'pending',
        searchGeneration: state.searchGeneration + 1,
        results: [],
      };
    }
    case 'search/started': {
      if (action.generation !== state.searchGeneration || state.searchStatus !== 'pending') {
        return state; // 古い世代・二重送信は無視
      }
      return { ...state, searchStatus: 'loading' };
    }
    case 'search/succeeded': {
      if (action.generation !== state.searchGeneration) {
        return state; // 古い応答は捨てる（入力が変わった後）
      }
      return {
        ...state,
        results: action.results,
        searchStatus: action.results.length === 0 ? 'empty' : 'success',
      };
    }
    case 'search/failed': {
      if (action.generation !== state.searchGeneration) {
        return state;
      }
      return { ...state, searchStatus: 'error', results: [] };
    }
    case 'search/cleared':
      return {
        ...state,
        query: '',
        searchStatus: 'idle',
        searchGeneration: state.searchGeneration + 1,
        results: [],
      };
    case 'clipboard/check-started': {
      if (state.clipboardStatus === 'checking') {
        return state; // 二重読み取り防止
      }
      return { ...state, clipboardStatus: 'checking' };
    }
    case 'clipboard/checked': {
      if (action.shared === null) {
        return { ...state, clipboardStatus: 'none' };
      }
      return {
        ...state,
        clipboardStatus: 'idle',
        pendingShared: { source: 'clipboard', location: action.shared },
      };
    }
    case 'shared/received':
      return { ...state, pendingShared: action.pending, clipboardStatus: 'idle' };
    case 'shared/dismissed':
      return { ...state, pendingShared: null, clipboardStatus: 'idle' };
    case 'map/point-selected':
      return {
        ...state,
        mapPoint: action.point,
        mapStatus: 'resolving',
        mapCandidate: null,
        mapGeneration: state.mapGeneration + 1,
      };
    case 'map/resolved': {
      if (action.generation !== state.mapGeneration || state.mapStatus !== 'resolving') {
        return state; // 古い地点の応答は捨てる
      }
      return { ...state, mapStatus: 'ready', mapCandidate: action.candidate };
    }
    case 'map/cleared':
      return { ...state, mapPoint: null, mapStatus: 'idle', mapCandidate: null };
    case 'recent/synced':
      return { ...state, recent: action.recent, favorites: action.favorites };
    default:
      return state;
  }
}

// ── セレクタ（純粋） ───────────────────────────────────────────────────────

/** debounce 待ちで、検索を開始してよいか。 */
export function shouldStartSearch(state: DestinationPickerState): boolean {
  return state.searchStatus === 'pending' && state.query.trim().length > 0;
}

/** 検索中（debounce 待ち or 実行中）か。UI の二重送信防止・インジケータ用。 */
export function isSearchBusy(state: DestinationPickerState): boolean {
  return state.searchStatus === 'pending' || state.searchStatus === 'loading';
}

/** 検索結果メッセージの種類（0 件・失敗の表示用）。 */
export function searchResultKind(state: DestinationPickerState): 'empty' | 'error' | null {
  if (state.searchStatus === 'empty') {
    return 'empty';
  }
  if (state.searchStatus === 'error') {
    return 'error';
  }
  return null;
}

/**
 * 共有リンクのバナー種類。
 * - `ready`: 座標が取れた → 確認シートを出せる
 * - `needs-resolution`: 短縮リンク等で座標なし → 「座標を含む形式でコピーし直してください」
 */
export function sharedBannerKind(
  state: DestinationPickerState,
): 'ready' | 'needs-resolution' | null {
  const pending = state.pendingShared;
  if (pending === null) {
    return null;
  }
  return pending.location.point === null ? 'needs-resolution' : 'ready';
}

/** 地図の地点を目的地として確定できるか。 */
export function canConfirmMapPoint(state: DestinationPickerState): boolean {
  return state.mapStatus === 'ready' && state.mapPoint !== null;
}

/** 検索結果の候補数。 */
export function resultCount(state: DestinationPickerState): number {
  return state.results.length;
}

// ── 純粋な変換ヘルパ（ポート・UI から独立） ───────────────────────────────

/** クリップボード等のテキストから確認待ちの共有情報を作る。解析できなければ null。 */
export function pendingSharedFromText(text: string | null): PendingShared | null {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }
  const location = parseSharedLocation(text);
  return location === null ? null : { source: 'clipboard', location };
}

/** ディープリンク URL から確認待ちの目的地を作る。解析できなければ null。 */
export function pendingSharedFromDeepLink(url: string | null): PendingShared | null {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return null;
  }
  const destination = parseDeepLinkDestination(url);
  if (destination === null) {
    return null;
  }
  return {
    source: 'deep-link',
    location: {
      point: destination.point,
      name: destination.name,
      kind: 'coordinates',
      needsResolution: false,
    },
  };
}

/** 検索候補 → 保存入力。 */
export function toDestinationInputFromCandidate(candidate: PlaceCandidate): DestinationInput {
  return { name: candidate.name, point: candidate.point, origin: 'manual' };
}

/** 地点 + 名前 → 保存入力（名前が無ければ fallbackName）。 */
export function toDestinationInputFromPoint(
  point: GeoPoint,
  name: string | null,
  fallbackName: string,
  origin: DestinationInput['origin'] = 'manual',
): DestinationInput {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return {
    name: trimmed.length > 0 ? trimmed : fallbackName,
    point: { latitude: point.latitude, longitude: point.longitude },
    origin,
  };
}

/**
 * 共有リンク → 保存入力。座標が無い（短縮リンク等）なら `null`（確定できない）。
 * 名前が無い場合は `fallbackName`（逆ジオコーディングの既定と同じ扱い）。
 */
export function toDestinationInputFromShared(
  location: SharedLocation,
  fallbackName: string = FALLBACK_DESTINATION_NAME,
): DestinationInput | null {
  if (location.point === null) {
    return null;
  }
  return toDestinationInputFromPoint(location.point, location.name, fallbackName);
}

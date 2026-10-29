import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { PlaceCandidate } from '../domain/placeCandidate';
import type { Destination, DestinationInput, GeoPoint } from '../domain/types';
import type { ClipboardProvider } from '../ports/clipboard';
import type { DeepLinkProvider } from '../ports/deepLink';
import type { PlaceSearchProvider } from '../ports/placeSearch';
import {
  SEARCH_DEBOUNCE_MS,
  canConfirmMapPoint,
  createDestinationPickerState,
  destinationPickerReducer,
  isSearchBusy,
  pendingSharedFromDeepLink,
  pendingSharedFromText,
  searchResultKind,
  sharedBannerKind,
  toDestinationInputFromCandidate,
  toDestinationInputFromPoint,
  toDestinationInputFromShared,
  type DestinationPickerState,
} from './destinationPickerReducer';

export interface UseDestinationPickerOptions {
  /** 場所検索（geocode / 逆ジオコーディング）。 */
  readonly placeSearch: PlaceSearchProvider;
  /** クリップボード読み取り（**ユーザー操作時のみ**呼ぶ）。 */
  readonly clipboard: ClipboardProvider;
  /** ディープリンク受信。 */
  readonly deepLink: DeepLinkProvider;
  /** 最近使った場所（App の状態から渡す。並べ替えは domain/destinationOrder）。 */
  readonly recent: readonly Destination[];
  /** お気に入り（App の状態から渡す）。 */
  readonly favorites: readonly Destination[];
  /** 現在地（取得できていなければ null）。 */
  readonly currentPoint: GeoPoint | null;
  /** 名前が取れないときのフォールバック（文言は UI が決める。例「選択した地点」「現在地」）。 */
  readonly fallbackName: string;
  /** 目的地を確定する（保存・選択は呼び出し側 = App / useNavApp の責務）。 */
  readonly onConfirm: (input: DestinationInput) => void;
  /** お気に入りの切り替え（永続化は呼び出し側の責務）。 */
  readonly onToggleFavorite: (id: string) => void;
}

export interface DestinationPickerActions {
  readonly setQuery: (query: string) => void;
  readonly clearQuery: () => void;
  readonly retrySearch: () => void;
  /** クリップボードを読む（バナーがタップされた時だけ呼ぶ）。 */
  readonly checkClipboard: () => Promise<void>;
  readonly dismissShared: () => void;
  readonly confirmShared: () => void;
  readonly selectSearchResult: (candidate: PlaceCandidate) => void;
  readonly selectMapPoint: (point: GeoPoint) => void;
  readonly confirmMapPoint: () => void;
  readonly clearMapPoint: () => void;
  readonly confirmCurrentLocation: () => void;
  readonly toggleFavorite: (id: string) => void;
}

export interface DestinationPickerDerived {
  readonly isSearchBusy: boolean;
  readonly searchResultKind: 'empty' | 'error' | null;
  readonly sharedBannerKind: 'ready' | 'needs-resolution' | null;
  readonly canConfirmMapPoint: boolean;
}

export interface UseDestinationPickerResult {
  readonly state: DestinationPickerState;
  readonly actions: DestinationPickerActions;
  readonly derived: DestinationPickerDerived;
}

/**
 * 目的地選択（S3〜S5）のオーケストレーション（Phase 4 / U05）。
 *
 * - 検索は **300ms debounce**。`searchGeneration` で古い応答・多重送信を破棄する。
 * - クリップボードは**ユーザー操作時のみ**読む（Android 10+ のフォーカス制限。research §2.2）。
 * - ディープリンクは起動時 URL + 購読の両方を受け、`parseDeepLinkDestination` で解析する。
 * - 地図地点は選択時に逆ジオコーディングし、世代番号で古い応答を捨てる。
 * - **`adapters/` を import しない**。具体実装は App がディペンデンシーとして注入する。
 */
export function useDestinationPicker(
  options: UseDestinationPickerOptions,
): UseDestinationPickerResult {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, dispatch] = useReducer(
    destinationPickerReducer,
    createDestinationPickerState({ recent: options.recent, favorites: options.favorites }),
  );

  const mountedRef = useRef(true);
  const mapGenerationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 検索（300ms debounce）。入力変更・世代変更でタイマーを張り直す。
  const { query, searchStatus, searchGeneration } = state;
  useEffect(() => {
    if (searchStatus !== 'pending' || query.trim().length === 0) {
      return undefined;
    }
    const generation = searchGeneration;
    const timer = setTimeout(() => {
      dispatch({ type: 'search/started', generation });
      void (async () => {
        let results: readonly PlaceCandidate[] = [];
        try {
          results = await optionsRef.current.placeSearch.search(query);
        } catch {
          if (mountedRef.current) {
            dispatch({ type: 'search/failed', generation });
          }
          return;
        }
        if (mountedRef.current) {
          dispatch({ type: 'search/succeeded', generation, results });
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, searchStatus, searchGeneration]);

  // 最近・お気に入りの同期（App の状態が変わったら反映）。
  useEffect(() => {
    dispatch({ type: 'recent/synced', recent: options.recent, favorites: options.favorites });
  }, [options.recent, options.favorites]);

  // ディープリンク（起動時 URL + 起動中の購読）。
  useEffect(() => {
    const { deepLink } = optionsRef.current;
    let active = true;
    void deepLink
      .getInitialUrl()
      .then((url) => {
        if (!active) {
          return;
        }
        const pending = pendingSharedFromDeepLink(url);
        if (pending !== null) {
          dispatch({ type: 'shared/received', pending });
        }
      })
      .catch(() => undefined);
    const unsubscribe = deepLink.subscribe((url) => {
      const pending = pendingSharedFromDeepLink(url);
      if (pending !== null) {
        dispatch({ type: 'shared/received', pending });
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [options.deepLink]);

  const setQuery = useCallback((nextQuery: string) => {
    dispatch({ type: 'query/changed', query: nextQuery });
  }, []);

  const clearQuery = useCallback(() => {
    dispatch({ type: 'search/cleared' });
  }, []);

  const retrySearch = useCallback(() => {
    dispatch({ type: 'search/retried' });
  }, []);

  const checkClipboard = useCallback(async () => {
    dispatch({ type: 'clipboard/check-started' });
    let text: string | null = null;
    try {
      text = await optionsRef.current.clipboard.readText();
    } catch {
      text = null;
    }
    if (!mountedRef.current) {
      return;
    }
    const pending = pendingSharedFromText(text);
    dispatch({ type: 'clipboard/checked', shared: pending === null ? null : pending.location });
  }, []);

  const dismissShared = useCallback(() => {
    dispatch({ type: 'shared/dismissed' });
  }, []);

  const selectSearchResult = useCallback((candidate: PlaceCandidate) => {
    optionsRef.current.onConfirm(toDestinationInputFromCandidate(candidate));
  }, []);

  const pendingShared = state.pendingShared;
  const confirmShared = useCallback(() => {
    if (pendingShared === null) {
      return;
    }
    const input = toDestinationInputFromShared(
      pendingShared.location,
      optionsRef.current.fallbackName,
    );
    if (input === null) {
      return; // 座標なし（短縮リンク）は確定できない
    }
    optionsRef.current.onConfirm(input);
    dispatch({ type: 'shared/dismissed' });
  }, [pendingShared]);

  const selectMapPoint = useCallback((point: GeoPoint) => {
    mapGenerationRef.current += 1;
    const generation = mapGenerationRef.current;
    dispatch({ type: 'map/point-selected', point });
    void (async () => {
      let candidate: PlaceCandidate | null = null;
      try {
        candidate = await optionsRef.current.placeSearch.reverse(point);
      } catch {
        candidate = null;
      }
      if (mountedRef.current) {
        dispatch({ type: 'map/resolved', generation, candidate });
      }
    })();
  }, []);

  const mapPoint = state.mapPoint;
  const mapCandidate = state.mapCandidate;
  const confirmMapPoint = useCallback(() => {
    if (mapPoint === null) {
      return;
    }
    const input = toDestinationInputFromPoint(
      mapPoint,
      mapCandidate === null ? null : mapCandidate.name,
      optionsRef.current.fallbackName,
    );
    optionsRef.current.onConfirm(input);
    dispatch({ type: 'map/cleared' });
  }, [mapPoint, mapCandidate]);

  const clearMapPoint = useCallback(() => {
    dispatch({ type: 'map/cleared' });
  }, []);

  const confirmCurrentLocation = useCallback(() => {
    const point = optionsRef.current.currentPoint;
    if (point === null) {
      return;
    }
    optionsRef.current.onConfirm(
      toDestinationInputFromPoint(
        point,
        null,
        optionsRef.current.fallbackName,
        'current-location',
      ),
    );
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    optionsRef.current.onToggleFavorite(id);
  }, []);

  return {
    state,
    actions: {
      setQuery,
      clearQuery,
      retrySearch,
      checkClipboard,
      dismissShared,
      confirmShared,
      selectSearchResult,
      selectMapPoint,
      confirmMapPoint,
      clearMapPoint,
      confirmCurrentLocation,
      toggleFavorite,
    },
    derived: {
      isSearchBusy: isSearchBusy(state),
      searchResultKind: searchResultKind(state),
      sharedBannerKind: sharedBannerKind(state),
      canConfirmMapPoint: canConfirmMapPoint(state),
    },
  };
}

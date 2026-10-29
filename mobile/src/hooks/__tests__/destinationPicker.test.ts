import type { PlaceCandidate } from '../../domain/placeCandidate';
import type { Destination, GeoPoint } from '../../domain/types';
import type { SharedLocation } from '../../domain/shareLink';
import {
  SEARCH_DEBOUNCE_MS,
  canConfirmMapPoint,
  createDestinationPickerState,
  destinationPickerReducer,
  isSearchBusy,
  pendingSharedFromDeepLink,
  pendingSharedFromText,
  resultCount,
  searchResultKind,
  sharedBannerKind,
  shouldStartSearch,
  toDestinationInputFromCandidate,
  toDestinationInputFromPoint,
  toDestinationInputFromShared,
  type DestinationPickerAction,
  type DestinationPickerState,
} from '../destinationPickerReducer';

const TOKYO_TOWER: GeoPoint = { latitude: 35.658581, longitude: 139.745433 };

function apply(
  state: DestinationPickerState,
  ...actions: readonly DestinationPickerAction[]
): DestinationPickerState {
  return actions.reduce(destinationPickerReducer, state);
}

function makeCandidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    id: 'geocode:35.658581,139.745433',
    name: '東京タワー',
    address: null,
    point: TOKYO_TOWER,
    source: 'geocode',
    ...overrides,
  };
}

function makeDestination(id: string, favorite = false): Destination {
  return {
    id,
    name: id,
    point: TOKYO_TOWER,
    createdAtEpochMs: 1_700_000_000_000,
    origin: 'manual',
    favorite,
    lastUsedAtEpochMs: null,
  };
}

function makeShared(overrides: Partial<SharedLocation> = {}): SharedLocation {
  return {
    point: TOKYO_TOWER,
    name: '東京タワー',
    kind: 'google-maps-url',
    needsResolution: false,
    ...overrides,
  };
}

describe('定数・初期状態', () => {
  it('検索 debounce は 300ms', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
  });

  it('初期状態は idle・空・最近/お気に入りは渡した値', () => {
    const recent = [makeDestination('r1')];
    const favorites = [makeDestination('f1', true)];
    const state = createDestinationPickerState({ recent, favorites });
    expect(state.query).toBe('');
    expect(state.searchStatus).toBe('idle');
    expect(state.searchGeneration).toBe(0);
    expect(state.results).toEqual([]);
    expect(state.recent).toEqual(recent);
    expect(state.favorites).toEqual(favorites);
    expect(state.clipboardStatus).toBe('idle');
    expect(state.pendingShared).toBeNull();
    expect(state.mapPoint).toBeNull();
    expect(state.mapStatus).toBe('idle');
    expect(state.mapCandidate).toBeNull();
  });
});

describe('検索 — debounce 待ちと世代管理（二重送信防止）', () => {
  it('query/changed で pending・世代+1・結果クリア', () => {
    const state = apply(createDestinationPickerState(), {
      type: 'query/changed',
      query: '東京タワー',
    });
    expect(state.query).toBe('東京タワー');
    expect(state.searchStatus).toBe('pending');
    expect(state.searchGeneration).toBe(1);
    expect(state.results).toEqual([]);
    expect(shouldStartSearch(state)).toBe(true);
    expect(isSearchBusy(state)).toBe(true);
  });

  it('同一クエリでは世代を進めない（同一 state 参照を返す）', () => {
    const base = apply(createDestinationPickerState(), {
      type: 'query/changed',
      query: '東京',
    });
    expect(
      destinationPickerReducer(base, { type: 'query/changed', query: '東京' }),
    ).toBe(base);
  });

  it('空文字にすると idle に戻り、検索は開始されない', () => {
    const state = apply(createDestinationPickerState(), {
      type: 'query/changed',
      query: '',
    });
    expect(state.searchStatus).toBe('idle');
    expect(shouldStartSearch(state)).toBe(false);
  });

  it('search/started（現世代）で loading になり、二重 started は無視される', () => {
    const pending = apply(createDestinationPickerState(), {
      type: 'query/changed',
      query: '東京',
    });
    const loading = destinationPickerReducer(pending, {
      type: 'search/started',
      generation: pending.searchGeneration,
    });
    expect(loading.searchStatus).toBe('loading');
    expect(isSearchBusy(loading)).toBe(true);

    const again = destinationPickerReducer(loading, {
      type: 'search/started',
      generation: loading.searchGeneration,
    });
    expect(again).toBe(loading); // 二重送信防止
  });

  it('古い世代の search/started は無視される', () => {
    const pending = apply(createDestinationPickerState(), {
      type: 'query/changed',
      query: '東京',
    });
    expect(
      destinationPickerReducer(pending, { type: 'search/started', generation: 999 }),
    ).toBe(pending);
  });

  it('search/succeeded で結果を反映し、0 件なら empty', () => {
    const pending = apply(createDestinationPickerState(), {
      type: 'query/changed',
      query: '東京',
    });
    const generation = pending.searchGeneration;
    const loading = destinationPickerReducer(pending, { type: 'search/started', generation });
    const success = destinationPickerReducer(loading, {
      type: 'search/succeeded',
      generation,
      results: [makeCandidate()],
    });
    expect(success.searchStatus).toBe('success');
    expect(resultCount(success)).toBe(1);
    expect(searchResultKind(success)).toBeNull();

    const empty = destinationPickerReducer(loading, {
      type: 'search/succeeded',
      generation,
      results: [],
    });
    expect(empty.searchStatus).toBe('empty');
    expect(searchResultKind(empty)).toBe('empty');
  });

  it('入力が変わった後の古い応答（成功・失敗）は捨てる', () => {
    const pending = apply(createDestinationPickerState(), {
      type: 'query/changed',
      query: '東京',
    });
    const staleGeneration = pending.searchGeneration;
    const loading = destinationPickerReducer(pending, {
      type: 'search/started',
      generation: staleGeneration,
    });
    const changed = destinationPickerReducer(loading, { type: 'query/changed', query: '大阪' });

    expect(
      destinationPickerReducer(changed, {
        type: 'search/succeeded',
        generation: staleGeneration,
        results: [makeCandidate()],
      }),
    ).toBe(changed);
    expect(
      destinationPickerReducer(changed, { type: 'search/failed', generation: staleGeneration }),
    ).toBe(changed);
  });

  it('search/failed で error・results クリア', () => {
    const pending = apply(createDestinationPickerState(), {
      type: 'query/changed',
      query: '東京',
    });
    const loading = destinationPickerReducer(pending, {
      type: 'search/started',
      generation: pending.searchGeneration,
    });
    const failed = destinationPickerReducer(loading, {
      type: 'search/failed',
      generation: pending.searchGeneration,
    });
    expect(failed.searchStatus).toBe('error');
    expect(failed.results).toEqual([]);
    expect(searchResultKind(failed)).toBe('error');
  });

  it('search/retried は同じクエリで再検索（世代+1）・空クエリでは無視', () => {
    const loaded = apply(
      createDestinationPickerState(),
      { type: 'query/changed', query: '東京' },
      { type: 'search/started', generation: 1 },
      { type: 'search/failed', generation: 1 },
    );
    const retried = destinationPickerReducer(loaded, { type: 'search/retried' });
    expect(retried.searchStatus).toBe('pending');
    expect(retried.searchGeneration).toBe(loaded.searchGeneration + 1);

    const empty = createDestinationPickerState();
    expect(destinationPickerReducer(empty, { type: 'search/retried' })).toBe(empty);
  });

  it('search/cleared で初期化', () => {
    const state = apply(
      createDestinationPickerState(),
      { type: 'query/changed', query: '東京' },
      { type: 'search/cleared' },
    );
    expect(state.query).toBe('');
    expect(state.searchStatus).toBe('idle');
    expect(state.results).toEqual([]);
    expect(state.searchGeneration).toBe(2);
  });
});

describe('クリップボード — ユーザー操作時のみ読む', () => {
  it('check-started で checking・二重チェックは無視', () => {
    const checking = destinationPickerReducer(createDestinationPickerState(), {
      type: 'clipboard/check-started',
    });
    expect(checking.clipboardStatus).toBe('checking');
    expect(
      destinationPickerReducer(checking, { type: 'clipboard/check-started' }),
    ).toBe(checking);
  });

  it('checked: リンクが無ければ none', () => {
    const state = apply(
      createDestinationPickerState(),
      { type: 'clipboard/check-started' },
      { type: 'clipboard/checked', shared: null },
    );
    expect(state.clipboardStatus).toBe('none');
    expect(state.pendingShared).toBeNull();
  });

  it('checked: 座標ありリンクは確認待ち（source=clipboard）になる', () => {
    const state = apply(
      createDestinationPickerState(),
      { type: 'clipboard/check-started' },
      { type: 'clipboard/checked', shared: makeShared() },
    );
    expect(state.clipboardStatus).toBe('idle');
    expect(state.pendingShared).toEqual({ source: 'clipboard', location: makeShared() });
    expect(sharedBannerKind(state)).toBe('ready');
  });

  it('短縮リンクは needs-resolution バナーになる', () => {
    const state = destinationPickerReducer(createDestinationPickerState(), {
      type: 'clipboard/checked',
      shared: makeShared({ point: null, needsResolution: true }),
    });
    expect(sharedBannerKind(state)).toBe('needs-resolution');
  });

  it('dismissed でバナーを閉じる', () => {
    const shown = destinationPickerReducer(createDestinationPickerState(), {
      type: 'shared/received',
      pending: { source: 'deep-link', location: makeShared() },
    });
    const dismissed = destinationPickerReducer(shown, { type: 'shared/dismissed' });
    expect(dismissed.pendingShared).toBeNull();
    expect(sharedBannerKind(dismissed)).toBeNull();
  });
});

describe('ディープリンク', () => {
  it('shared/received で確認待ち（source=deep-link）', () => {
    const pending = {
      source: 'deep-link' as const,
      location: makeShared({ kind: 'coordinates', name: null }),
    };
    const state = destinationPickerReducer(createDestinationPickerState(), {
      type: 'shared/received',
      pending,
    });
    expect(state.pendingShared).toEqual(pending);
    expect(sharedBannerKind(state)).toBe('ready');
  });
});

describe('地図で選ぶ — 逆ジオコーディングと世代管理', () => {
  it('point-selected で resolving・世代+1、resolved（現世代）で ready', () => {
    const selected = destinationPickerReducer(createDestinationPickerState(), {
      type: 'map/point-selected',
      point: TOKYO_TOWER,
    });
    expect(selected.mapPoint).toEqual(TOKYO_TOWER);
    expect(selected.mapStatus).toBe('resolving');
    expect(selected.mapGeneration).toBe(1);
    expect(canConfirmMapPoint(selected)).toBe(false);

    const resolved = destinationPickerReducer(selected, {
      type: 'map/resolved',
      generation: 1,
      candidate: makeCandidate({ source: 'reverse-geocode' }),
    });
    expect(resolved.mapStatus).toBe('ready');
    expect(resolved.mapCandidate?.name).toBe('東京タワー');
    expect(canConfirmMapPoint(resolved)).toBe(true);
  });

  it('逆ジオコーディング失敗（candidate=null）でも ready で確定できる（名前はフォールバック）', () => {
    const selected = destinationPickerReducer(createDestinationPickerState(), {
      type: 'map/point-selected',
      point: TOKYO_TOWER,
    });
    const resolved = destinationPickerReducer(selected, {
      type: 'map/resolved',
      generation: selected.mapGeneration,
      candidate: null,
    });
    expect(resolved.mapStatus).toBe('ready');
    expect(resolved.mapCandidate).toBeNull();
    expect(canConfirmMapPoint(resolved)).toBe(true);
  });

  it('古い地点の resolved は捨てる', () => {
    const first = destinationPickerReducer(createDestinationPickerState(), {
      type: 'map/point-selected',
      point: TOKYO_TOWER,
    });
    const second = destinationPickerReducer(first, {
      type: 'map/point-selected',
      point: { latitude: 35.0, longitude: 139.0 },
    });
    const staleResolved = destinationPickerReducer(second, {
      type: 'map/resolved',
      generation: first.mapGeneration, // 1（現在は 2）
      candidate: makeCandidate(),
    });
    expect(staleResolved).toBe(second);
  });

  it('map/cleared で初期化', () => {
    const selected = destinationPickerReducer(createDestinationPickerState(), {
      type: 'map/point-selected',
      point: TOKYO_TOWER,
    });
    const cleared = destinationPickerReducer(selected, { type: 'map/cleared' });
    expect(cleared.mapPoint).toBeNull();
    expect(cleared.mapStatus).toBe('idle');
    expect(cleared.mapCandidate).toBeNull();
  });
});

describe('最近・お気に入りの同期', () => {
  it('recent/synced で両方更新', () => {
    const recent = [makeDestination('r1'), makeDestination('r2')];
    const favorites = [makeDestination('f1', true)];
    const state = destinationPickerReducer(createDestinationPickerState(), {
      type: 'recent/synced',
      recent,
      favorites,
    });
    expect(state.recent).toEqual(recent);
    expect(state.favorites).toEqual(favorites);
  });
});

describe('純粋ヘルパ — 共有テキスト/ディープリンクの変換', () => {
  it('pendingSharedFromText: 座標付きテキストは確認待ちになる', () => {
    const pending = pendingSharedFromText('東京タワー\n35.658581, 139.745433');
    expect(pending?.source).toBe('clipboard');
    expect(pending?.location.point).toEqual(TOKYO_TOWER);
    expect(pending?.location.name).toBe('東京タワー');
  });

  it('pendingSharedFromText: 短縮リンクは needsResolution（point null）', () => {
    const pending = pendingSharedFromText('東京タワー\nhttps://maps.app.goo.gl/AbC123');
    expect(pending?.location.point).toBeNull();
    expect(pending?.location.needsResolution).toBe(true);
  });

  it('pendingSharedFromText: 解析不能・null・空文字は null', () => {
    expect(pendingSharedFromText('こんにちは')).toBeNull();
    expect(pendingSharedFromText('')).toBeNull();
    expect(pendingSharedFromText(null)).toBeNull();
  });

  it('pendingSharedFromDeepLink: exp://...--/set と yoridorimidori://set を解析', () => {
    expect(
      pendingSharedFromDeepLink('exp://127.0.0.1:8081/--/set?lat=35.658581&lon=139.745433'),
    ).toEqual({
      source: 'deep-link',
      location: {
        point: TOKYO_TOWER,
        name: null,
        kind: 'coordinates',
        needsResolution: false,
      },
    });
    expect(
      pendingSharedFromDeepLink('yoridorimidori://set?lat=1&lon=2&name=Tokyo')?.location.name,
    ).toBe('Tokyo');
  });

  it('pendingSharedFromDeepLink: 未知 URL・null は null', () => {
    expect(pendingSharedFromDeepLink('https://example.com')).toBeNull();
    expect(pendingSharedFromDeepLink(null)).toBeNull();
  });

  it('toDestinationInputFromCandidate: origin は manual', () => {
    expect(toDestinationInputFromCandidate(makeCandidate())).toEqual({
      name: '東京タワー',
      point: TOKYO_TOWER,
      origin: 'manual',
    });
  });

  it('toDestinationInputFromPoint: 名前なしはフォールバック・origin 指定可', () => {
    expect(toDestinationInputFromPoint(TOKYO_TOWER, null, '選択した地点')).toEqual({
      name: '選択した地点',
      point: TOKYO_TOWER,
      origin: 'manual',
    });
    expect(
      toDestinationInputFromPoint(TOKYO_TOWER, '  東京タワー  ', '選択した地点', 'current-location'),
    ).toEqual({ name: '東京タワー', point: TOKYO_TOWER, origin: 'current-location' });
  });

  it('toDestinationInputFromShared: 座標ありは変換・座標なし（短縮リンク）は null', () => {
    expect(toDestinationInputFromShared(makeShared(), '選択した地点')).toEqual({
      name: '東京タワー',
      point: TOKYO_TOWER,
      origin: 'manual',
    });
    expect(
      toDestinationInputFromShared(makeShared({ point: null, needsResolution: true }), '選択した地点'),
    ).toBeNull();
    expect(
      toDestinationInputFromShared(makeShared({ name: null }), '選択した地点')?.name,
    ).toBe('選択した地点');
  });
});

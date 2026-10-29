import {
  RECENT_DESTINATIONS_LIMIT,
  filterFavorites,
  recentDestinations,
  sortRecent,
  type RecentSortable,
} from '../destinationOrder';

interface TestDestination extends RecentSortable {
  readonly id: string;
}

function makeDestination(
  id: string,
  lastUsedAtEpochMs: number | null,
  favorite = false,
): TestDestination {
  return { id, lastUsedAtEpochMs, favorite };
}

describe('sortRecent — 最近順（lastUsedAtEpochMs 降順・null は末尾）', () => {
  it('降順に並べ、未使用（null）は末尾', () => {
    const destinations = [
      makeDestination('unused', null),
      makeDestination('old', 100),
      makeDestination('new', 300),
      makeDestination('middle', 200),
    ];
    expect(sortRecent(destinations).map((destination) => destination.id)).toEqual([
      'new',
      'middle',
      'old',
      'unused',
    ]);
  });

  it('同値の場合は元の順序を保つ（安定ソート）', () => {
    const destinations = [
      makeDestination('a', 200),
      makeDestination('b', 200),
      makeDestination('c', 200),
    ];
    expect(sortRecent(destinations).map((destination) => destination.id)).toEqual(['a', 'b', 'c']);
  });

  it('すべて null なら元の順序のまま', () => {
    const destinations = [makeDestination('a', null), makeDestination('b', null)];
    expect(sortRecent(destinations).map((destination) => destination.id)).toEqual(['a', 'b']);
  });

  it('元配列を変更しない（新しい配列を返す）', () => {
    const destinations = [makeDestination('old', 100), makeDestination('new', 300)];
    const snapshot = destinations.map((destination) => destination.id);
    const sorted = sortRecent(destinations);
    expect(sorted).not.toBe(destinations);
    expect(destinations.map((destination) => destination.id)).toEqual(snapshot);
  });

  it('空配列は空配列', () => {
    expect(sortRecent([])).toEqual([]);
  });
});

describe('filterFavorites — お気に入りフィルタ', () => {
  it('favorite の目的地だけを元の順序で返す', () => {
    const destinations = [
      makeDestination('a', 100, true),
      makeDestination('b', 200, false),
      makeDestination('c', null, true),
    ];
    expect(filterFavorites(destinations).map((destination) => destination.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('該当なし・空配列は空配列', () => {
    expect(filterFavorites([makeDestination('a', 100, false)])).toEqual([]);
    expect(filterFavorites([])).toEqual([]);
  });

  it('元配列を変更しない', () => {
    const destinations = [makeDestination('a', 100, true)];
    expect(filterFavorites(destinations)).not.toBe(destinations);
  });
});

describe('recentDestinations — 最近使った場所の上位', () => {
  it('未使用（null）は含めず、降順の上位 5 件（既定）', () => {
    const destinations = [
      makeDestination('unused', null),
      ...[1, 2, 3, 4, 5, 6, 7].map((index) => makeDestination(`d${index}`, index * 100)),
    ];
    const recent = recentDestinations(destinations);
    expect(recent.map((destination) => destination.id)).toEqual([
      'd7',
      'd6',
      'd5',
      'd4',
      'd3',
    ]);
    expect(recent).toHaveLength(RECENT_DESTINATIONS_LIMIT);
  });

  it('limit を指定できる', () => {
    const destinations = [makeDestination('a', 100), makeDestination('b', 300)];
    expect(recentDestinations(destinations, 1).map((destination) => destination.id)).toEqual([
      'b',
    ]);
  });

  it('limit が 0 以下・非有限なら空配列', () => {
    const destinations = [makeDestination('a', 100)];
    expect(recentDestinations(destinations, 0)).toEqual([]);
    expect(recentDestinations(destinations, -1)).toEqual([]);
    expect(recentDestinations(destinations, NaN)).toEqual([]);
    expect(recentDestinations(destinations, Infinity)).toEqual([]);
  });

  it('全件未使用なら空配列', () => {
    expect(recentDestinations([makeDestination('a', null)])).toEqual([]);
  });
});

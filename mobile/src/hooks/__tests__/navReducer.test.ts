import type { Thresholds } from '../../domain/constants';
import { computeNavState } from '../../domain/nav';
import type {
  Destination,
  HeadingFix,
  SampleLogEntry,
  SensorFix,
} from '../../domain/types';
import type { PermissionOutcome, ProviderError } from '../../ports/common';
import { createInitialNavAppState, type NavAppState } from '../navState';
import {
  MAX_ERRORS,
  MAX_STORAGE_WARNINGS,
  navReducer,
  type NavAction,
} from '../navReducer';
import {
  selectLatestError,
  selectNavState,
  selectSelectedDestination,
} from '../selectors';

const THRESHOLDS: Thresholds = {
  freshness: { freshMaxMs: 1_000, agingMaxMs: 2_000, staleMaxMs: 5_000 },
  gpsAccuracy: { goodMaxM: 5, fairMaxM: 20 },
  arrivalRadiusM: 10,
  sampleLogCapacity: 3,
};

const GRANTED: PermissionOutcome = { status: 'granted', canAskAgain: true };

function makeDestination(id: string, name = id): Destination {
  return {
    id,
    name,
    point: { latitude: 35.681236, longitude: 139.767125 },
    createdAtEpochMs: 1_700_000_000_000,
    origin: 'manual',
    // Phase 4（U02）で追加されたフィールド
    favorite: false,
    lastUsedAtEpochMs: null,
  };
}

function makeLocation(receivedAtMonotonicMs: number): SensorFix {
  return {
    point: { latitude: 35.68, longitude: 139.76 },
    accuracyM: 8,
    capturedAtEpochMs: null,
    receivedAtMonotonicMs,
    receivedAtEpochMs: 1_700_000_000_000 + receivedAtMonotonicMs,
    source: 'device',
  };
}

function makeHeading(receivedAtMonotonicMs: number): HeadingFix {
  return {
    headingDeg: 20,
    reference: 'true-north',
    accuracy: 3,
    receivedAtMonotonicMs,
    receivedAtEpochMs: 1_700_000_000_000 + receivedAtMonotonicMs,
    source: 'device',
  };
}

function makeError(code: ProviderError['code'], message?: string): ProviderError {
  return { code, message: message ?? code, atMonotonicMs: 0 };
}

function makeSample(index: number): SampleLogEntry {
  return {
    recordedAtEpochMs: index,
    latitude: 35.68,
    longitude: 139.76,
    gpsAccuracyM: 8,
    headingDeg: 20,
    headingReference: 'true-north',
    headingAccuracy: 3,
    locationAgeMs: 0,
    headingAgeMs: null,
  };
}

function apply(base: NavAppState, actions: readonly NavAction[]): NavAppState {
  return actions.reduce<NavAppState>((state, action) => navReducer(state, action), base);
}

function initial(): NavAppState {
  return createInitialNavAppState(true, THRESHOLDS);
}

/** 目的地・位置・方位・権限が揃った状態（セレクタ用）。 */
function navReadyState(): NavAppState {
  const destination = makeDestination('dest-a', '東京駅');
  return apply(initial(), [
    {
      type: 'boot/completed',
      destinations: [destination],
      selectedDestinationId: destination.id,
      nowMonotonicMs: 0,
    },
    { type: 'sensor/location', fix: makeLocation(1_000) },
    { type: 'sensor/heading', fix: makeHeading(1_000) },
    { type: 'tick', nowMonotonicMs: 2_500 },
  ]);
}

describe('createInitialNavAppState', () => {
  it('起動前の初期値（booted=false・空/null）を返す', () => {
    const state = initial();
    expect(state.booted).toBe(false);
    expect(state.permission).toBeNull();
    expect(state.headingUnavailable).toBe(false);
    expect(state.location).toBeNull();
    expect(state.heading).toBeNull();
    expect(state.destinations).toEqual([]);
    expect(state.selectedDestinationId).toBeNull();
    expect(state.mockMode).toBe(false);
    expect(state.scenarioId).toBeNull();
    expect(state.nowMonotonicMs).toBe(0);
    expect(state.samples).toEqual([]);
    expect(state.errors).toEqual([]);
    expect(state.storageWarnings).toEqual([]);
  });

  it('注入された devToolsVisible / thresholds をそのまま保持する', () => {
    const state = createInitialNavAppState(false, THRESHOLDS);
    expect(state.devToolsVisible).toBe(false);
    expect(state.thresholds).toBe(THRESHOLDS);
  });
});

describe('boot/completed', () => {
  it('目的地・選択・起動完了フラグ・現在時刻を設定する', () => {
    const a = makeDestination('a');
    const b = makeDestination('b');
    const next = navReducer(initial(), {
      type: 'boot/completed',
      destinations: [a, b],
      selectedDestinationId: 'b',
      nowMonotonicMs: 500,
    });
    expect(next.booted).toBe(true);
    expect(next.destinations).toEqual([a, b]);
    expect(next.selectedDestinationId).toBe('b');
    expect(next.nowMonotonicMs).toBe(500);
  });

  it('既存の nowMonotonicMs より古い値では巻き戻さない（Math.max）', () => {
    const base = navReducer(initial(), { type: 'tick', nowMonotonicMs: 900 });
    const next = navReducer(base, {
      type: 'boot/completed',
      destinations: [],
      selectedDestinationId: null,
      nowMonotonicMs: 100,
    });
    expect(next.nowMonotonicMs).toBe(900);
  });
});

describe('permission/changed', () => {
  it('権限状態を差し替える', () => {
    const next = navReducer(initial(), { type: 'permission/changed', permission: GRANTED });
    expect(next.permission).toBe(GRANTED);
  });
});

describe('sensor/location', () => {
  it('位置フィックスを設定する', () => {
    const fix = makeLocation(1_000);
    const next = navReducer(initial(), { type: 'sensor/location', fix });
    expect(next.location).toBe(fix);
  });

  it('nowMonotonicMs はフィックス受信時刻との Math.max で進む', () => {
    const base = navReducer(initial(), { type: 'tick', nowMonotonicMs: 5_000 });
    const older = navReducer(base, { type: 'sensor/location', fix: makeLocation(3_000) });
    expect(older.nowMonotonicMs).toBe(5_000);

    const newer = navReducer(older, { type: 'sensor/location', fix: makeLocation(8_000) });
    expect(newer.nowMonotonicMs).toBe(8_000);
    expect(newer.location).toEqual(makeLocation(8_000));
  });
});

describe('sensor/heading', () => {
  it('方位フィックスを差し替える（位置・現在時刻は変えない）', () => {
    const withLocation = navReducer(initial(), {
      type: 'sensor/location',
      fix: makeLocation(1_000),
    });
    const fix = makeHeading(1_200);
    const next = navReducer(withLocation, { type: 'sensor/heading', fix });
    expect(next.heading).toBe(fix);
    expect(next.location).toBe(withLocation.location);
    expect(next.nowMonotonicMs).toBe(1_000);
  });
});

describe('sensor/reset', () => {
  it('位置と方位を破棄する（目的地・時刻は保持）', () => {
    const base = apply(initial(), [
      { type: 'boot/completed', destinations: [], selectedDestinationId: null, nowMonotonicMs: 0 },
      { type: 'sensor/location', fix: makeLocation(1_000) },
      { type: 'sensor/heading', fix: makeHeading(1_000) },
    ]);
    const next = navReducer(base, { type: 'sensor/reset' });
    expect(next.location).toBeNull();
    expect(next.heading).toBeNull();
    expect(next.nowMonotonicMs).toBe(1_000);
    expect(next.booted).toBe(true);
  });
});

describe('heading/unavailable', () => {
  it('方位利用不可フラグを立てる', () => {
    const next = navReducer(initial(), { type: 'heading/unavailable' });
    expect(next.headingUnavailable).toBe(true);
  });
});

describe('tick', () => {
  it('nowMonotonicMs を進める', () => {
    const next = navReducer(initial(), { type: 'tick', nowMonotonicMs: 1_500 });
    expect(next.nowMonotonicMs).toBe(1_500);
  });

  it('過去の値では巻き戻さない', () => {
    const base = navReducer(initial(), { type: 'tick', nowMonotonicMs: 2_000 });
    const next = navReducer(base, { type: 'tick', nowMonotonicMs: 500 });
    expect(next.nowMonotonicMs).toBe(2_000);
  });
});

describe('mock/toggled', () => {
  it('Mock ON でセンサー値をリセットし、方位利用不可フラグも戻す', () => {
    const base = apply(initial(), [
      { type: 'sensor/location', fix: makeLocation(1_000) },
      { type: 'sensor/heading', fix: makeHeading(1_000) },
      { type: 'heading/unavailable' },
    ]);
    const next = navReducer(base, { type: 'mock/toggled', enabled: true });
    expect(next.mockMode).toBe(true);
    expect(next.location).toBeNull();
    expect(next.heading).toBeNull();
    expect(next.headingUnavailable).toBe(false);
  });

  it('Mock OFF で scenarioId もクリアする', () => {
    const base = apply(initial(), [
      { type: 'mock/toggled', enabled: true },
      { type: 'mock/scenario', scenarioId: 'straight' },
    ]);
    const next = navReducer(base, { type: 'mock/toggled', enabled: false });
    expect(next.mockMode).toBe(false);
    expect(next.scenarioId).toBeNull();
  });
});

describe('provider/error', () => {
  it('新しいエラーを先頭に追加する', () => {
    const base = navReducer(initial(), {
      type: 'provider/error',
      error: makeError('runtime-error', 'first'),
    });
    const next = navReducer(base, {
      type: 'provider/error',
      error: makeError('invalid-data', 'second'),
    });
    expect(next.errors.map((error) => error.message)).toEqual(['second', 'first']);
  });

  it('同一 code が連続した場合は置き換える（スパム防止）', () => {
    const base = navReducer(initial(), {
      type: 'provider/error',
      error: makeError('runtime-error', 'first'),
    });
    const next = navReducer(base, {
      type: 'provider/error',
      error: makeError('runtime-error', 'second'),
    });
    expect(next.errors).toHaveLength(1);
    expect(next.errors[0]?.message).toBe('second');
  });

  it('同一 code でも連続でなければ別エラーとして保持する', () => {
    const next = apply(initial(), [
      { type: 'provider/error', error: makeError('runtime-error', 'a') },
      { type: 'provider/error', error: makeError('invalid-data', 'b') },
      { type: 'provider/error', error: makeError('runtime-error', 'c') },
    ]);
    expect(next.errors).toHaveLength(3);
  });

  it(`最大 ${MAX_ERRORS} 件を超えたら古いものから捨てる`, () => {
    let state = initial();
    for (let index = 0; index < MAX_ERRORS + 2; index += 1) {
      const code = index % 2 === 0 ? 'runtime-error' : 'invalid-data';
      state = navReducer(state, {
        type: 'provider/error',
        error: makeError(code, `error-${index}`),
      });
    }
    expect(state.errors).toHaveLength(MAX_ERRORS);
    expect(state.errors[0]?.message).toBe(`error-${MAX_ERRORS + 1}`);
    expect(
      state.errors.some((error) => error.message === 'error-0'),
    ).toBe(false);
  });
});

describe('storage/warning', () => {
  it('警告メッセージを追加する', () => {
    const next = navReducer(initial(), {
      type: 'storage/warning',
      message: '保存に失敗しました',
    });
    expect(next.storageWarnings).toEqual(['保存に失敗しました']);
  });

  it(`最大 ${MAX_STORAGE_WARNINGS} 件を超えたら古いものから捨てる`, () => {
    let state = initial();
    for (let index = 0; index < MAX_STORAGE_WARNINGS + 1; index += 1) {
      state = navReducer(state, { type: 'storage/warning', message: `w-${index}` });
    }
    expect(state.storageWarnings).toHaveLength(MAX_STORAGE_WARNINGS);
    expect(state.storageWarnings[0]).toBe('w-1');
    expect(state.storageWarnings[MAX_STORAGE_WARNINGS - 1]).toBe(
      `w-${MAX_STORAGE_WARNINGS}`,
    );
  });
});

describe('errors/cleared', () => {
  it('エラー一覧を空にする', () => {
    const base = navReducer(initial(), {
      type: 'provider/error',
      error: makeError('runtime-error'),
    });
    const next = navReducer(base, { type: 'errors/cleared' });
    expect(next.errors).toEqual([]);
  });
});

describe('目的地アクション', () => {
  const a = makeDestination('a');
  const b = makeDestination('b');

  function withDestinations(): NavAppState {
    return apply(initial(), [
      {
        type: 'boot/completed',
        destinations: [a, b],
        selectedDestinationId: null,
        nowMonotonicMs: 0,
      },
    ]);
  }

  it('destination/selected で選択 id を設定・解除できる', () => {
    const selected = navReducer(withDestinations(), { type: 'destination/selected', id: 'a' });
    expect(selected.selectedDestinationId).toBe('a');
    const cleared = navReducer(selected, { type: 'destination/selected', id: null });
    expect(cleared.selectedDestinationId).toBeNull();
  });

  it('destination/added（select=true）で追加と同時に選択する', () => {
    const c = makeDestination('c', '新宿駅');
    const next = navReducer(withDestinations(), {
      type: 'destination/added',
      destination: c,
      select: true,
    });
    expect(next.destinations).toEqual([a, b, c]);
    expect(next.selectedDestinationId).toBe('c');
  });

  it('destination/added（select=false）では選択を変えない', () => {
    const base = navReducer(withDestinations(), {
      type: 'destination/selected',
      id: 'a',
    });
    const next = navReducer(base, {
      type: 'destination/added',
      destination: makeDestination('c'),
      select: false,
    });
    expect(next.destinations).toHaveLength(3);
    expect(next.selectedDestinationId).toBe('a');
  });

  it('destination/updated は同一 id だけを差し替える', () => {
    const updated: Destination = { ...a, name: '東京駅（更新）' };
    const next = navReducer(withDestinations(), {
      type: 'destination/updated',
      destination: updated,
    });
    expect(next.destinations.map((destination) => destination.name)).toEqual([
      '東京駅（更新）',
      'b',
    ]);
  });

  it('destination/removed で削除し、選択中の目的地なら選択を解除する', () => {
    const base = navReducer(withDestinations(), {
      type: 'destination/selected',
      id: 'a',
    });
    const next = navReducer(base, { type: 'destination/removed', id: 'a' });
    expect(next.destinations).toEqual([b]);
    expect(next.selectedDestinationId).toBeNull();
  });

  it('destination/removed で選択中以外を削除しても選択は維持される', () => {
    const base = navReducer(withDestinations(), {
      type: 'destination/selected',
      id: 'a',
    });
    const next = navReducer(base, { type: 'destination/removed', id: 'b' });
    expect(next.destinations).toEqual([a]);
    expect(next.selectedDestinationId).toBe('a');
  });

  it('destinations/replaced は一覧を差し替え、存在しない選択は解除する', () => {
    const base = navReducer(withDestinations(), {
      type: 'destination/selected',
      id: 'a',
    });
    const replaced = navReducer(base, {
      type: 'destinations/replaced',
      destinations: [makeDestination('c')],
    });
    expect(replaced.selectedDestinationId).toBeNull();

    const kept = navReducer(base, {
      type: 'destinations/replaced',
      destinations: [a, makeDestination('c')],
    });
    expect(kept.selectedDestinationId).toBe('a');
    expect(kept.destinations).toHaveLength(2);
  });
});

describe('サンプル', () => {
  it('samples/loaded は一覧を差し替え、容量に収める', () => {
    const next = navReducer(initial(), {
      type: 'samples/loaded',
      samples: [makeSample(1), makeSample(2), makeSample(3), makeSample(4), makeSample(5)],
    });
    expect(next.samples.map((entry) => entry.recordedAtEpochMs)).toEqual([3, 4, 5]);
  });

  it('samples/appended はリングバッファで先頭から落とす', () => {
    let state = initial();
    for (let index = 1; index <= 5; index += 1) {
      state = navReducer(state, { type: 'samples/appended', entry: makeSample(index) });
    }
    expect(state.samples.map((entry) => entry.recordedAtEpochMs)).toEqual([3, 4, 5]);
  });

  it('容量 300 で 301 件目に先頭が落ちる', () => {
    let state = createInitialNavAppState(false, {
      ...THRESHOLDS,
      sampleLogCapacity: 300,
    });
    for (let index = 1; index <= 301; index += 1) {
      state = navReducer(state, { type: 'samples/appended', entry: makeSample(index) });
    }
    expect(state.samples).toHaveLength(300);
    expect(state.samples[0]?.recordedAtEpochMs).toBe(2);
    expect(state.samples[299]?.recordedAtEpochMs).toBe(301);
  });
});

describe('純粋性', () => {
  const a = makeDestination('a');
  const ACTIONS: readonly NavAction[] = [
    { type: 'boot/completed', destinations: [a], selectedDestinationId: 'a', nowMonotonicMs: 1 },
    { type: 'permission/changed', permission: GRANTED },
    { type: 'sensor/location', fix: makeLocation(1) },
    { type: 'sensor/heading', fix: makeHeading(1) },
    { type: 'sensor/reset' },
    { type: 'heading/unavailable' },
    { type: 'provider/error', error: makeError('runtime-error') },
    { type: 'tick', nowMonotonicMs: 2 },
    { type: 'destination/selected', id: 'a' },
    { type: 'destination/added', destination: a, select: true },
    { type: 'destination/updated', destination: { ...a, name: 'x' } },
    { type: 'destination/removed', id: 'a' },
    { type: 'destinations/replaced', destinations: [a] },
    { type: 'samples/loaded', samples: [makeSample(1)] },
    { type: 'samples/appended', entry: makeSample(2) },
    { type: 'mock/toggled', enabled: true },
    { type: 'mock/scenario', scenarioId: 'static' },
    { type: 'storage/warning', message: 'w' },
    { type: 'errors/cleared' },
  ];

  it('どのアクションでも元 state を変更せず、新しいオブジェクトを返す', () => {
    const base = apply(initial(), [
      { type: 'boot/completed', destinations: [a], selectedDestinationId: 'a', nowMonotonicMs: 1 },
      { type: 'sensor/location', fix: makeLocation(1) },
    ]);
    const snapshot = JSON.stringify(base);
    for (const action of ACTIONS) {
      const next = navReducer(base, action);
      expect(next).not.toBe(base);
      expect(JSON.stringify(base)).toBe(snapshot);
    }
  });

  it('同じ state + action は同じ結果を返す（決定論）', () => {
    const base = initial();
    const action: NavAction = { type: 'tick', nowMonotonicMs: 123 };
    expect(navReducer(base, action)).toEqual(navReducer(base, action));
  });
});

describe('セレクタ', () => {
  it('selectSelectedDestination: 未選択は null', () => {
    expect(selectSelectedDestination(initial())).toBeNull();
  });

  it('selectSelectedDestination: 選択中の目的地を返す', () => {
    const state = navReadyState();
    expect(selectSelectedDestination(state)?.id).toBe('dest-a');
    expect(selectSelectedDestination(state)?.name).toBe('東京駅');
  });

  it('selectSelectedDestination: 一覧に無い id は null', () => {
    const state = navReducer(navReadyState(), {
      type: 'destination/selected',
      id: 'missing',
    });
    expect(selectSelectedDestination(state)).toBeNull();
  });

  it('selectNavState: computeNavState と deep equal（二重実装なし・state.thresholds を使用）', () => {
    const state = navReadyState();
    const destination = selectSelectedDestination(state);
    const expected = computeNavState(
      {
        destination,
        location: state.location,
        heading: state.heading,
        nowMonotonicMs: state.nowMonotonicMs,
        headingUnavailable: state.headingUnavailable,
      },
      state.thresholds,
    );
    expect(selectNavState(state)).toEqual(expected);
    // カスタム閾値が効いていること（この状態は経過 1.5 秒なので freshMax=1000 → aging）。
    expect(selectNavState(state).locationFreshness).toBe('aging');
  });

  it('selectNavState: thresholds を明示するとそちらを使う', () => {
    const state = navReadyState();
    const other: Thresholds = {
      ...THRESHOLDS,
      freshness: { freshMaxMs: 2_000, agingMaxMs: 4_000, staleMaxMs: 8_000 },
    };
    const selected = selectNavState(state, other);
    expect(selected.locationFreshness).toBe('fresh');
    expect(selected).toEqual(
      computeNavState(
        {
          destination: selectSelectedDestination(state),
          location: state.location,
          heading: state.heading,
          nowMonotonicMs: state.nowMonotonicMs,
          headingUnavailable: state.headingUnavailable,
        },
        other,
      ),
    );
  });

  it('selectLatestError: 空なら null・あれば新しい順の先頭を返す', () => {
    expect(selectLatestError(initial())).toBeNull();
    const state = apply(initial(), [
      { type: 'provider/error', error: makeError('runtime-error', 'first') },
      { type: 'provider/error', error: makeError('invalid-data', 'second') },
    ]);
    expect(selectLatestError(state)?.message).toBe('second');
  });
});

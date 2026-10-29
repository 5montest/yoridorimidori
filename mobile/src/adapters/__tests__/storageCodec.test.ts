import {
  DESTINATIONS_SCHEMA_VERSION,
  LEGACY_DESTINATIONS_SCHEMA_VERSION,
  SAMPLES_CHAR_BUDGET,
  SAMPLES_FALLBACK_KEEP_COUNT,
  SAMPLES_SCHEMA_VERSION,
  decodeDestinations,
  decodeSamples,
  encodeDestinations,
  encodeSamples,
  trimSamplesToCharBudget,
  type DecodeResult,
} from '../storage/codec';
import {
  DESTINATIONS_STORAGE_KEY,
  DESTINATIONS_STORAGE_KEY_V1,
  QUARANTINE_KEY_PREFIX,
  SAMPLES_STORAGE_KEY,
  quarantineKeyFor,
} from '../storage/storageKeys';
import type { Destination, SampleLogEntry } from '../../domain/types';

function expectOk<T>(result: DecodeResult<T>): Extract<DecodeResult<T>, { readonly ok: true }> {
  if (!result.ok) {
    throw new Error(`expected ok but got ${result.reason}`);
  }
  return result;
}

function makeDestination(overrides: Partial<Destination> = {}): Destination {
  const base: Destination = {
    id: 'dest-1',
    name: '東京駅',
    point: { latitude: 35.681236, longitude: 139.767125 },
    createdAtEpochMs: 1_700_000_000_000,
    origin: 'manual',
    favorite: false,
    lastUsedAtEpochMs: null,
  };
  return { ...base, ...overrides };
}

function makeSample(overrides: Partial<SampleLogEntry> = {}): SampleLogEntry {
  return {
    recordedAtEpochMs: 1_700_000_000_000,
    latitude: 35.68,
    longitude: 139.76,
    gpsAccuracyM: 8,
    headingDeg: 90,
    headingReference: 'true-north',
    headingAccuracy: 3,
    locationAgeMs: 0,
    headingAgeMs: 0,
    ...overrides,
  };
}

describe('storageKeys — §10.1', () => {
  it('目的地は v2・サンプルは v1・v1 キーは移行用（読み取りのみ）', () => {
    expect(DESTINATIONS_STORAGE_KEY).toBe('yoridorimidori/destinations/v2');
    expect(DESTINATIONS_STORAGE_KEY_V1).toBe('yoridorimidori/destinations/v1');
    expect(SAMPLES_STORAGE_KEY).toBe('yoridorimidori/samples/v1');
    expect(QUARANTINE_KEY_PREFIX).toBe('yoridorimidori/quarantine/');
  });

  it('退避キーは <prefix><storageKey>/<epochMs>', () => {
    expect(quarantineKeyFor(DESTINATIONS_STORAGE_KEY, 1_700_000_000_000)).toBe(
      'yoridorimidori/quarantine/yoridorimidori/destinations/v2/1700000000000',
    );
  });

  it('スキーマバージョン（目的地 v2 / 旧 v1 / サンプル v1）・サイズ防御の既定値', () => {
    expect(DESTINATIONS_SCHEMA_VERSION).toBe(2);
    expect(LEGACY_DESTINATIONS_SCHEMA_VERSION).toBe(1);
    expect(SAMPLES_SCHEMA_VERSION).toBe(1);
    expect(SAMPLES_CHAR_BUDGET).toBe(200_000);
    expect(SAMPLES_FALLBACK_KEEP_COUNT).toBe(150);
  });
});

describe('encode / decode ラウンドトリップ', () => {
  it('目的地（items + selectedId）', () => {
    const items = [makeDestination(), makeDestination({ id: 'dest-2', name: '新宿駅' })];
    const raw = encodeDestinations(items, 'dest-2');
    const decoded = expectOk(decodeDestinations(raw));
    expect(decoded.value.items).toEqual(items);
    expect(decoded.value.selectedId).toBe('dest-2');
    expect(decoded.droppedCount).toBe(0);
  });

  it('サンプル（古い順を保持）', () => {
    const items = [
      makeSample({ recordedAtEpochMs: 1 }),
      makeSample({ recordedAtEpochMs: 2, gpsAccuracyM: null, headingDeg: null }),
    ];
    const raw = encodeSamples(items);
    const decoded = expectOk(decodeSamples(raw));
    expect(decoded.value.items).toEqual(items);
    expect(decoded.droppedCount).toBe(0);
  });

  it('favorite / lastUsedAtEpochMs もラウンドトリップする（v2）', () => {
    const item = makeDestination({ favorite: true, lastUsedAtEpochMs: 1_700_000_123_456 });
    const decoded = expectOk(decodeDestinations(encodeDestinations([item], item.id)));
    expect(decoded.value.items[0]).toEqual(item);
    expect(decoded.value.selectedId).toBe(item.id);
    expect(decoded.migratedFromVersion).toBeUndefined();
  });

  it('encode した JSON は schemaVersion を含む（目的地 v2・サンプル v1）', () => {
    const parsed = JSON.parse(encodeDestinations([makeDestination()], null)) as Record<
      string,
      unknown
    >;
    expect(parsed.schemaVersion).toBe(DESTINATIONS_SCHEMA_VERSION);
    expect(Array.isArray(parsed.items)).toBe(true);
    const samples = JSON.parse(encodeSamples([makeSample()])) as Record<string, unknown>;
    expect(samples.schemaVersion).toBe(SAMPLES_SCHEMA_VERSION);
  });
});

describe('decodeDestinations — 破損・形状', () => {
  it('不正 JSON は parse で ok:false（throw しない）', () => {
    const result = decodeDestinations('{not json');
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe('parse');
    expect(result.raw).toBe('{not json');
  });

  it('ルートが配列・プリミティブなら shape', () => {
    for (const raw of ['[]', '"text"', '42', 'null']) {
      const result = decodeDestinations(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('shape');
      }
    }
  });

  it('items が配列でないなら shape', () => {
    const result = decodeDestinations(JSON.stringify({ schemaVersion: 1, items: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('shape');
    }
  });

  it('schemaVersion 未知（3）は future-version・上書きしない', () => {
    const raw = JSON.stringify({ schemaVersion: 3, items: [] });
    const result = decodeDestinations(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('future-version');
      expect(result.raw).toBe(raw);
    }
  });

  it('schemaVersion 2（現行）は移行なしで読む', () => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      items: [makeDestination({ favorite: true })],
      selectedId: null,
    });
    const decoded = expectOk(decodeDestinations(raw));
    expect(decoded.migratedFromVersion).toBeUndefined();
    expect(decoded.value.items[0]?.favorite).toBe(true);
  });

  it('schemaVersion 欠落は v1 として読み、既定値で補完する', () => {
    const raw = JSON.stringify({ items: [makeDestination()], selectedId: 'dest-1' });
    const decoded = expectOk(decodeDestinations(raw));
    expect(decoded.value.items).toHaveLength(1);
    expect(decoded.value.selectedId).toBe('dest-1');
    expect(decoded.migratedFromVersion).toBe(LEGACY_DESTINATIONS_SCHEMA_VERSION);
  });

  it('schemaVersion が 0 / 文字列なら shape', () => {
    for (const version of [0, -1, '1', 1.5]) {
      const result = decodeDestinations(JSON.stringify({ schemaVersion: version, items: [] }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('shape');
      }
    }
  });
});

describe('decodeDestinations — v1 → v2 移行（Phase 4 / U04）', () => {
  const V1_ITEM = {
    id: 'dest-v1',
    name: '東京駅',
    point: { latitude: 35.681236, longitude: 139.767125 },
    createdAtEpochMs: 1_700_000_000_000,
    origin: 'manual',
  };

  it('v1 データは favorite:false / lastUsedAtEpochMs:null で補完し migratedFromVersion=1 を返す', () => {
    const raw = JSON.stringify({ schemaVersion: 1, items: [V1_ITEM], selectedId: 'dest-v1' });
    const decoded = expectOk(decodeDestinations(raw));
    expect(decoded.migratedFromVersion).toBe(LEGACY_DESTINATIONS_SCHEMA_VERSION);
    expect(decoded.value.items[0]).toEqual({
      ...V1_ITEM,
      favorite: false,
      lastUsedAtEpochMs: null,
    });
    expect(decoded.value.selectedId).toBe('dest-v1');
  });

  it('v1 要素の favorite / lastUsedAtEpochMs が型不正なら既定値に倒す（要素は捨てない）', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      items: [{ ...V1_ITEM, favorite: 'yes', lastUsedAtEpochMs: 'yesterday' }],
      selectedId: null,
    });
    const decoded = expectOk(decodeDestinations(raw));
    expect(decoded.droppedCount).toBe(0);
    expect(decoded.value.items[0]?.favorite).toBe(false);
    expect(decoded.value.items[0]?.lastUsedAtEpochMs).toBeNull();
  });

  it('v1 の座標不正は従来どおり読み飛ばす（droppedCount）', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      items: [{ ...V1_ITEM, point: { latitude: 91, longitude: 0 } }],
      selectedId: null,
    });
    const decoded = expectOk(decodeDestinations(raw));
    expect(decoded.value.items).toEqual([]);
    expect(decoded.droppedCount).toBe(1);
  });
});

describe('decodeDestinations — 要素単位の読み飛ばし', () => {
  it('緯度が文字列の要素だけ読み飛ばし、他は救済する', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      items: [
        makeDestination(),
        { ...makeDestination({ id: 'bad' }), point: { latitude: '35.6', longitude: 139.7 } },
      ],
      selectedId: null,
    });
    const decoded = expectOk(decodeDestinations(raw));
    expect(decoded.value.items).toHaveLength(1);
    expect(decoded.value.items[0]?.id).toBe('dest-1');
    expect(decoded.droppedCount).toBe(1);
  });

  it('座標範囲外（緯度 91）・NaN・name 不正・origin 不正は読み飛ばす', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      items: [
        { ...makeDestination({ id: 'lat' }), point: { latitude: 91, longitude: 0 } },
        { ...makeDestination({ id: 'nan' }), point: { latitude: null, longitude: 0 } },
        { ...makeDestination({ id: 'name' }), name: '   ' },
        { ...makeDestination({ id: 'origin' }), origin: 'unknown-origin' },
        { ...makeDestination({ id: 'ok' }) },
      ],
      selectedId: null,
    });
    const decoded = expectOk(decodeDestinations(raw));
    expect(decoded.value.items.map((item) => item.id)).toEqual(['ok']);
    expect(decoded.droppedCount).toBe(4);
  });

  it('重複 id は先勝ち（後の要素は読み飛ばす）', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      items: [
        makeDestination({ id: 'dup', name: '先' }),
        makeDestination({ id: 'dup', name: '後' }),
      ],
      selectedId: null,
    });
    const decoded = expectOk(decodeDestinations(raw));
    expect(decoded.value.items).toHaveLength(1);
    expect(decoded.value.items[0]?.name).toBe('先');
    expect(decoded.droppedCount).toBe(1);
  });

  it('selectedId が存在しない id・非文字列なら null に補正する', () => {
    const missing = expectOk(
      decodeDestinations(
        JSON.stringify({ schemaVersion: 1, items: [makeDestination()], selectedId: 'missing' }),
      ),
    );
    expect(missing.value.selectedId).toBeNull();
    const nonString = expectOk(
      decodeDestinations(
        JSON.stringify({ schemaVersion: 1, items: [makeDestination()], selectedId: 42 }),
      ),
    );
    expect(nonString.value.selectedId).toBeNull();
  });

  it('未知フィールドは無視する（前方互換）', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      meta: { unknown: true },
      items: [{ ...makeDestination(), extra: 'x' }],
      selectedId: null,
    });
    const decoded = expectOk(decodeDestinations(raw));
    const item = decoded.value.items[0];
    expect(item).toBeDefined();
    expect(item === undefined ? undefined : Object.hasOwn(item, 'extra')).toBe(false);
  });
});

describe('decodeSamples — 容量と要素検証', () => {
  it('容量超過（301 件）は新しい 300 件だけ残す', () => {
    const items = Array.from({ length: 301 }, (_, index) =>
      makeSample({ recordedAtEpochMs: index }),
    );
    const raw = encodeSamples(items);
    const decoded = expectOk(decodeSamples(raw));
    expect(decoded.value.items).toHaveLength(300);
    expect(decoded.value.items[0]?.recordedAtEpochMs).toBe(1); // 最古の 1 件が落ちる
    expect(decoded.value.items[299]?.recordedAtEpochMs).toBe(300);
  });

  it('カスタム容量で切り詰める', () => {
    const items = Array.from({ length: 10 }, (_, index) => makeSample({ recordedAtEpochMs: index }));
    const decoded = expectOk(decodeSamples(encodeSamples(items), 3));
    expect(decoded.value.items.map((entry) => entry.recordedAtEpochMs)).toEqual([7, 8, 9]);
  });

  it('型不正要素だけ読み飛ばす', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      items: [
        makeSample({ recordedAtEpochMs: 1 }),
        { ...makeSample({ recordedAtEpochMs: 2 }), headingReference: 'bogus' },
        { ...makeSample({ recordedAtEpochMs: 3 }), latitude: '35.6' },
        makeSample({ recordedAtEpochMs: 4 }),
      ],
    });
    const decoded = expectOk(decodeSamples(raw));
    expect(decoded.value.items.map((entry) => entry.recordedAtEpochMs)).toEqual([1, 4]);
    expect(decoded.droppedCount).toBe(2);
  });

  it('headingDeg 360 は 0 に正規化して読む', () => {
    const decoded = expectOk(
      decodeSamples(encodeSamples([makeSample({ headingDeg: 360 })])),
    );
    expect(decoded.value.items[0]?.headingDeg).toBe(0);
  });

  it('空配列・items 非配列', () => {
    const empty = expectOk(decodeSamples(JSON.stringify({ schemaVersion: 1, items: [] })));
    expect(empty.value.items).toEqual([]);
    const shape = decodeSamples(JSON.stringify({ schemaVersion: 1, items: 'x' }));
    expect(shape.ok).toBe(false);
    if (!shape.ok) {
      expect(shape.reason).toBe('shape');
    }
  });
});

describe('trimSamplesToCharBudget — §10.5 のサイズ防御', () => {
  it('予算内なら入力をそのまま返す', () => {
    const items = [makeSample()];
    expect(trimSamplesToCharBudget(items, SAMPLES_CHAR_BUDGET)).toBe(items);
  });

  it('予算超過なら最新側から keepLast 件を残す', () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      makeSample({ recordedAtEpochMs: index }),
    );
    const trimmed = trimSamplesToCharBudget(items, 10, 3);
    expect(trimmed.map((entry) => entry.recordedAtEpochMs)).toEqual([7, 8, 9]);
  });

  it('空配列は空配列・keepLast が不正なら既定 150', () => {
    expect(trimSamplesToCharBudget([], 10)).toEqual([]);
    const items = Array.from({ length: 200 }, (_, index) =>
      makeSample({ recordedAtEpochMs: index }),
    );
    const trimmed = trimSamplesToCharBudget(items, 10, 0);
    expect(trimmed).toHaveLength(SAMPLES_FALLBACK_KEEP_COUNT);
    expect(trimmed[149]?.recordedAtEpochMs).toBe(199);
  });
});

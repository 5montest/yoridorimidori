import AsyncStorage from '@react-native-async-storage/async-storage';
import { FakeClock } from '../clock/FakeClock';
import { AsyncStorageDestinationRepository } from '../storage/AsyncStorageDestinationRepository';
import {
  AsyncStorageSampleLogRepository,
  SAMPLE_WRITE_BATCH_SIZE,
  SAMPLE_WRITE_DEBOUNCE_MS,
} from '../storage/AsyncStorageSampleLogRepository';
import { encodeDestinations, encodeSamples } from '../storage/codec';
import {
  DESTINATIONS_STORAGE_KEY,
  SAMPLES_STORAGE_KEY,
  quarantineKeyFor,
} from '../storage/storageKeys';
import type { Destination, SampleLogEntry } from '../../domain/types';

const TOKYO = { latitude: 35.681236, longitude: 139.767125 };
const SHINJUKU = { latitude: 35.689592, longitude: 139.700413 };
const EPOCH = 1_700_000_000_000;

function makeIdFactory(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `id-${counter}`;
  };
}

function makeDestination(overrides: Partial<Destination> = {}): Destination {
  const base: Destination = {
    id: 'dest-1',
    name: '東京駅',
    point: TOKYO,
    createdAtEpochMs: EPOCH,
    origin: 'manual',
    favorite: false,
    lastUsedAtEpochMs: null,
  };
  return { ...base, ...overrides };
}

function makeSample(recordedAtEpochMs: number): SampleLogEntry {
  return {
    recordedAtEpochMs,
    latitude: TOKYO.latitude,
    longitude: TOKYO.longitude,
    gpsAccuracyM: 8,
    headingDeg: 0,
    headingReference: 'true-north',
    headingAccuracy: 3,
    locationAgeMs: 0,
    headingAgeMs: 0,
  };
}

/** 公式モックの `setItem`（jest.fn）にアクセスするためのキャスト。呼び出し回数の検証に使う。 */
function setItemMock(): jest.Mock {
  return AsyncStorage.setItem as unknown as jest.Mock;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('AsyncStorageDestinationRepository — CRUD と永続化', () => {
  it('add → 新しいインスタンスの list() に反映される（永続化）', async () => {
    const clock = new FakeClock(0, EPOCH);
    const ids = makeIdFactory();
    const repository = new AsyncStorageDestinationRepository(clock, ids);
    const created = await repository.add({ name: ' 東京駅 ', point: TOKYO, origin: 'manual' });
    expect(created).toEqual({
      id: 'id-1',
      name: '東京駅',
      point: TOKYO,
      createdAtEpochMs: EPOCH,
      origin: 'manual',
      favorite: false,
      lastUsedAtEpochMs: null,
    });

    const reopened = new AsyncStorageDestinationRepository(clock, ids);
    await expect(reopened.list()).resolves.toEqual([created]);
  });

  it('並行 add も直列化され、両方永続化される（lost update なし）', async () => {
    const clock = new FakeClock(0, EPOCH);
    const ids = makeIdFactory();
    const repository = new AsyncStorageDestinationRepository(clock, ids);
    await Promise.all([
      repository.add({ name: 'A', point: TOKYO, origin: 'manual' }),
      repository.add({ name: 'B', point: SHINJUKU, origin: 'manual' }),
    ]);
    const reopened = new AsyncStorageDestinationRepository(clock, ids);
    await expect(reopened.list()).resolves.toHaveLength(2);
  });

  it('update / remove / clear と選択の永続化', async () => {
    const clock = new FakeClock(0, EPOCH);
    const ids = makeIdFactory();
    const repository = new AsyncStorageDestinationRepository(clock, ids);
    const first = await repository.add({ name: 'A', point: TOKYO, origin: 'manual' });
    const second = await repository.add({ name: 'B', point: SHINJUKU, origin: 'manual' });

    const updated = await repository.update(first.id, { name: 'A2', point: SHINJUKU });
    expect(updated).toEqual({ ...first, name: 'A2', point: SHINJUKU });
    await expect(repository.update('missing', { name: 'x' })).resolves.toBeNull();

    await repository.writeSelection(second.id);
    const reopened = new AsyncStorageDestinationRepository(clock, ids);
    await expect(reopened.readSelection()).resolves.toBe(second.id);

    await repository.remove(second.id); // 選択中 → 解除
    await expect(reopened.readSelection()).resolves.toBeNull();
    await expect(reopened.list()).resolves.toHaveLength(1);

    await repository.clear();
    await expect(repository.list()).resolves.toEqual([]);
  });

  it('writeSelection は存在しない id を null として保存する', async () => {
    const clock = new FakeClock(0, EPOCH);
    const ids = makeIdFactory();
    const repository = new AsyncStorageDestinationRepository(clock, ids);
    const created = await repository.add({ name: 'A', point: TOKYO, origin: 'manual' });

    await repository.writeSelection('missing');
    await expect(repository.readSelection()).resolves.toBeNull();
    await repository.writeSelection(created.id);
    await expect(repository.readSelection()).resolves.toBe(created.id);
  });

  it('selectedId が壊れている（存在しない id）なら null に補正される', async () => {
    await AsyncStorage.setItem(
      DESTINATIONS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, items: [makeDestination()], selectedId: 'missing' }),
    );
    const clock = new FakeClock(0, EPOCH);
    const repository = new AsyncStorageDestinationRepository(clock, makeIdFactory());
    await expect(repository.readSelection()).resolves.toBeNull();
  });
});

describe('AsyncStorageDestinationRepository — 破損・警告・保存失敗', () => {
  it('破損 JSON は [] を返し、quarantine に退避され onWarning が呼ばれる', async () => {
    const clock = new FakeClock(0, EPOCH);
    await AsyncStorage.setItem(DESTINATIONS_STORAGE_KEY, '{broken json');
    const warnings: string[] = [];
    const repository = new AsyncStorageDestinationRepository(clock, makeIdFactory(), (message) =>
      warnings.push(message),
    );

    await expect(repository.list()).resolves.toEqual([]);
    await expect(
      AsyncStorage.getItem(quarantineKeyFor(DESTINATIONS_STORAGE_KEY, clock.nowEpochMs())),
    ).resolves.toBe('{broken json');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('parse');
  });

  it('要素の型不正混在は有効要素のみ返し、onWarning に件数が出る', async () => {
    const valid = makeDestination();
    await AsyncStorage.setItem(
      DESTINATIONS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        items: [valid, { ...valid, id: 'bad', point: { latitude: 91, longitude: 0 } }],
        selectedId: null,
      }),
    );
    const warnings: string[] = [];
    const repository = new AsyncStorageDestinationRepository(
      new FakeClock(0, EPOCH),
      makeIdFactory(),
      (message) => warnings.push(message),
    );
    const items = await repository.list();
    expect(items).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('1 件');
  });

  it('保存失敗（setItem reject）は onWarning を呼んで reject する', async () => {
    const clock = new FakeClock(0, EPOCH);
    const warnings: string[] = [];
    const repository = new AsyncStorageDestinationRepository(clock, makeIdFactory(), (message) =>
      warnings.push(message),
    );
    // 未処理の rejected Promise を作らないよう mockImplementationOnce を使う。
    setItemMock().mockImplementationOnce(() => Promise.reject(new Error('quota')));

    await expect(
      repository.add({ name: 'A', point: TOKYO, origin: 'manual' }),
    ).rejects.toThrow('quota');
    expect(warnings).toHaveLength(1);
  });
});

describe('AsyncStorageSampleLogRepository — デバウンスと永続化', () => {
  it('append 5 件 + flush() で setItem が 1 回だけ呼ばれる', async () => {
    const clock = new FakeClock(0, EPOCH);
    const setItem = setItemMock();
    const repository = new AsyncStorageSampleLogRepository(clock);
    for (let index = 0; index < 5; index += 1) {
      await repository.append(makeSample(index));
    }
    expect(setItem).not.toHaveBeenCalled();

    await repository.flush();
    expect(setItem).toHaveBeenCalledTimes(1);

    const reopened = new AsyncStorageSampleLogRepository(clock);
    const loaded = await reopened.list();
    expect(loaded.map((entry) => entry.recordedAtEpochMs)).toEqual([0, 1, 2, 3, 4]);
  });

  it('20 件で自動書込される', async () => {
    const clock = new FakeClock(0, EPOCH);
    const setItem = setItemMock();
    const repository = new AsyncStorageSampleLogRepository(clock);
    for (let index = 0; index < SAMPLE_WRITE_BATCH_SIZE; index += 1) {
      await repository.append(makeSample(index));
      expect(setItem).toHaveBeenCalledTimes(index === SAMPLE_WRITE_BATCH_SIZE - 1 ? 1 : 0);
    }
    await repository.flush(); // 保留なし → 追加書込なし
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('5 秒経過で自動書込される（setTimeout を使わない）', async () => {
    const clock = new FakeClock(0, EPOCH);
    const setItem = setItemMock();
    const repository = new AsyncStorageSampleLogRepository(clock);
    await repository.append(makeSample(0));
    clock.advance(SAMPLE_WRITE_DEBOUNCE_MS - 1);
    await repository.append(makeSample(1));
    expect(setItem).not.toHaveBeenCalled(); // 4,999 ms では書かない
    clock.advance(1);
    await repository.append(makeSample(2));
    expect(setItem).toHaveBeenCalledTimes(1); // 5,000 ms で書く
  });

  it('容量 300 を超えると古いものから落ちる', async () => {
    const clock = new FakeClock(0, EPOCH);
    const repository = new AsyncStorageSampleLogRepository(clock);
    for (let index = 0; index < 305; index += 1) {
      await repository.append(makeSample(index));
    }
    await repository.flush();

    const reopened = new AsyncStorageSampleLogRepository(clock);
    const loaded = await reopened.load();
    expect(loaded).toHaveLength(300);
    expect(loaded[0]?.recordedAtEpochMs).toBe(5);
    expect(loaded[299]?.recordedAtEpochMs).toBe(304);
  });

  it('保存済み 301 件を load() すると新しい 300 件に切り詰められる', async () => {
    const items = Array.from({ length: 301 }, (_, index) => makeSample(index));
    await AsyncStorage.setItem(SAMPLES_STORAGE_KEY, encodeSamples(items));
    const repository = new AsyncStorageSampleLogRepository(new FakeClock(0, EPOCH));
    const loaded = await repository.load();
    expect(loaded).toHaveLength(300);
    expect(loaded[0]?.recordedAtEpochMs).toBe(1);
  });

  it('clear() で全消去される', async () => {
    const clock = new FakeClock(0, EPOCH);
    const repository = new AsyncStorageSampleLogRepository(clock);
    await repository.append(makeSample(0));
    await repository.flush();
    await repository.clear();
    await expect(repository.list()).resolves.toEqual([]);
    await expect(AsyncStorage.getItem(SAMPLES_STORAGE_KEY)).resolves.toBeNull();
  });
});

describe('AsyncStorageSampleLogRepository — 破損・保存失敗', () => {
  it('破損 JSON は [] を返し、quarantine に退避され onWarning が呼ばれる', async () => {
    const clock = new FakeClock(0, EPOCH);
    await AsyncStorage.setItem(SAMPLES_STORAGE_KEY, 'not json');
    const warnings: string[] = [];
    const repository = new AsyncStorageSampleLogRepository(clock, (message) =>
      warnings.push(message),
    );
    await expect(repository.load()).resolves.toEqual([]);
    await expect(
      AsyncStorage.getItem(quarantineKeyFor(SAMPLES_STORAGE_KEY, clock.nowEpochMs())),
    ).resolves.toBe('not json');
    expect(warnings).toHaveLength(1);
  });

  it('要素の型不正は読み飛ばし、onWarning に件数が出る', async () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      items: [makeSample(0), { ...makeSample(1), headingReference: 'bogus' }],
    });
    await AsyncStorage.setItem(SAMPLES_STORAGE_KEY, raw);
    const warnings: string[] = [];
    const repository = new AsyncStorageSampleLogRepository(new FakeClock(0, EPOCH), (message) =>
      warnings.push(message),
    );
    const loaded = await repository.load();
    expect(loaded).toHaveLength(1);
    expect(warnings[0]).toContain('1 件');
  });

  it('保存失敗は flush を reject させ、onWarning を呼ぶ', async () => {
    const clock = new FakeClock(0, EPOCH);
    const warnings: string[] = [];
    const repository = new AsyncStorageSampleLogRepository(clock, (message) =>
      warnings.push(message),
    );
    await repository.append(makeSample(0)); // 保留のみ（setItem は呼ばれない）
    setItemMock().mockImplementationOnce(() => Promise.reject(new Error('quota')));
    await expect(repository.flush()).rejects.toThrow('quota');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('保存に失敗');
  });
});

describe('AsyncStorage の decode 経由の整合（目的地）', () => {
  it('encode した生データを直接書いても list() で読める', async () => {
    const destinations = [makeDestination(), makeDestination({ id: 'dest-2', name: '新宿駅' })];
    await AsyncStorage.setItem(
      DESTINATIONS_STORAGE_KEY,
      encodeDestinations(destinations, 'dest-2'),
    );
    const clock = new FakeClock(0, EPOCH);
    const repository = new AsyncStorageDestinationRepository(clock, makeIdFactory());
    await expect(repository.list()).resolves.toEqual(destinations);
    await expect(repository.readSelection()).resolves.toBe('dest-2');
  });
});

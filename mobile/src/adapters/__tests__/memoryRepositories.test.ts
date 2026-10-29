import { FakeClock } from '../clock/FakeClock';
import { InMemoryDestinationRepository } from '../memory/InMemoryDestinationRepository';
import { InMemorySampleLogRepository } from '../memory/InMemorySampleLogRepository';
import type { SampleLogEntry } from '../../domain/types';

function makeIdFactory(): { readonly next: () => string; readonly count: () => number } {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `id-${counter}`;
    },
    count: () => counter,
  };
}

const TOKYO = { latitude: 35.681236, longitude: 139.767125 };
const SHINJUKU = { latitude: 35.689592, longitude: 139.700413 };

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

describe('InMemoryDestinationRepository', () => {
  it('add → list が作成順・id は idFactory・作成時刻は Clock', async () => {
    const clock = new FakeClock(0, 1_000);
    const ids = makeIdFactory();
    const repository = new InMemoryDestinationRepository(clock, ids.next);

    await expect(repository.list()).resolves.toEqual([]);
    const first = await repository.add({ name: ' 東京駅 ', point: TOKYO, origin: 'preset' });
    expect(first).toEqual({
      id: 'id-1',
      name: '東京駅', // trim 済み
      point: TOKYO,
      createdAtEpochMs: 1_000,
      origin: 'preset',
    });

    clock.advance(5_000);
    await repository.add({ name: '新宿駅', point: SHINJUKU, origin: 'manual' });

    const list = await repository.list();
    expect(list.map((item) => item.name)).toEqual(['東京駅', '新宿駅']);
    expect(list.map((item) => item.createdAtEpochMs)).toEqual([1_000, 6_000]);
    expect(ids.count()).toBe(2);
  });

  it('update は存在する id だけ更新し、存在しない id は null', async () => {
    const repository = new InMemoryDestinationRepository(new FakeClock(), makeIdFactory().next);
    const created = await repository.add({ name: '東京駅', point: TOKYO, origin: 'manual' });

    const updated = await repository.update(created.id, { name: '  新宿駅  ', point: SHINJUKU });
    expect(updated).toEqual({ ...created, name: '新宿駅', point: SHINJUKU });
    await expect(repository.update('missing', { name: 'x' })).resolves.toBeNull();
    const list = await repository.list();
    expect(list[0]?.name).toBe('新宿駅');
  });

  it('remove で選択中の目的地も解除する', async () => {
    const repository = new InMemoryDestinationRepository(new FakeClock(), makeIdFactory().next);
    const first = await repository.add({ name: 'A', point: TOKYO, origin: 'manual' });
    const second = await repository.add({ name: 'B', point: SHINJUKU, origin: 'manual' });
    await repository.writeSelection(second.id);
    await expect(repository.readSelection()).resolves.toBe(second.id);

    await repository.remove(first.id); // 選択中ではない → 選択は維持
    await expect(repository.readSelection()).resolves.toBe(second.id);

    await repository.remove(second.id); // 選択中 → 解除
    await expect(repository.readSelection()).resolves.toBeNull();
    await expect(repository.list()).resolves.toEqual([]);
  });

  it('writeSelection は存在しない id を保存しない（null 扱い）', async () => {
    const repository = new InMemoryDestinationRepository(new FakeClock(), makeIdFactory().next);
    const created = await repository.add({ name: 'A', point: TOKYO, origin: 'manual' });

    await repository.writeSelection('missing');
    await expect(repository.readSelection()).resolves.toBeNull();
    await repository.writeSelection(created.id);
    await expect(repository.readSelection()).resolves.toBe(created.id);
    await repository.writeSelection(null);
    await expect(repository.readSelection()).resolves.toBeNull();
  });

  it('clear で全消去', async () => {
    const repository = new InMemoryDestinationRepository(new FakeClock(), makeIdFactory().next);
    const created = await repository.add({ name: 'A', point: TOKYO, origin: 'manual' });
    await repository.writeSelection(created.id);
    await repository.clear();
    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.readSelection()).resolves.toBeNull();
  });

  it('不正な入力は保存しない（reject）', async () => {
    const repository = new InMemoryDestinationRepository(new FakeClock(), makeIdFactory().next);
    await expect(
      repository.add({ name: 'x', point: { latitude: 91, longitude: 0 }, origin: 'manual' }),
    ).rejects.toThrow('invalid destination input');
    await expect(repository.list()).resolves.toEqual([]);
  });
});

describe('InMemorySampleLogRepository', () => {
  it('append → list / load は古い順', async () => {
    const repository = new InMemorySampleLogRepository();
    await repository.append(makeSample(1));
    await repository.append(makeSample(2));
    const list = await repository.list();
    expect(list.map((entry) => entry.recordedAtEpochMs)).toEqual([1, 2]);
    await expect(repository.load()).resolves.toEqual(list);
  });

  it('容量を超えると古いものから落ちる（既定 300）', async () => {
    const repository = new InMemorySampleLogRepository();
    for (let index = 0; index < 305; index += 1) {
      await repository.append(makeSample(index));
    }
    const list = await repository.list();
    expect(list).toHaveLength(300);
    expect(list[0]?.recordedAtEpochMs).toBe(5);
    expect(list[299]?.recordedAtEpochMs).toBe(304);
  });

  it('カスタム容量でリングが動く', async () => {
    const repository = new InMemorySampleLogRepository(3);
    for (let index = 0; index < 5; index += 1) {
      await repository.append(makeSample(index));
    }
    const list = await repository.list();
    expect(list.map((entry) => entry.recordedAtEpochMs)).toEqual([2, 3, 4]);
  });

  it('flush は no-op・clear で空になる', async () => {
    const repository = new InMemorySampleLogRepository();
    await repository.append(makeSample(1));
    await expect(repository.flush()).resolves.toBeUndefined();
    await repository.clear();
    await expect(repository.list()).resolves.toEqual([]);
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Destination,
  DestinationInput,
  DestinationPatch,
} from '../../domain/types';
import { validateDestinationInput } from '../../domain/validation';
import type { Clock } from '../../ports/clock';
import type { DestinationRepository } from '../../ports/destinationRepository';
import { DESTINATIONS_STORAGE_KEY, quarantineKeyFor } from './storageKeys';
import {
  decodeDestinations,
  encodeDestinations,
  type DestinationStoreValue,
} from './codec';

/** 保存系の警告通知（実装詳細。UI 文言化は hooks / labels の責務）。 */
export type StorageWarningHandler = (message: string) => void;

/**
 * AsyncStorage 上の `DestinationRepository`（§4.5 / §10.2〜§10.4 / §11.3 #11,#12）。
 *
 * - 操作ごとに read-modify-write。**同一インスタンス内で Promise チェーンにより直列化**する。
 * - 破損時は生文字列を `yoridorimidori/quarantine/<key>/<epochMs>` に退避してから初期化する。
 * - 要素読み飛ばしは `onWarning` で通知する（件数付き）。
 * - 保存失敗は `onWarning` を呼んでから reject する（呼び出し側が捕捉してアプリ継続）。
 */
export class AsyncStorageDestinationRepository implements DestinationRepository {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly clock: Clock,
    private readonly idFactory: () => string,
    private readonly onWarning: StorageWarningHandler = () => undefined,
  ) {}

  list(): Promise<readonly Destination[]> {
    return this.enqueue(async () => {
      const store = await this.readStore();
      return store.items;
    });
  }

  add(input: DestinationInput): Promise<Destination> {
    return this.enqueue(async () => {
      const validated = validateDestinationInput(input);
      if (!validated.ok || validated.value === undefined) {
        throw new Error(`invalid destination input: ${validated.errorKey ?? 'unknown'}`);
      }
      const store = await this.readStore();
      const destination: Destination = {
        id: this.idFactory(),
        name: validated.value.name,
        point: validated.value.point,
        createdAtEpochMs: this.clock.nowEpochMs(),
        origin: input.origin,
        favorite: false,
        lastUsedAtEpochMs: null,
      };
      await this.writeStore({
        items: [...store.items, destination],
        selectedId: store.selectedId,
      });
      return destination;
    });
  }

  update(id: string, patch: DestinationPatch): Promise<Destination | null> {
    return this.enqueue(async () => {
      const store = await this.readStore();
      const index = store.items.findIndex((item) => item.id === id);
      const current = store.items[index];
      if (index < 0 || current === undefined) {
        return null;
      }
      const validated = validateDestinationInput({
        name: patch.name ?? current.name,
        point: patch.point ?? current.point,
      });
      if (!validated.ok || validated.value === undefined) {
        throw new Error(`invalid destination patch: ${validated.errorKey ?? 'unknown'}`);
      }
      const updated: Destination = {
        ...current,
        name: validated.value.name,
        point: validated.value.point,
      };
      const items = store.items.map((item, itemIndex) =>
        itemIndex === index ? updated : item,
      );
      await this.writeStore({ items, selectedId: store.selectedId });
      return updated;
    });
  }

  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const store = await this.readStore();
      const items = store.items.filter((item) => item.id !== id);
      const selectedId = store.selectedId === id ? null : store.selectedId;
      await this.writeStore({ items, selectedId });
    });
  }

  readSelection(): Promise<string | null> {
    return this.enqueue(async () => {
      const store = await this.readStore();
      return store.selectedId;
    });
  }

  writeSelection(id: string | null): Promise<void> {
    return this.enqueue(async () => {
      const store = await this.readStore();
      const exists = id !== null && store.items.some((item) => item.id === id);
      await this.writeStore({
        items: store.items,
        selectedId: exists ? id : null,
      });
    });
  }

  markUsed(id: string): Promise<void> {
    return this.enqueue(async () => {
      const store = await this.readStore();
      if (!store.items.some((item) => item.id === id)) {
        return; // 存在しない id は無視する
      }
      const usedAtEpochMs = this.clock.nowEpochMs();
      const items = store.items.map((item) =>
        item.id === id ? { ...item, lastUsedAtEpochMs: usedAtEpochMs } : item,
      );
      await this.writeStore({ items, selectedId: store.selectedId });
    });
  }

  setFavorite(id: string, favorite: boolean): Promise<void> {
    return this.enqueue(async () => {
      const store = await this.readStore();
      if (!store.items.some((item) => item.id === id)) {
        return; // 存在しない id は無視する
      }
      const items = store.items.map((item) => (item.id === id ? { ...item, favorite } : item));
      await this.writeStore({ items, selectedId: store.selectedId });
    });
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      await AsyncStorage.removeItem(DESTINATIONS_STORAGE_KEY);
    });
  }

  /** 同一インスタンス内の read-modify-write を直列化する（§10.4）。 */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async readStore(): Promise<DestinationStoreValue> {
    const raw = await AsyncStorage.getItem(DESTINATIONS_STORAGE_KEY);
    if (raw === null) {
      return { items: [], selectedId: null };
    }
    const decoded = decodeDestinations(raw);
    if (!decoded.ok) {
      await this.quarantine(raw);
      this.onWarning(
        `保存済みの目的地データが壊れていたため初期化しました（理由: ${decoded.reason}）`,
      );
      return { items: [], selectedId: null };
    }
    if (decoded.droppedCount > 0) {
      this.onWarning(
        `保存済み目的地のうち ${decoded.droppedCount} 件を読み飛ばしました`,
      );
    }
    return decoded.value;
  }

  private async writeStore(store: DestinationStoreValue): Promise<void> {
    try {
      await AsyncStorage.setItem(
        DESTINATIONS_STORAGE_KEY,
        encodeDestinations(store.items, store.selectedId),
      );
    } catch (error) {
      this.onWarning('目的地の保存に失敗しました');
      throw error;
    }
  }

  /** 破損した生文字列を 1 件だけ退避する（退避失敗は無視して初期化を優先）。 */
  private async quarantine(raw: string): Promise<void> {
    try {
      await AsyncStorage.setItem(
        quarantineKeyFor(DESTINATIONS_STORAGE_KEY, this.clock.nowEpochMs()),
        raw,
      );
    } catch {
      // 退避できなくてもアプリは継続する（§10.2）
    }
  }
}

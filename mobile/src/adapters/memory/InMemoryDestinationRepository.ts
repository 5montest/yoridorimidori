import type { Clock } from '../../ports/clock';
import type { DestinationRepository } from '../../ports/destinationRepository';
import type {
  Destination,
  DestinationInput,
  DestinationPatch,
} from '../../domain/types';
import { validateDestinationInput } from '../../domain/validation';

/**
 * メモリ内の `DestinationRepository`（§4.5 / §10.4。テスト・開発用）。
 *
 * - ID と作成時刻は**注入した `idFactory` と `Clock`** から決める（決定論・テスト容易性）。
 * - 入力は保存前に `validateDestinationInput()` で再検証する（不正は保存せず reject）。
 * - 選択中の目的地が削除されたら選択も解除する。
 */
export class InMemoryDestinationRepository implements DestinationRepository {
  private items: readonly Destination[] = [];
  private selectedId: string | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly idFactory: () => string,
  ) {}

  list(): Promise<readonly Destination[]> {
    return Promise.resolve([...this.items]);
  }

  add(input: DestinationInput): Promise<Destination> {
    const validated = validateDestinationInput(input);
    if (!validated.ok || validated.value === undefined) {
      return Promise.reject(
        new Error(`invalid destination input: ${validated.errorKey ?? 'unknown'}`),
      );
    }
    const destination: Destination = {
      id: this.idFactory(),
      name: validated.value.name,
      point: validated.value.point,
      createdAtEpochMs: this.clock.nowEpochMs(),
      origin: input.origin,
      favorite: false,
      lastUsedAtEpochMs: null,
    };
    this.items = [...this.items, destination];
    return Promise.resolve(destination);
  }

  update(id: string, patch: DestinationPatch): Promise<Destination | null> {
    const index = this.items.findIndex((item) => item.id === id);
    const current = this.items[index];
    if (index < 0 || current === undefined) {
      return Promise.resolve(null); // 存在しない id
    }
    const validated = validateDestinationInput({
      name: patch.name ?? current.name,
      point: patch.point ?? current.point,
    });
    if (!validated.ok || validated.value === undefined) {
      return Promise.reject(
        new Error(`invalid destination patch: ${validated.errorKey ?? 'unknown'}`),
      );
    }
    const updated: Destination = {
      ...current,
      name: validated.value.name,
      point: validated.value.point,
    };
    this.items = this.items.map((item, itemIndex) => (itemIndex === index ? updated : item));
    return Promise.resolve(updated);
  }

  remove(id: string): Promise<void> {
    this.items = this.items.filter((item) => item.id !== id);
    if (this.selectedId === id) {
      this.selectedId = null; // 選択中が消えたら解除
    }
    return Promise.resolve();
  }

  readSelection(): Promise<string | null> {
    return Promise.resolve(this.selectedId);
  }

  writeSelection(id: string | null): Promise<void> {
    // 存在しない id は保存しない（null 扱い）
    this.selectedId =
      id !== null && this.items.some((item) => item.id === id) ? id : null;
    return Promise.resolve();
  }

  markUsed(id: string): Promise<void> {
    const usedAtEpochMs = this.clock.nowEpochMs();
    this.items = this.items.map((item) =>
      item.id === id ? { ...item, lastUsedAtEpochMs: usedAtEpochMs } : item,
    );
    return Promise.resolve();
  }

  setFavorite(id: string, favorite: boolean): Promise<void> {
    this.items = this.items.map((item) => (item.id === id ? { ...item, favorite } : item));
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.items = [];
    this.selectedId = null;
    return Promise.resolve();
  }
}

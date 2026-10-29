import { DEFAULT_THRESHOLDS } from '../../domain/constants';
import { ringPush } from '../../domain/ringBuffer';
import type { SampleLogEntry } from '../../domain/types';
import type { SampleLogRepository } from '../../ports/sampleLogRepository';

/**
 * メモリ内の `SampleLogRepository`（§4.6 / §10.4。テスト・開発用）。
 *
 * - リングバッファ（既定 300 件）。上限超過時は最も古いものから捨てる（追加順 = 時系列順）。
 * - 書込デバウンスは持たない（メモリ内なので即時）。
 */
export class InMemorySampleLogRepository implements SampleLogRepository {
  private items: readonly SampleLogEntry[] = [];

  constructor(private readonly capacity: number = DEFAULT_THRESHOLDS.sampleLogCapacity) {}

  load(): Promise<readonly SampleLogEntry[]> {
    return Promise.resolve([...this.items]);
  }

  append(entry: SampleLogEntry): Promise<void> {
    this.items = ringPush(this.items, entry, this.capacity);
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve(); // メモリ内なので保留なし
  }

  list(): Promise<readonly SampleLogEntry[]> {
    return Promise.resolve([...this.items]);
  }

  clear(): Promise<void> {
    this.items = [];
    return Promise.resolve();
  }
}

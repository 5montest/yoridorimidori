import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_THRESHOLDS } from '../../domain/constants';
import { ringPush } from '../../domain/ringBuffer';
import type { SampleLogEntry } from '../../domain/types';
import type { Clock } from '../../ports/clock';
import type { SampleLogRepository } from '../../ports/sampleLogRepository';
import {
  SAMPLES_CHAR_BUDGET,
  decodeSamples,
  encodeSamples,
  trimSamplesToCharBudget,
} from './codec';
import { SAMPLES_STORAGE_KEY, quarantineKeyFor } from './storageKeys';
import type { StorageWarningHandler } from './AsyncStorageDestinationRepository';

/** 書込デバウンス（ms）。§10.4 / ADR-09。 */
export const SAMPLE_WRITE_DEBOUNCE_MS = 5_000;
/** まとめ書きの件数しきい値。§10.4。 */
export const SAMPLE_WRITE_BATCH_SIZE = 20;

/**
 * AsyncStorage 上の `SampleLogRepository`（§4.6 / §10.2〜§10.5）。
 *
 * - メモリ上のリングに即時追加し、**5 秒または 20 件**のいずれかでまとめて `setItem` する。
 * - 5 秒判定は注入された `Clock.nowEpochMs()` の比較で行う（**`setTimeout` を使わない**。§12.4）。
 * - `flush()` は保留分を即時書き込む。
 * - 破損時は退避 → 初期化。保存失敗は `onWarning` + reject（呼び出し側が捕捉）。
 * - 文字列長が 200,000 を超える場合は最新 150 件に縮めて再試行する（§10.5）。
 */
export class AsyncStorageSampleLogRepository implements SampleLogRepository {
  private items: readonly SampleLogEntry[] = [];
  private loaded = false;
  private loadInFlight: Promise<void> | null = null;
  private pendingCount = 0;
  private pendingSinceEpochMs: number | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly onWarning: StorageWarningHandler = () => undefined,
    private readonly capacity: number = DEFAULT_THRESHOLDS.sampleLogCapacity,
  ) {}

  async load(): Promise<readonly SampleLogEntry[]> {
    await this.ensureLoaded();
    return [...this.items];
  }

  async append(entry: SampleLogEntry): Promise<void> {
    await this.ensureLoaded();
    this.items = ringPush(this.items, entry, this.capacity);
    this.pendingCount += 1;
    if (this.pendingSinceEpochMs === null) {
      this.pendingSinceEpochMs = this.clock.nowEpochMs();
    }
    const elapsedMs = this.clock.nowEpochMs() - this.pendingSinceEpochMs;
    if (this.pendingCount >= SAMPLE_WRITE_BATCH_SIZE || elapsedMs >= SAMPLE_WRITE_DEBOUNCE_MS) {
      await this.write();
    }
  }

  async flush(): Promise<void> {
    await this.ensureLoaded();
    if (this.pendingCount > 0) {
      await this.write();
    }
  }

  async list(): Promise<readonly SampleLogEntry[]> {
    await this.ensureLoaded();
    return [...this.items];
  }

  async clear(): Promise<void> {
    this.items = [];
    this.pendingCount = 0;
    this.pendingSinceEpochMs = null;
    this.loaded = true;
    this.loadInFlight = null;
    await AsyncStorage.removeItem(SAMPLES_STORAGE_KEY);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    if (this.loadInFlight === null) {
      this.loadInFlight = this.loadFromStorage();
    }
    await this.loadInFlight;
  }

  private async loadFromStorage(): Promise<void> {
    const raw = await AsyncStorage.getItem(SAMPLES_STORAGE_KEY);
    if (raw === null) {
      this.items = [];
      this.loaded = true;
      return;
    }
    const decoded = decodeSamples(raw, this.capacity);
    if (!decoded.ok) {
      await this.quarantine(raw);
      this.onWarning(`保存済みのサンプルデータが壊れていたため初期化しました（理由: ${decoded.reason}）`);
      this.items = [];
    } else {
      if (decoded.droppedCount > 0) {
        this.onWarning(`保存済みサンプルのうち ${decoded.droppedCount} 件を読み飛ばしました`);
      }
      this.items = decoded.value.items;
    }
    this.loaded = true;
  }

  private async write(): Promise<void> {
    try {
      await AsyncStorage.setItem(SAMPLES_STORAGE_KEY, this.encodeWithinBudget());
      this.pendingCount = 0;
      this.pendingSinceEpochMs = null;
    } catch (error) {
      this.onWarning('サンプルの保存に失敗しました');
      throw error;
    }
  }

  /** 文字数予算を超える場合は最新 150 件に縮めてから JSON 化する（§10.5）。 */
  private encodeWithinBudget(): string {
    const raw = encodeSamples(this.items);
    if (raw.length <= SAMPLES_CHAR_BUDGET) {
      return raw;
    }
    this.items = trimSamplesToCharBudget(this.items, SAMPLES_CHAR_BUDGET);
    return encodeSamples(this.items);
  }

  private async quarantine(raw: string): Promise<void> {
    try {
      await AsyncStorage.setItem(
        quarantineKeyFor(SAMPLES_STORAGE_KEY, this.clock.nowEpochMs()),
        raw,
      );
    } catch {
      // 退避できなくてもアプリは継続する（§10.2）
    }
  }
}

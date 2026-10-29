import type { Clock } from '../../ports/clock';

/** `FakeClock` の既定 epoch（2023-11-14T22:13:20Z 相当のダミー値）。 */
const DEFAULT_EPOCH_MS = 1_700_000_000_000;

/**
 * テスト・シナリオ再生用の決定的な `Clock` 実装（§5.4 / §8.2）。
 *
 * - **タイマーを使わない**。テストが `advance(ms)` を明示的に呼んで時間を進める
 *   （`jest.useFakeTimers()` を使用しない方針に適合。§12.4）。
 * - `nowMonotonicMs()` と `nowEpochMs()` は同じ量だけ進む（実環境の近似）。
 * - `setEpoch(ms)` で壁時計のみ巻き戻せる（E-11 の検証用）。
 */
export class FakeClock implements Clock {
  private monotonicMs: number;
  private epochMs: number;

  constructor(initialMonotonicMs = 0, initialEpochMs = DEFAULT_EPOCH_MS) {
    this.monotonicMs = Number.isFinite(initialMonotonicMs) ? initialMonotonicMs : 0;
    this.epochMs = Number.isFinite(initialEpochMs) ? initialEpochMs : DEFAULT_EPOCH_MS;
  }

  nowMonotonicMs(): number {
    return this.monotonicMs;
  }

  nowEpochMs(): number {
    return this.epochMs;
  }

  /** 時間を進める。負値・非有限は無視する（防御。時間は巻き戻さない）。 */
  advance(byMs: number): void {
    if (!Number.isFinite(byMs) || byMs <= 0) {
      return;
    }
    this.monotonicMs += byMs;
    this.epochMs += byMs;
  }

  /** 壁時計（epoch）だけを設定する。単調時計は変えない。 */
  setEpoch(epochMs: number): void {
    if (!Number.isFinite(epochMs)) {
      return;
    }
    this.epochMs = epochMs;
  }
}

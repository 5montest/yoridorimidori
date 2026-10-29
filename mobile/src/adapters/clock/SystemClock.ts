import type { Clock } from '../../ports/clock';

/** `performance.now()` 相当の関数。 */
export type PerfNowFn = () => number;

export interface SystemClockOptions {
  /** `performance.now()` 相当。`null` を渡すと `Date.now()` フォールバックを強制する（テスト用）。 */
  readonly perfNow?: PerfNowFn | null;
  /** 壁時計。省略時は `Date.now`。 */
  readonly epochNow?: () => number;
}

/**
 * 端末の `Clock` 実装（§5.4）。鮮度計算の基準となる単調時計を提供する。
 *
 * - `nowMonotonicMs()`: `performance.now()` が使えれば使い（起動時に 1 度だけ機能検出）、
 *   無ければ `Date.now()` を使い、**内部保持の前回値との max()** で単調性を保証する
 *   （壁時計が NTP 等で巻き戻っても鮮度計算が壊れない）。
 * - `nowEpochMs()`: 壁時計（ログ用。鮮度計算には使わない）。
 * - ⚠️ §18-4: RN 上での `performance.now()` の有無は未確認のため、機能検出でフォールバックする。
 */
export class SystemClock implements Clock {
  private readonly perfNow: PerfNowFn | null;
  private readonly epochNow: () => number;
  private lastMonotonicMs = 0;

  constructor(options: SystemClockOptions = {}) {
    this.perfNow = options.perfNow === undefined ? detectPerfNow() : options.perfNow;
    this.epochNow = options.epochNow ?? (() => Date.now());
  }

  nowMonotonicMs(): number {
    const raw = this.perfNow === null ? this.epochNow() : this.perfNow();
    if (!Number.isFinite(raw)) {
      return this.lastMonotonicMs; // 異常値でデータモデルを汚さない（防御）
    }
    const value = raw > this.lastMonotonicMs ? raw : this.lastMonotonicMs;
    this.lastMonotonicMs = value;
    return value;
  }

  nowEpochMs(): number {
    return this.epochNow();
  }
}

/** `performance.now()` を機能検出する（1 度だけ呼ぶ）。存在しなければ `null`。 */
function detectPerfNow(): PerfNowFn | null {
  const candidate: unknown = globalThis.performance;
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }
  const perf = candidate as { readonly now?: unknown };
  const now = perf.now;
  if (typeof now !== 'function') {
    return null;
  }
  return () => (now as PerfNowFn).call(candidate);
}

import { normalizeDegrees360 } from './normalize';
import type { SignalMode, SignalReason } from './signalQuality';
import type { HeadingFix, HeadingReference } from './types';

/** 方位フィルタの設定（仮説値。実測ログで調整する）。 */
export interface HeadingFilterConfig {
  /** 平滑化の時定数（ms）。小さいほど追従が速く、大きいほど滑らか。 */
  readonly smoothingTauMs: number;
  /** 一時保持を許す最大時間（ms）。超えたら unavailable。 */
  readonly maxHoldMs: number;
  /** 外れ値判定の窓（ms）。前回採用からこの時間内の大ジャンプを疑う。 */
  readonly jumpWindowMs: number;
  /** 外れ値とみなす角度差（度）。 */
  readonly jumpThresholdDeg: number;
  /** 同じ新しい向きが連続したら実回転として採用する回数。 */
  readonly recoverySamples: number;
  /** 前回採用からこの時間以上空いたら平滑化をやり直す（ms）。 */
  readonly reinitGapMs: number;
}

export const DEFAULT_HEADING_FILTER_CONFIG: HeadingFilterConfig = {
  smoothingTauMs: 500,
  maxHoldMs: 3_000,
  jumpWindowMs: 800,
  jumpThresholdDeg: 45,
  recoverySamples: 3,
  reinitGapMs: 3_000,
};

/** フィルタの内部状態（純粋。ref に保持して受け渡す）。 */
export interface HeadingFilterState {
  readonly lastAcceptedDeg: number | null;
  readonly lastAcceptedAtMonotonicMs: number | null;
  readonly lastReference: HeadingReference | null;
  /** 連続して妥当と判断した回数（unavailable からの復帰ヒステリシス用）。 */
  readonly consecutiveGood: number;
  /** 新しい向きの候補が連続した回数（実回転の検出用）。 */
  readonly candidateCount: number;
  readonly candidateDeg: number | null;
  readonly mode: SignalMode;
}

export function createHeadingFilterState(): HeadingFilterState {
  return {
    lastAcceptedDeg: null,
    lastAcceptedAtMonotonicMs: null,
    lastReference: null,
    consecutiveGood: 0,
    candidateCount: 0,
    candidateDeg: null,
    mode: 'normal',
  };
}

export interface HeadingFilterInput {
  readonly reading: HeadingFix;
  readonly nowMonotonicMs: number;
  readonly config?: HeadingFilterConfig;
}

export interface HeadingFilterResult {
  readonly state: HeadingFilterState;
  /** 表示に使える平滑化後の角度（保持中は前回採用値、不明は null）。 */
  readonly valueDeg: number | null;
  readonly mode: SignalMode;
  readonly decision: 'accepted' | 'smoothed' | 'held' | 'rejected';
  readonly reason: SignalReason | null;
  /** 採用した場合のフィックス（平滑化済み）。保持・棄却時は null。 */
  readonly acceptedFix: HeadingFix | null;
}

/**
 * 方位サンプルを平滑化・異常抑制する純粋関数（2026-11-01）。
 *
 * - **円周上の平滑化**（0°/360° をまたいでも連続）: 前回採用値からの差を最短角で取り、
 *   経過時間に応じた指数移動平均（`1 - exp(-dt/tau)`）で更新する。
 * - **大ジャンプの一時保持**: 前回採用から `jumpWindowMs` 以内の `jumpThresholdDeg` 超の変化は
 *   外れ値として保持する。ただし同じ新しい向きが `recoverySamples` 回続いたら実回転として採用する。
 * - **低精度の保持**: 精度 0/1/null は採用せず、`maxHoldMs` まで前回値を保持し、超えたら unavailable。
 * - **基準変更で再初期化**: 真北⇔磁北が変わったら平滑化をやり直す（補正なしで混ぜない）。
 * - **ヒステリシス**: unavailable から normal へは `recoverySamples` 回の連続妥当で戻る。
 * - 保持中は `lastAcceptedAtMonotonicMs` を更新しない（古い値を新しい観測として扱わない）。
 */
export function filterHeadingSample(
  state: HeadingFilterState,
  input: HeadingFilterInput,
): HeadingFilterResult {
  const config = input.config ?? DEFAULT_HEADING_FILTER_CONFIG;
  const { reading, nowMonotonicMs } = input;
  const candidate = reading.headingDeg;

  const held = (reason: SignalReason, mode: SignalMode): HeadingFilterResult => ({
    state: { ...state, mode },
    valueDeg: state.lastAcceptedDeg,
    mode,
    decision: mode === 'unavailable' ? 'rejected' : 'held',
    reason,
    acceptedFix: null,
  });

  // 1) 値・精度の妥当性
  const accuracyOk =
    candidate !== null &&
    reading.accuracy !== null &&
    reading.accuracy >= 2; // 2=中 / 3=高 のみ採用（0=未校正, 1=低 は保持）
  if (candidate === null || !accuracyOk) {
    const heldTooLong =
      state.lastAcceptedAtMonotonicMs === null ||
      nowMonotonicMs - state.lastAcceptedAtMonotonicMs > config.maxHoldMs;
    if (heldTooLong) {
      return {
        state: { ...state, mode: 'unavailable', consecutiveGood: 0 },
        valueDeg: null,
        mode: 'unavailable',
        decision: 'rejected',
        reason: candidate === null ? 'heading-lost' : 'heading-low-accuracy',
        acceptedFix: null,
      };
    }
    return held('heading-low-accuracy', 'transient');
  }

  // 2) 基準の変更（真北⇔磁北）→ 平滑化をやり直す
  if (state.lastReference !== null && state.lastReference !== reading.reference) {
    const value = normalizeDegrees360(candidate);
    return {
      state: {
        lastAcceptedDeg: value,
        lastAcceptedAtMonotonicMs: nowMonotonicMs,
        lastReference: reading.reference,
        consecutiveGood: state.consecutiveGood + 1,
        candidateCount: 0,
        candidateDeg: null,
        mode: 'normal',
      },
      valueDeg: value,
      mode: 'normal',
      decision: 'accepted',
      reason: 'reference-changed',
      acceptedFix: { ...reading, headingDeg: value },
    };
  }

  // 3) 前回採用が無い・時間が空いた → そのまま採用（平滑化の初期化）
  const lastDeg = state.lastAcceptedDeg;
  const lastAt = state.lastAcceptedAtMonotonicMs;
  if (lastDeg === null || lastAt === null || nowMonotonicMs - lastAt > config.reinitGapMs) {
    const value = normalizeDegrees360(candidate);
    return {
      state: {
        lastAcceptedDeg: value,
        lastAcceptedAtMonotonicMs: nowMonotonicMs,
        lastReference: reading.reference,
        consecutiveGood: state.consecutiveGood + 1,
        candidateCount: 0,
        candidateDeg: null,
        mode: state.mode === 'unavailable' ? state.mode : 'normal',
      },
      valueDeg: value,
      mode: state.mode,
      decision: 'accepted',
      reason: state.mode === 'unavailable' ? 'recovering' : null,
      acceptedFix: { ...reading, headingDeg: value },
    };
  }

  const dtMs = Math.max(0, nowMonotonicMs - lastAt);
  const delta = shortestAngleDelta(candidate, lastDeg);

  // 4) 大ジャンプ（外れ値）の疑い
  if (Math.abs(delta) > config.jumpThresholdDeg && dtMs < config.jumpWindowMs) {
    const sameCandidate =
      state.candidateDeg !== null &&
      Math.abs(shortestAngleDelta(candidate, state.candidateDeg)) <= 10;
    const candidateCount = sameCandidate ? state.candidateCount + 1 : 1;
    const candidateDeg = sameCandidate ? state.candidateDeg : candidate;

    if (candidateCount >= config.recoverySamples) {
      // 同じ新しい向きが続いた → 実際に回転したとみなして採用
      const value = normalizeDegrees360(candidate);
      return {
        state: {
          lastAcceptedDeg: value,
          lastAcceptedAtMonotonicMs: nowMonotonicMs,
          lastReference: reading.reference,
          consecutiveGood: state.consecutiveGood + 1,
          candidateCount: 0,
          candidateDeg: null,
          mode: 'normal',
        },
        valueDeg: value,
        mode: 'normal',
        decision: 'accepted',
        reason: null,
        acceptedFix: { ...reading, headingDeg: value },
      };
    }

    return {
      state: {
        ...state,
        candidateCount,
        candidateDeg,
        mode: 'transient',
      },
      valueDeg: lastDeg,
      mode: 'transient',
      decision: 'held',
      reason: 'heading-outlier',
      acceptedFix: null,
    };
  }

  // 5) 通常の平滑化（円周対応の指数移動平均）
  const alpha = 1 - Math.exp(-dtMs / config.smoothingTauMs);
  const smoothed = normalizeDegrees360(lastDeg + delta * alpha);
  const recovered = state.mode === 'unavailable';
  const consecutiveGood = state.consecutiveGood + 1;
  const mode: SignalMode =
    recovered && consecutiveGood < config.recoverySamples ? 'unavailable' : 'normal';

  return {
    state: {
      lastAcceptedDeg: smoothed,
      lastAcceptedAtMonotonicMs: nowMonotonicMs,
      lastReference: reading.reference,
      consecutiveGood,
      candidateCount: 0,
      candidateDeg: null,
      mode,
    },
    valueDeg: smoothed,
    mode,
    decision: alpha >= 0.999 ? 'accepted' : 'smoothed',
    reason: recovered && mode === 'unavailable' ? 'recovering' : null,
    acceptedFix: { ...reading, headingDeg: smoothed },
  };
}

/** `to - from` を (-180, 180] の最短角差にする。 */
export function shortestAngleDelta(to: number, from: number): number {
  const diff = normalizeDegrees360(to - from);
  return diff > 180 ? diff - 360 : diff;
}

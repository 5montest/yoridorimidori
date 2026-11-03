import { haversineDistanceM } from './distance';
import type { SignalMode, SignalReason } from './signalQuality';
import type { SensorFix } from './types';

/** 位置フィルタの設定（仮説値。実測ログで調整する）。 */
export interface LocationFilterConfig {
  /** 精度がこの値（m）を超える測位は保持する。 */
  readonly poorAccuracyM: number;
  /** ジャンプ判定の絶対上限（m）。 */
  readonly maxJumpM: number;
  /** ジャンプ判定の係数（前回精度 + 今回精度）× 係数。 */
  readonly jumpFactor: number;
  /** 同じ新しい位置が連続したら実移動として採用する回数。 */
  readonly recoverySamples: number;
  /** 平滑化: 移動がこの係数×精度 未満なら前回位置を維持する。 */
  readonly smoothingRatio: number;
  /**
   * 想定する最大移動速度（m/s）。GPS 途絶後の再取得を許容する時間ベースの
   * ジャンプ許容量と、移動しながらの復帰判定に使う（電車を想定して 90m/s ≒ 324km/h）。
   */
  readonly maxPlausibleSpeedMps: number;
  /** 移動しながらの復帰判定で許容する距離の係数（速度 × 経過秒 × 係数）。 */
  readonly candidateToleranceFactor: number;
}

export const DEFAULT_LOCATION_FILTER_CONFIG: LocationFilterConfig = {
  poorAccuracyM: 30,
  maxJumpM: 200,
  jumpFactor: 4,
  recoverySamples: 2,
  smoothingRatio: 0.5,
  maxPlausibleSpeedMps: 90,
  candidateToleranceFactor: 1.5,
};

/** フィルタの内部状態（純粋。ref に保持して受け渡す）。 */
export interface LocationFilterState {
  readonly lastAccepted: SensorFix | null;
  readonly consecutiveRejected: number;
  readonly candidatePoint: SensorFix['point'] | null;
  /** 直前の「棄却候補」を受け取った時刻（移動しながらの復帰判定用）。 */
  readonly candidateAtMonotonicMs: number | null;
  readonly mode: SignalMode;
}

export function createLocationFilterState(): LocationFilterState {
  return {
    lastAccepted: null,
    consecutiveRejected: 0,
    candidatePoint: null,
    candidateAtMonotonicMs: null,
    mode: 'normal',
  };
}

export interface LocationFilterInput {
  readonly reading: SensorFix;
  readonly nowMonotonicMs: number;
  readonly config?: LocationFilterConfig;
}

export interface LocationFilterResult {
  readonly state: LocationFilterState;
  readonly mode: SignalMode;
  readonly decision: 'accepted' | 'smoothed' | 'held' | 'rejected';
  readonly reason: SignalReason | null;
  /** 採用した場合のフィックス（平滑化済み）。保持・棄却時は null。 */
  readonly acceptedFix: SensorFix | null;
}

/**
 * 位置サンプルを平滑化・異常抑制する純粋関数（2026-11-01）。
 *
 * - **低精度の保持**: 精度 `poorAccuracyM` 超は採用せず、前回値を保持する（初回は unavailable）。
 * - **位置飛びの棄却**: 前回位置から `max(maxJumpM, (前回精度 + 今回精度) × jumpFactor)` を超える
 *   移動は一時保持。同じ新しい位置が `recoverySamples` 回続いたら実移動として採用する
 *   （**速度による一律判定はしない**。電車移動もあり得るため）。
 * - **微小移動の平滑化**: 移動が `精度 × smoothingRatio` 未満なら前回位置を維持しつつ、
 *   受信時刻・精度は新しい値で更新する（同じ場所にいることの確認）。
 * - 保持中は前回の位置を新しい観測として扱わない（返す `acceptedFix` は null）。
 */
export function filterLocationSample(
  state: LocationFilterState,
  input: LocationFilterInput,
): LocationFilterResult {
  const config = input.config ?? DEFAULT_LOCATION_FILTER_CONFIG;
  const { reading, nowMonotonicMs } = input;
  const accuracy = reading.accuracyM;

  const hold = (reason: SignalReason, mode: SignalMode): LocationFilterResult => ({
    state: { ...state, mode },
    mode,
    decision: mode === 'unavailable' ? 'rejected' : 'held',
    reason,
    acceptedFix: null,
  });

  // 1) 精度が悪い測位は採用しない
  if (accuracy === null || accuracy > config.poorAccuracyM) {
    if (state.lastAccepted === null) {
      return {
        state: { ...state, mode: 'unavailable' },
        mode: 'unavailable',
        decision: 'rejected',
        reason: 'location-poor-accuracy',
        acceptedFix: null,
      };
    }
    return hold('location-poor-accuracy', 'transient');
  }

  const previous = state.lastAccepted;
  if (previous === null) {
    return {
      state: {
        lastAccepted: reading,
        consecutiveRejected: 0,
        candidatePoint: null,
        candidateAtMonotonicMs: null,
        mode: 'normal',
      },
      mode: 'normal',
      decision: 'accepted',
      reason: null,
      acceptedFix: reading,
    };
  }

  const previousAccuracy = previous.accuracyM ?? accuracy;
  const jump = haversineDistanceM(previous.point, reading.point);

  // 前回採用からの経過時間を考慮したジャンプ許容量（2026-11-03）。
  // GPS 途絶中に電車等で移動している可能性があるため、「最大想定速度 × 経過秒」までは
  // 実移動として受け入れる。短時間の大きな飛びは従来どおり保持する。
  const gapMs = Math.max(0, nowMonotonicMs - previous.receivedAtMonotonicMs);
  const timeBasedAllowance = (gapMs / 1_000) * config.maxPlausibleSpeedMps;
  const allowedJump = Math.max(
    config.maxJumpM,
    (previousAccuracy + accuracy) * config.jumpFactor,
    timeBasedAllowance + accuracy * 2,
  );

  // 2) 位置飛びの疑い
  if (jump !== null && jump > allowedJump) {
    // 直前の棄却候補との距離で「移動しながらの復帰」を判定する（2026-11-03）。
    // 同一地点に留まる誤測位だけでなく、電車のように毎回移動する位置も、
    // 想定速度の範囲内で整合していれば実移動として採用できるようにする。
    const candidateGapMs =
      state.candidateAtMonotonicMs === null
        ? 0
        : Math.max(0, nowMonotonicMs - state.candidateAtMonotonicMs);
    const candidateTolerance = Math.max(
      accuracy * 2,
      (candidateGapMs / 1_000) * config.maxPlausibleSpeedMps * config.candidateToleranceFactor,
      10,
    );
    const candidateDistance =
      state.candidatePoint === null
        ? null
        : haversineDistanceM(state.candidatePoint, reading.point);
    const sameCandidate = candidateDistance !== null && candidateDistance <= candidateTolerance;
    const consecutiveRejected = sameCandidate ? state.consecutiveRejected + 1 : 1;

    if (consecutiveRejected >= config.recoverySamples) {
      // 整合する新しい位置が続いた → 実移動として採用
      return {
        state: {
          lastAccepted: reading,
          consecutiveRejected: 0,
          candidatePoint: null,
          candidateAtMonotonicMs: null,
          mode: 'normal',
        },
        mode: 'normal',
        decision: 'accepted',
        reason: null,
        acceptedFix: reading,
      };
    }

    return {
      state: {
        ...state,
        consecutiveRejected,
        // 候補は毎回最新の棄却サンプルに更新する（移動しながらの復帰判定用）。
        candidatePoint: reading.point,
        candidateAtMonotonicMs: nowMonotonicMs,
        mode: 'transient',
      },
      mode: 'transient',
      decision: 'held',
      reason: 'location-jump',
      acceptedFix: null,
    };
  }

  // 3) 微小移動は前回位置を維持（受信時刻・精度は更新して「新しく確認できた」ことを示す）
  const smoothingThreshold = accuracy * config.smoothingRatio;
  if (jump !== null && jump < smoothingThreshold) {
    const smoothed: SensorFix = {
      ...reading,
      point: previous.point,
      receivedAtMonotonicMs: nowMonotonicMs,
    };
    return {
      state: {
        lastAccepted: smoothed,
        consecutiveRejected: 0,
        candidatePoint: null,
        candidateAtMonotonicMs: null,
        mode: 'normal',
      },
      mode: 'normal',
      decision: 'smoothed',
      reason: null,
      acceptedFix: smoothed,
    };
  }

  // 4) 通常の採用
  return {
    state: {
      lastAccepted: reading,
      consecutiveRejected: 0,
      candidatePoint: null,
      candidateAtMonotonicMs: null,
      mode: 'normal',
    },
    mode: 'normal',
    decision: 'accepted',
    reason: null,
    acceptedFix: reading,
  };
}

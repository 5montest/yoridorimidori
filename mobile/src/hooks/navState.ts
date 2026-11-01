import type { Thresholds } from '../domain/constants';
import {
  INITIAL_SIGNAL_QUALITY_STATE,
  type SignalQuality,
  type SignalQualityState,
} from '../domain/signalQuality';

/** 信号品質の判断履歴（開発メニュー表示用。最新が末尾）。 */
export interface SignalQualityLogEntry {
  readonly atMonotonicMs: number;
  readonly heading: SignalQuality;
  readonly location: SignalQuality;
}
import type { ScenarioId } from '../domain/scenario';
import type {
  Destination,
  HeadingFix,
  SampleLogEntry,
  SensorFix,
} from '../domain/types';
import type { PermissionOutcome, ProviderError } from '../ports/common';

/**
 * アプリ全体の状態（永続化対象ではない「実行時の状態」）。§7.1。
 *
 * - domain の表示用派生値（`NavState`）はここに持たない。`selectNavState`（selectors.ts）が
 *   入力から合成する（二重実装の禁止）。
 * - すべて `readonly`。リデューサ以外は書き換えない。
 */
export interface NavAppState {
  /** 起動時ロードが完了したか。 */
  readonly booted: boolean;
  readonly permission: PermissionOutcome | null;
  /** 方位プロバイダが利用不可と判明した（Web / エミュレータ等）。 */
  readonly headingUnavailable: boolean;
  readonly location: SensorFix | null;
  readonly heading: HeadingFix | null;
  /** 信号フィルタの状態（2026-11-01）。 */
  readonly signalQuality: SignalQualityState;
  /** 信号品質の判断履歴（最大 MAX_SIGNAL_LOG 件）。 */
  readonly signalLog: readonly SignalQualityLogEntry[];
  readonly destinations: readonly Destination[];
  readonly selectedDestinationId: string | null;
  /** Mock モード ON/OFF（開発ビルドのみ切替可）。 */
  readonly mockMode: boolean;
  readonly scenarioId: ScenarioId | null;
  /** 鮮度計算の基準時刻（tick / 新規フィックスで更新）。 */
  readonly nowMonotonicMs: number;
  readonly samples: readonly SampleLogEntry[];
  /** 直近のエラー（新しい順、最大 10 件）。 */
  readonly errors: readonly ProviderError[];
  /** 永続化の警告（保存失敗など。UI は控えめに表示）。 */
  readonly storageWarnings: readonly string[];
  readonly devToolsVisible: boolean;
  /** 起動時に注入された閾値（リデューサ・セレクタが参照。実行中は不変）。 */
  readonly thresholds: Thresholds;
}

/**
 * 起動時の初期状態。§7.1。
 *
 * `devToolsVisible` と `thresholds` は起動時に注入する（実行中は不変）。
 * 目的地・位置・方位・サンプル・エラーは空/null で始まり、`boot/completed` 等で埋まる。
 */
export function createInitialNavAppState(
  devToolsVisible: boolean,
  thresholds: Thresholds,
): NavAppState {
  return {
    booted: false,
    permission: null,
    headingUnavailable: false,
    location: null,
    heading: null,
    signalQuality: INITIAL_SIGNAL_QUALITY_STATE,
    signalLog: [],
    destinations: [],
    selectedDestinationId: null,
    mockMode: false,
    scenarioId: null,
    nowMonotonicMs: 0,
    samples: [],
    errors: [],
    storageWarnings: [],
    devToolsVisible,
    thresholds,
  };
}

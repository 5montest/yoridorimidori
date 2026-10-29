import type {
  GeoPoint,
  HeadingAccuracyLevel,
  HeadingReference,
} from '../domain/types';
import type { ScenarioId } from '../domain/scenario';
import type { Unsubscribe } from './common';

export type MockMode = 'manual' | 'scenario';

/** 開発画面に表示する Mock の現在値。 */
export interface MockSensorSnapshot {
  readonly mode: MockMode;
  readonly manualPoint: GeoPoint | null;
  readonly manualAccuracyM: number | null;
  readonly manualHeadingDeg: number | null;
  readonly manualHeadingAccuracy: HeadingAccuracyLevel | null;
  readonly manualHeadingReference: HeadingReference;
  readonly scenarioId: ScenarioId | null;
  /** シナリオ開始からの経過（時間加速適用後）。 */
  readonly scenarioElapsedMs: number;
  readonly timeScale: number;
  /** 現在位置サンプルが出ているか（GPS 欠損シナリオで false）。 */
  readonly locationPresent: boolean;
  /** 現在方位サンプルが出ているか（方位不明シナリオで false）。 */
  readonly headingPresent: boolean;
}

/**
 * Mock センサーの制御点。開発画面と MockLocationProvider / MockHeadingProvider が共有する。
 * 実装: MockSensorControllerImpl（adapters/mock）。
 *
 * 契約:
 *  - advance(byMs) は「時計を進める」唯一の入口。実アプリでは 100ms 間隔の
 *    ティッカー（アダプタ内部）が呼ぶ。Jest ではテストが明示的に呼ぶ（タイマー不使用）。
 *  - 購読者には snapshot の変更時のみ通知する（値が変わらなければ通知しない）。
 *  - Math.random() を使わない（決定論のため）。
 */
export interface MockSensorController {
  getSnapshot(): MockSensorSnapshot;
  subscribe(listener: (snapshot: MockSensorSnapshot) => void): Unsubscribe;

  setMode(mode: MockMode): void;
  setManualLocation(point: GeoPoint | null, accuracyM: number | null): void;
  setManualHeading(
    headingDeg: number | null,
    accuracy: HeadingAccuracyLevel | null,
    reference: HeadingReference,
  ): void;
  selectScenario(id: ScenarioId | null): void;
  setTimeScale(scale: 1 | 2 | 5 | 10): void;

  /** 時間を進める（シナリオ再生・手動モードのタイマー駆動）。 */
  advance(byMs: number): void;

  /** 手動値・シナリオ経過・モードを初期化する（Mock OFF 時など）。 */
  reset(): void;
}

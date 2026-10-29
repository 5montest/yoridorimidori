import { normalizeDegrees360 } from '../../domain/normalize';
import { SCENARIOS, sampleScenario, type Scenario, type ScenarioId } from '../../domain/scenario';
import type {
  GeoPoint,
  HeadingAccuracyLevel,
  HeadingReference,
} from '../../domain/types';
import { isValidGeoPoint } from '../../domain/validation';
import type { Unsubscribe } from '../../ports/common';
import type { MockMode, MockSensorController, MockSensorSnapshot } from '../../ports/mockSensor';

const DEFAULT_HEADING_REFERENCE: HeadingReference = 'true-north';

/**
 * Mock センサーの制御実装（§4.7 / §8.2）。
 *
 * - `advance(byMs)` が時間を進める唯一の入口（タイマー不使用・決定論）。
 * - 購読者には **snapshot が変化したときだけ** 通知する。
 * - シナリオは `scenarioElapsedMs`（時間加速適用後）で `sampleScenario` を引く。
 * - 手動モードの不正入力（NaN / 範囲外）は無視してデータモデルを汚さない。
 */
export class MockSensorControllerImpl implements MockSensorController {
  private mode: MockMode = 'manual';
  private manualPoint: GeoPoint | null = null;
  private manualAccuracyM: number | null = null;
  private manualHeadingDeg: number | null = null;
  private manualHeadingAccuracy: HeadingAccuracyLevel | null = null;
  private manualHeadingReference: HeadingReference = DEFAULT_HEADING_REFERENCE;
  private scenarioId: ScenarioId | null = null;
  private scenarioElapsedMs = 0;
  private timeScale: 1 | 2 | 5 | 10 = 1;
  private readonly listeners = new Set<(snapshot: MockSensorSnapshot) => void>();
  private snapshot: MockSensorSnapshot = this.buildSnapshot();

  getSnapshot(): MockSensorSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: MockSensorSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) {
        return; // 冪等
      }
      active = false;
      this.listeners.delete(listener);
    };
  }

  setMode(mode: MockMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.commit();
  }

  setManualLocation(point: GeoPoint | null, accuracyM: number | null): void {
    const nextPoint =
      point !== null && isValidGeoPoint(point)
        ? { latitude: point.latitude, longitude: point.longitude }
        : null;
    const nextAccuracyM =
      accuracyM !== null && Number.isFinite(accuracyM) && accuracyM >= 0 ? accuracyM : null;
    if (samePoint(this.manualPoint, nextPoint) && this.manualAccuracyM === nextAccuracyM) {
      return; // 変化なし → 通知しない
    }
    this.manualPoint = nextPoint;
    this.manualAccuracyM = nextAccuracyM;
    this.commit();
  }

  setManualHeading(
    headingDeg: number | null,
    accuracy: HeadingAccuracyLevel | null,
    reference: HeadingReference,
  ): void {
    const nextHeadingDeg =
      headingDeg !== null && Number.isFinite(headingDeg)
        ? normalizeDegrees360(headingDeg)
        : null;
    const nextAccuracy = isHeadingAccuracyLevel(accuracy) ? accuracy : null;
    const nextReference = isHeadingReference(reference) ? reference : 'unknown';
    if (
      this.manualHeadingDeg === nextHeadingDeg &&
      this.manualHeadingAccuracy === nextAccuracy &&
      this.manualHeadingReference === nextReference
    ) {
      return; // 変化なし → 通知しない
    }
    this.manualHeadingDeg = nextHeadingDeg;
    this.manualHeadingAccuracy = nextAccuracy;
    this.manualHeadingReference = nextReference;
    this.commit();
  }

  selectScenario(id: ScenarioId | null): void {
    const nextMode: MockMode = id === null ? 'manual' : 'scenario';
    if (this.mode === nextMode && this.scenarioId === id && this.scenarioElapsedMs === 0) {
      return;
    }
    this.mode = nextMode;
    this.scenarioId = id;
    this.scenarioElapsedMs = 0;
    this.commit();
  }

  setTimeScale(scale: 1 | 2 | 5 | 10): void {
    if (this.timeScale === scale) {
      return;
    }
    this.timeScale = scale;
    this.commit();
  }

  advance(byMs: number): void {
    if (!Number.isFinite(byMs) || byMs <= 0) {
      return; // 負値・非有限は状態を変えない（防御）
    }
    if (this.mode !== 'scenario') {
      return; // 手動モードではシナリオ時計を進めない
    }
    this.scenarioElapsedMs += byMs * this.timeScale;
    this.commit();
  }

  reset(): void {
    this.mode = 'manual';
    this.manualPoint = null;
    this.manualAccuracyM = null;
    this.manualHeadingDeg = null;
    this.manualHeadingAccuracy = null;
    this.manualHeadingReference = DEFAULT_HEADING_REFERENCE;
    this.scenarioId = null;
    this.scenarioElapsedMs = 0;
    this.timeScale = 1;
    this.commit();
  }

  private buildSnapshot(): MockSensorSnapshot {
    const scenario = this.findScenario();
    const sample = scenario === null ? null : sampleScenario(scenario, this.scenarioElapsedMs);
    const stalled =
      scenario !== null &&
      scenario.stallAfterMs !== null &&
      this.scenarioElapsedMs >= scenario.stallAfterMs;
    const scenarioActive = this.mode === 'scenario' && scenario !== null && !stalled;
    return {
      mode: this.mode,
      manualPoint: this.manualPoint,
      manualAccuracyM: this.manualAccuracyM,
      manualHeadingDeg: this.manualHeadingDeg,
      manualHeadingAccuracy: this.manualHeadingAccuracy,
      manualHeadingReference: this.manualHeadingReference,
      scenarioId: this.scenarioId,
      scenarioElapsedMs: this.scenarioElapsedMs,
      timeScale: this.timeScale,
      locationPresent:
        this.mode === 'manual'
          ? this.manualPoint !== null
          : scenarioActive && sample !== null && sample.location !== null,
      headingPresent:
        this.mode === 'manual'
          ? this.manualHeadingDeg !== null
          : scenarioActive && sample !== null && sample.heading.headingDeg !== null,
    };
  }

  private findScenario(): Scenario | null {
    if (this.scenarioId === null) {
      return null;
    }
    const id = this.scenarioId;
    return SCENARIOS.find((candidate) => candidate.id === id) ?? null;
  }

  /** snapshot を再計算し、変化があれば購読者へ通知する。 */
  private commit(): void {
    const next = this.buildSnapshot();
    if (sameSnapshot(this.snapshot, next)) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}

function sameSnapshot(a: MockSensorSnapshot, b: MockSensorSnapshot): boolean {
  return (
    a.mode === b.mode &&
    samePoint(a.manualPoint, b.manualPoint) &&
    a.manualAccuracyM === b.manualAccuracyM &&
    a.manualHeadingDeg === b.manualHeadingDeg &&
    a.manualHeadingAccuracy === b.manualHeadingAccuracy &&
    a.manualHeadingReference === b.manualHeadingReference &&
    a.scenarioId === b.scenarioId &&
    a.scenarioElapsedMs === b.scenarioElapsedMs &&
    a.timeScale === b.timeScale &&
    a.locationPresent === b.locationPresent &&
    a.headingPresent === b.headingPresent
  );
}

function samePoint(a: GeoPoint | null, b: GeoPoint | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

function isHeadingAccuracyLevel(value: HeadingAccuracyLevel | null): value is HeadingAccuracyLevel {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isHeadingReference(value: HeadingReference): value is HeadingReference {
  return value === 'true-north' || value === 'magnetic-north' || value === 'unknown';
}

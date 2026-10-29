import { SCENARIOS, sampleScenario } from '../../domain/scenario';
import type { GeoPoint, SensorFix } from '../../domain/types';
import type { Clock } from '../../ports/clock';
import type { PermissionOutcome, ProviderError, Unsubscribe } from '../../ports/common';
import type { LocationProvider } from '../../ports/location';
import type { MockSensorController, MockSensorSnapshot } from '../../ports/mockSensor';

const PERMISSION_GRANTED: PermissionOutcome = {
  status: 'granted',
  canAskAgain: true,
  androidAccuracy: 'fine',
};

/**
 * Mock 位置プロバイダ（§4.2 / §8.2）。`MockSensorController` の snapshot を `SensorFix` に変換する。
 *
 * - 権限は常に許可（Mock は権限と独立に動く → §11.2）。
 * - `source: 'mock'`、受信時刻は注入された `Clock` から付与する（鮮度計算は単調時計の差分）。
 * - **購読開始時に現在の snapshot を 1 回 emit する**（Mock ON 前に手動値が設定されている
 *   ケースでも即座に反映するため）。
 * - **手動モードでは「値が変わったときだけ」emit する**（位置と無関係な snapshot 変化＝
 *   方位だけの変更などで同じ位置を再通知しない）。`force`（購読直後）は常に emit。
 * - シナリオモードは従来どおり毎 commit emit する（鮮度更新・サンプル記録のため dedupe しない）。
 * - 位置サンプルが無い間（GPS 欠損・未設定・stall）は何も出さない。
 */
export class MockLocationProvider implements LocationProvider {
  readonly id = 'mock';

  private lastFix: SensorFix | null = null;
  private lastEmitted: LocationReading | null = null;

  constructor(
    private readonly controller: MockSensorController,
    private readonly clock: Clock,
  ) {}

  requestPermission(): Promise<PermissionOutcome> {
    return Promise.resolve({ ...PERMISSION_GRANTED });
  }

  getPermissionState(): Promise<PermissionOutcome> {
    return Promise.resolve({ ...PERMISSION_GRANTED });
  }

  start(
    onFix: (fix: SensorFix) => void,
    _onError: (error: ProviderError) => void,
  ): Promise<Unsubscribe> {
    const unsubscribe = this.controller.subscribe((snapshot) => {
      this.emitFromSnapshot(snapshot, onFix, false);
    });

    // 購読直後に現在の snapshot を 1 回 emit（"値を適用 → Mock ON" の順でも最新値が出る）。
    this.emitFromSnapshot(this.controller.getSnapshot(), onFix, true);

    let active = true;
    return Promise.resolve(() => {
      if (!active) {
        return; // 冪等
      }
      active = false;
      unsubscribe();
    });
  }

  getLastKnown(): Promise<SensorFix | null> {
    return Promise.resolve(this.lastFix);
  }

  private emitFromSnapshot(
    snapshot: MockSensorSnapshot,
    onFix: (fix: SensorFix) => void,
    force: boolean,
  ): void {
    const reading = readLocation(snapshot);
    if (reading === null) {
      return;
    }
    // 手動モードでは同一値の再通知を抑止する（中間の null を出さないための dedupe）。
    // シナリオモードは鮮度更新・記録のため毎回 emit する。
    if (
      !force &&
      snapshot.mode === 'manual' &&
      this.lastEmitted !== null &&
      sameLocation(this.lastEmitted, reading)
    ) {
      return;
    }
    const fix: SensorFix = {
      point: reading.point,
      accuracyM: reading.accuracyM,
      capturedAtEpochMs: null, // Mock はライブラリの測位時刻を持たない
      receivedAtMonotonicMs: this.clock.nowMonotonicMs(),
      receivedAtEpochMs: this.clock.nowEpochMs(),
      source: 'mock',
    };
    this.lastEmitted = reading;
    this.lastFix = fix;
    onFix(fix);
  }
}

interface LocationReading {
  readonly point: GeoPoint;
  readonly accuracyM: number | null;
}

/** 位置の同一性（座標と精度）。 */
function sameLocation(a: LocationReading, b: LocationReading): boolean {
  return (
    a.point.latitude === b.point.latitude &&
    a.point.longitude === b.point.longitude &&
    a.accuracyM === b.accuracyM
  );
}

/** snapshot から有効な位置サンプルを取り出す。無ければ null（サンプルを出さない）。 */
function readLocation(snapshot: MockSensorSnapshot): LocationReading | null {
  if (!snapshot.locationPresent) {
    return null;
  }
  if (snapshot.mode === 'manual') {
    if (snapshot.manualPoint === null) {
      return null;
    }
    return { point: snapshot.manualPoint, accuracyM: snapshot.manualAccuracyM };
  }
  if (snapshot.scenarioId === null) {
    return null;
  }
  const scenario = SCENARIOS.find((candidate) => candidate.id === snapshot.scenarioId);
  if (scenario === undefined) {
    return null;
  }
  const sample = sampleScenario(scenario, snapshot.scenarioElapsedMs);
  if (sample.location === null) {
    return null;
  }
  return { point: sample.location.point, accuracyM: sample.location.accuracyM };
}

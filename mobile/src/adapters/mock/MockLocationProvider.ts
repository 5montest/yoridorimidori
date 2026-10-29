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
 * - snapshot の変化時のみ `onFix` を呼ぶ。位置サンプルが無い間（GPS 欠損・未設定）は何も出さない。
 */
export class MockLocationProvider implements LocationProvider {
  readonly id = 'mock';

  private lastFix: SensorFix | null = null;

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
      const reading = readLocation(snapshot);
      if (reading === null) {
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
      this.lastFix = fix;
      onFix(fix);
    });

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
}

interface LocationReading {
  readonly point: GeoPoint;
  readonly accuracyM: number | null;
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

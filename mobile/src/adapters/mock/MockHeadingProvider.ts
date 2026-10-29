import { SCENARIOS, sampleScenario } from '../../domain/scenario';
import type { HeadingAccuracyLevel, HeadingFix, HeadingReference } from '../../domain/types';
import type { Clock } from '../../ports/clock';
import type { ProviderError, Unsubscribe } from '../../ports/common';
import type { HeadingProvider } from '../../ports/heading';
import type { MockSensorController, MockSensorSnapshot } from '../../ports/mockSensor';

/**
 * Mock 方位プロバイダ（§4.3 / §8.2）。`MockSensorController` の snapshot を `HeadingFix` に変換する。
 *
 * - `isAvailable()` は常に true（Mock は方位 API の有無に依存しない）。
 * - 方位不明（`headingDeg: null`）も `HeadingFix` として通知する（E-08 を UI まで伝える）。
 * - `stallAfterMs` を過ぎたシナリオでは**通知しない**（サンプル停止 = 鮮度が進む）。
 * - `source: 'mock'`、受信時刻は注入された `Clock`。
 */
export class MockHeadingProvider implements HeadingProvider {
  readonly id = 'mock';

  constructor(
    private readonly controller: MockSensorController,
    private readonly clock: Clock,
  ) {}

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  start(
    onFix: (fix: HeadingFix) => void,
    _onError: (error: ProviderError) => void,
  ): Promise<Unsubscribe> {
    const unsubscribe = this.controller.subscribe((snapshot) => {
      const reading = readHeading(snapshot);
      if (reading === null) {
        return; // シナリオ停止中はサンプルを出さない
      }
      onFix({
        headingDeg: reading.headingDeg,
        reference: reading.reference,
        accuracy: reading.accuracy,
        receivedAtMonotonicMs: this.clock.nowMonotonicMs(),
        receivedAtEpochMs: this.clock.nowEpochMs(),
        source: 'mock',
      });
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
}

interface HeadingReading {
  readonly headingDeg: number | null;
  readonly accuracy: HeadingAccuracyLevel | null;
  readonly reference: HeadingReference;
}

/** snapshot から方位サンプルを取り出す。null = 停止中（通知しない）。 */
function readHeading(snapshot: MockSensorSnapshot): HeadingReading | null {
  if (snapshot.mode === 'manual') {
    const headingDeg = snapshot.manualHeadingDeg;
    return {
      headingDeg,
      accuracy: headingDeg === null ? null : snapshot.manualHeadingAccuracy,
      reference: headingDeg === null ? 'unknown' : snapshot.manualHeadingReference,
    };
  }
  if (snapshot.scenarioId === null) {
    return null;
  }
  const scenario = SCENARIOS.find((candidate) => candidate.id === snapshot.scenarioId);
  if (scenario === undefined) {
    return null;
  }
  const stalled = scenario.stallAfterMs !== null && snapshot.scenarioElapsedMs >= scenario.stallAfterMs;
  if (stalled) {
    return null;
  }
  const sample = sampleScenario(scenario, snapshot.scenarioElapsedMs);
  const headingDeg = sample.heading.headingDeg;
  return {
    headingDeg,
    accuracy: headingDeg === null ? null : sample.heading.accuracy,
    reference: headingDeg === null ? 'unknown' : sample.heading.reference,
  };
}

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
 * - **購読開始時に現在の snapshot を 1 回 emit する**（Mock ON 前に手動値が設定されている
 *   ケースでも即座に反映するため）。
 * - **手動モードでは「値が変わったときだけ」emit する**。実機バグ（位置だけ変更したときの
 *   中間 `null` 通知が 100ms 間引きで残り「方位不明」になる）を防ぐ dedupe。`force` は常に emit。
 * - シナリオモードは従来どおり毎 commit emit する（鮮度更新・サンプル記録のため dedupe しない）。
 * - `stallAfterMs` を過ぎたシナリオでは**通知しない**（サンプル停止 = 鮮度が進む）。
 * - `source: 'mock'`、受信時刻は注入された `Clock`。
 */
export class MockHeadingProvider implements HeadingProvider {
  readonly id = 'mock';

  private lastEmitted: HeadingReading | null = null;

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

  private emitFromSnapshot(
    snapshot: MockSensorSnapshot,
    onFix: (fix: HeadingFix) => void,
    force: boolean,
  ): void {
    const reading = readHeading(snapshot);
    if (reading === null) {
      return; // シナリオ停止中はサンプルを出さない
    }
    // 手動モードでは同一値の再通知を抑止する（位置だけ変更した commit で
    // 方位 null を出してしまい、100ms 間引きと組み合わさると「方位不明」が固まるため）。
    if (
      !force &&
      snapshot.mode === 'manual' &&
      this.lastEmitted !== null &&
      sameHeading(this.lastEmitted, reading)
    ) {
      return;
    }
    this.lastEmitted = reading;
    onFix({
      headingDeg: reading.headingDeg,
      reference: reading.reference,
      accuracy: reading.accuracy,
      receivedAtMonotonicMs: this.clock.nowMonotonicMs(),
      receivedAtEpochMs: this.clock.nowEpochMs(),
      source: 'mock',
    });
  }
}

interface HeadingReading {
  readonly headingDeg: number | null;
  readonly accuracy: HeadingAccuracyLevel | null;
  readonly reference: HeadingReference;
}

/** 方位の同一性（値・精度・基準）。 */
function sameHeading(a: HeadingReading, b: HeadingReading): boolean {
  return (
    a.headingDeg === b.headingDeg &&
    a.accuracy === b.accuracy &&
    a.reference === b.reference
  );
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

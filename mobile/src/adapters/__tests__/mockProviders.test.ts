import { FakeClock } from '../clock/FakeClock';
import { MockHeadingProvider } from '../mock/MockHeadingProvider';
import { MockLocationProvider } from '../mock/MockLocationProvider';
import { MockSensorControllerImpl } from '../mock/MockSensorControllerImpl';
import type { HeadingFix, SensorFix } from '../../domain/types';

const TOKYO: { readonly latitude: number; readonly longitude: number } = {
  latitude: 35.681236,
  longitude: 139.767125,
};

interface Harness {
  readonly controller: MockSensorControllerImpl;
  readonly clock: FakeClock;
  readonly locationProvider: MockLocationProvider;
  readonly headingProvider: MockHeadingProvider;
}

function makeHarness(): Harness {
  const controller = new MockSensorControllerImpl();
  const clock = new FakeClock();
  return {
    controller,
    clock,
    locationProvider: new MockLocationProvider(controller, clock),
    headingProvider: new MockHeadingProvider(controller, clock),
  };
}

describe('MockLocationProvider', () => {
  it('契約: id / 権限は granted', async () => {
    const harness = makeHarness();
    expect(harness.locationProvider.id).toBe('mock');
    await expect(harness.locationProvider.requestPermission()).resolves.toEqual({
      status: 'granted',
      canAskAgain: true,
      androidAccuracy: 'fine',
    });
    await expect(harness.locationProvider.getPermissionState()).resolves.toMatchObject({
      status: 'granted',
      canAskAgain: true,
    });
  });

  it('start 後に位置を変更すると SensorFix（source: mock・FakeClock の受信時刻）が届く', async () => {
    const harness = makeHarness();
    const fixes: SensorFix[] = [];
    const stop = await harness.locationProvider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    harness.clock.advance(1_000);
    harness.controller.setManualLocation(TOKYO, 5);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toEqual({
      point: TOKYO,
      accuracyM: 5,
      capturedAtEpochMs: null,
      receivedAtMonotonicMs: 1_000,
      receivedAtEpochMs: 1_700_000_001_000,
      source: 'mock',
    });
    stop();
  });

  it('getLastKnown は直近 fix・未取得なら null', async () => {
    const harness = makeHarness();
    await expect(harness.locationProvider.getLastKnown()).resolves.toBeNull();
    const stop = await harness.locationProvider.start(
      () => undefined,
      () => undefined,
    );
    harness.controller.setManualLocation(TOKYO, 8);
    await expect(harness.locationProvider.getLastKnown()).resolves.toMatchObject({
      point: TOKYO,
      accuracyM: 8,
    });
    stop();
  });

  it('unsubscribe 後は onFix が呼ばれない・2 回呼んでも例外なし', async () => {
    const harness = makeHarness();
    const fixes: SensorFix[] = [];
    const stop = await harness.locationProvider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    harness.controller.setManualLocation(TOKYO, 5);
    expect(fixes).toHaveLength(1);
    stop();
    stop(); // 冪等
    harness.controller.setManualLocation({ ...TOKYO, latitude: 35.7 }, 5);
    expect(fixes).toHaveLength(1);
  });

  it('GPS 欠損シナリオでは位置を出さず、復帰後に出す', async () => {
    const harness = makeHarness();
    const fixes: SensorFix[] = [];
    const stop = await harness.locationProvider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    harness.controller.selectScenario('gps-dropout');
    fixes.length = 0; // シナリオ選択時の初期フレーム通知は除外
    harness.controller.advance(6_000); // 欠損中
    expect(fixes).toHaveLength(0);
    harness.controller.advance(10_000); // 16 秒 = 復帰
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.source).toBe('mock');
    stop();
  });
});

describe('MockHeadingProvider', () => {
  it('isAvailable は true・id は mock', async () => {
    const harness = makeHarness();
    await expect(harness.headingProvider.isAvailable()).resolves.toBe(true);
    expect(harness.headingProvider.id).toBe('mock');
  });

  it('手動方位 0 が headingDeg 0・accuracy 3 で届く', async () => {
    const harness = makeHarness();
    const fixes: HeadingFix[] = [];
    const stop = await harness.headingProvider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    harness.controller.setManualHeading(0, 3, 'true-north');
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toEqual({
      headingDeg: 0,
      reference: 'true-north',
      accuracy: 3,
      receivedAtMonotonicMs: 0,
      receivedAtEpochMs: 1_700_000_000_000,
      source: 'mock',
    });
    stop();
  });

  it('手動方位 null は headingDeg: null・reference: unknown として届く（E-08）', async () => {
    const harness = makeHarness();
    const fixes: HeadingFix[] = [];
    const stop = await harness.headingProvider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    harness.controller.setManualHeading(90, 3, 'true-north');
    harness.controller.setManualHeading(null, null, 'unknown');
    expect(fixes).toHaveLength(2);
    expect(fixes[1]?.headingDeg).toBeNull();
    expect(fixes[1]?.reference).toBe('unknown');
    expect(fixes[1]?.accuracy).toBeNull();
    stop();
  });

  it('方位精度 0〜3 がそのまま accuracy に入る', async () => {
    const harness = makeHarness();
    const fixes: HeadingFix[] = [];
    const stop = await harness.headingProvider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    harness.controller.setManualHeading(10, 0, 'true-north');
    harness.controller.setManualHeading(20, 1, 'true-north');
    harness.controller.setManualHeading(30, 2, 'magnetic-north');
    harness.controller.setManualHeading(40, 3, 'magnetic-north');
    expect(fixes.map((fix) => fix.accuracy)).toEqual([0, 1, 2, 3]);
    expect(fixes.map((fix) => fix.reference)).toEqual([
      'true-north',
      'true-north',
      'magnetic-north',
      'magnetic-north',
    ]);
    stop();
  });

  it('unsubscribe 後は通知されない（冪等）', async () => {
    const harness = makeHarness();
    const fixes: HeadingFix[] = [];
    const stop = await harness.headingProvider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    harness.controller.setManualHeading(90, 2, 'true-north');
    stop();
    stop();
    harness.controller.setManualHeading(180, 2, 'true-north');
    expect(fixes).toHaveLength(1);
  });

  it('方位不明シナリオでは headingDeg: null を通知する', async () => {
    const harness = makeHarness();
    const fixes: HeadingFix[] = [];
    const stop = await harness.headingProvider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    harness.controller.selectScenario('heading-unknown');
    fixes.length = 0; // シナリオ選択時の初期フレーム通知は除外
    harness.controller.advance(100);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.headingDeg).toBeNull();
    expect(fixes[0]?.reference).toBe('unknown');
    stop();
  });

  it('stale-data は stallAfterMs 以降に通知しない', async () => {
    const harness = makeHarness();
    const fixes: HeadingFix[] = [];
    const stop = await harness.headingProvider.start(
      (fix) => fixes.push(fix),
      () => undefined,
    );
    harness.controller.selectScenario('stale-data');
    fixes.length = 0; // シナリオ選択時の初期フレーム通知は除外
    harness.controller.advance(500);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.headingDeg).toBe(0);
    harness.controller.advance(1_000); // 1,500 ms >= stallAfterMs(1,000)
    expect(fixes).toHaveLength(1); // 追加通知なし
    stop();
  });
});

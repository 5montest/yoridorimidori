import { FakeClock } from '../clock/FakeClock';
import { MockSensorControllerImpl } from '../mock/MockSensorControllerImpl';
import type { MockSensorSnapshot } from '../../ports/mockSensor';

const TOKYO: { readonly latitude: number; readonly longitude: number } = {
  latitude: 35.681236,
  longitude: 139.767125,
};

function makeController(): MockSensorControllerImpl {
  return new MockSensorControllerImpl();
}

/** 購読して通知された snapshot を集める。 */
function collect(controller: MockSensorControllerImpl): {
  readonly snapshots: readonly MockSensorSnapshot[];
  readonly unsubscribe: () => void;
} {
  const snapshots: MockSensorSnapshot[] = [];
  const unsubscribe = controller.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });
  return { snapshots, unsubscribe };
}

describe('FakeClock', () => {
  it('初期値と advance（単調時計と壁時計が同じだけ進む）', () => {
    const clock = new FakeClock();
    expect(clock.nowMonotonicMs()).toBe(0);
    expect(clock.nowEpochMs()).toBe(1_700_000_000_000);
    clock.advance(1_000);
    expect(clock.nowMonotonicMs()).toBe(1_000);
    expect(clock.nowEpochMs()).toBe(1_700_000_001_000);
  });

  it('setEpoch は壁時計だけを変える（単調時計は不変）', () => {
    const clock = new FakeClock();
    clock.advance(500);
    clock.setEpoch(1_000);
    expect(clock.nowEpochMs()).toBe(1_000);
    expect(clock.nowMonotonicMs()).toBe(500);
  });

  it('負値・非有限の advance は無視する（時間を巻き戻さない）', () => {
    const clock = new FakeClock();
    clock.advance(100);
    clock.advance(-50);
    clock.advance(NaN);
    clock.advance(Infinity);
    expect(clock.nowMonotonicMs()).toBe(100);
    expect(clock.nowEpochMs()).toBe(1_700_000_000_100);
  });
});

describe('MockSensorControllerImpl — 初期状態', () => {
  it('手動モード・値は null・timeScale 1・シナリオ未選択', () => {
    const controller = makeController();
    const snapshot = controller.getSnapshot();
    expect(snapshot.mode).toBe('manual');
    expect(snapshot.manualPoint).toBeNull();
    expect(snapshot.manualAccuracyM).toBeNull();
    expect(snapshot.manualHeadingDeg).toBeNull();
    expect(snapshot.manualHeadingAccuracy).toBeNull();
    expect(snapshot.manualHeadingReference).toBe('true-north');
    expect(snapshot.scenarioId).toBeNull();
    expect(snapshot.scenarioElapsedMs).toBe(0);
    expect(snapshot.timeScale).toBe(1);
    expect(snapshot.locationPresent).toBe(false);
    expect(snapshot.headingPresent).toBe(false);
  });
});

describe('MockSensorControllerImpl — 手動モードと通知', () => {
  it('setManualLocation で snapshot が更新され 1 回通知される', () => {
    const controller = makeController();
    const { snapshots } = collect(controller);
    controller.setManualLocation(TOKYO, 5);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.locationPresent).toBe(true);
    expect(snapshots[0]?.manualPoint).toEqual(TOKYO);
    expect(snapshots[0]?.manualAccuracyM).toBe(5);
    expect(controller.getSnapshot().manualPoint).toEqual(TOKYO);
  });

  it('同じ値の再設定では通知されない', () => {
    const controller = makeController();
    controller.setManualLocation(TOKYO, 5);
    const { snapshots } = collect(controller);
    controller.setManualLocation({ ...TOKYO }, 5);
    expect(snapshots).toHaveLength(0);
    controller.setManualLocation(TOKYO, 6); // 精度が変わる → 通知
    expect(snapshots).toHaveLength(1);
  });

  it('setManualHeading / 同じ値では通知されない', () => {
    const controller = makeController();
    const { snapshots } = collect(controller);
    controller.setManualHeading(90, 2, 'true-north');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.headingPresent).toBe(true);
    expect(snapshots[0]?.manualHeadingDeg).toBe(90);
    expect(snapshots[0]?.manualHeadingAccuracy).toBe(2);
    controller.setManualHeading(90, 2, 'true-north');
    expect(snapshots).toHaveLength(1); // 変化なし
    controller.setManualHeading(90, 1, 'true-north'); // 精度が変わる
    expect(snapshots).toHaveLength(2);
  });

  it('方位は [0,360) に正規化して保持する', () => {
    const controller = makeController();
    controller.setManualHeading(-1, 3, 'true-north');
    expect(controller.getSnapshot().manualHeadingDeg).toBe(359);
    controller.setManualHeading(720, 3, 'true-north');
    expect(controller.getSnapshot().manualHeadingDeg).toBe(0);
  });

  it('手動方位 null は headingPresent=false・reference は unknown', () => {
    const controller = makeController();
    controller.setManualHeading(null, null, 'unknown');
    const snapshot = controller.getSnapshot();
    expect(snapshot.manualHeadingDeg).toBeNull();
    expect(snapshot.headingPresent).toBe(false);
    expect(snapshot.manualHeadingReference).toBe('unknown');
  });

  it('不正な位置・精度は無視してデータモデルを汚さない', () => {
    const controller = makeController();
    controller.setManualLocation({ latitude: NaN, longitude: 139.7 }, 5);
    expect(controller.getSnapshot().manualPoint).toBeNull();
    controller.setManualLocation(TOKYO, -1);
    expect(controller.getSnapshot().manualAccuracyM).toBeNull();
    expect(controller.getSnapshot().manualPoint).toEqual(TOKYO);
  });

  it('購読解除後は通知されない・解除は冪等', () => {
    const controller = makeController();
    let count = 0;
    const unsubscribe = controller.subscribe(() => {
      count += 1;
    });
    controller.setManualLocation(TOKYO, 5);
    expect(count).toBe(1);
    unsubscribe();
    unsubscribe(); // 2 回目も例外なし
    controller.setManualLocation({ ...TOKYO, latitude: 35.7 }, 5);
    expect(count).toBe(1);
  });

  it('複数購読者に同じ snapshot が届く', () => {
    const controller = makeController();
    const first = collect(controller);
    const second = collect(controller);
    controller.setManualLocation(TOKYO, 8);
    expect(first.snapshots).toHaveLength(1);
    expect(second.snapshots).toHaveLength(1);
    expect(first.snapshots[0]).toEqual(second.snapshots[0]);
  });
});

describe('MockSensorControllerImpl — シナリオ再生', () => {
  it('advance() を呼ばない限り時間は進まない', () => {
    const controller = makeController();
    controller.selectScenario('rotate');
    expect(controller.getSnapshot().scenarioElapsedMs).toBe(0);
    expect(controller.getSnapshot().mode).toBe('scenario');
  });

  it('selectScenario 後の advance で scenarioElapsedMs が進む', () => {
    const controller = makeController();
    controller.selectScenario('rotate');
    controller.advance(1_000);
    expect(controller.getSnapshot().scenarioElapsedMs).toBe(1_000);
    expect(controller.getSnapshot().locationPresent).toBe(true);
    expect(controller.getSnapshot().headingPresent).toBe(true);
  });

  it('setTimeScale(10) で時間が加速する', () => {
    const controller = makeController();
    controller.selectScenario('rotate');
    controller.setTimeScale(10);
    controller.advance(100);
    expect(controller.getSnapshot().scenarioElapsedMs).toBe(1_000);
  });

  it('timeScale 2 で 2 倍', () => {
    const controller = makeController();
    controller.selectScenario('static');
    controller.setTimeScale(2);
    controller.advance(250);
    expect(controller.getSnapshot().scenarioElapsedMs).toBe(500);
  });

  it('gps-dropout: 6 秒時点で locationPresent=false、16 秒時点で true', () => {
    const controller = makeController();
    controller.selectScenario('gps-dropout');
    controller.advance(6_000);
    expect(controller.getSnapshot().scenarioElapsedMs).toBe(6_000);
    expect(controller.getSnapshot().locationPresent).toBe(false);
    expect(controller.getSnapshot().headingPresent).toBe(true);
    controller.advance(10_000); // 合計 16 秒
    expect(controller.getSnapshot().locationPresent).toBe(true);
    expect(controller.getSnapshot().headingPresent).toBe(true);
  });

  it('heading-unknown: headingPresent=false・locationPresent=true', () => {
    const controller = makeController();
    controller.selectScenario('heading-unknown');
    controller.advance(5_000);
    expect(controller.getSnapshot().headingPresent).toBe(false);
    expect(controller.getSnapshot().locationPresent).toBe(true);
  });

  it('stale-data: stallAfterMs 以降は位置・方位とも出さない', () => {
    const controller = makeController();
    controller.selectScenario('stale-data');
    controller.advance(500);
    expect(controller.getSnapshot().locationPresent).toBe(true);
    expect(controller.getSnapshot().headingPresent).toBe(true);
    controller.advance(1_000); // 合計 1,500 ms >= stallAfterMs(1,000)
    expect(controller.getSnapshot().locationPresent).toBe(false);
    expect(controller.getSnapshot().headingPresent).toBe(false);
  });

  it('selectScenario(null) で手動モードに戻る', () => {
    const controller = makeController();
    controller.selectScenario('rotate');
    controller.advance(1_000);
    controller.selectScenario(null);
    expect(controller.getSnapshot().mode).toBe('manual');
    expect(controller.getSnapshot().scenarioId).toBeNull();
    expect(controller.getSnapshot().scenarioElapsedMs).toBe(0);
  });

  it('advance(-100) は状態を変えず通知もしない', () => {
    const controller = makeController();
    controller.selectScenario('rotate');
    controller.advance(1_000);
    const before = controller.getSnapshot();
    const { snapshots } = collect(controller);
    controller.advance(-100);
    controller.advance(NaN);
    expect(controller.getSnapshot()).toEqual(before);
    expect(snapshots).toHaveLength(0);
  });

  it('同一操作列で同一 snapshot（決定論）', () => {
    const run = (): readonly MockSensorSnapshot[] => {
      const controller = makeController();
      const { snapshots } = collect(controller);
      controller.selectScenario('rotate');
      controller.setTimeScale(2);
      controller.advance(1_000);
      controller.advance(2_500);
      return snapshots;
    };
    expect(run()).toEqual(run());
  });
});

describe('MockSensorControllerImpl — reset', () => {
  it('reset() で初期状態に戻る', () => {
    const controller = makeController();
    const initial = controller.getSnapshot();
    controller.setManualLocation(TOKYO, 5);
    controller.setManualHeading(90, 2, 'magnetic-north');
    controller.selectScenario('straight');
    controller.setTimeScale(5);
    controller.advance(3_000);
    expect(controller.getSnapshot()).not.toEqual(initial);

    controller.reset();
    expect(controller.getSnapshot()).toEqual(initial);
  });

  it('reset() は変化がある場合のみ通知する', () => {
    const controller = makeController();
    const { snapshots } = collect(controller);
    controller.reset(); // 初期状態のまま → 通知なし
    expect(snapshots).toHaveLength(0);
    controller.setManualLocation(TOKYO, 5);
    expect(snapshots).toHaveLength(1);
    controller.reset();
    expect(snapshots).toHaveLength(2);
  });
});

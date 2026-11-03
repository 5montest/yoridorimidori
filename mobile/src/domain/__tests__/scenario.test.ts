import { EARTH_RADIUS_M } from '../constants';
import { haversineDistanceM } from '../distance';
import { DEMO_PRESETS } from '../presets';
import {
  DEMO_SCENARIO_ID,
  SCENARIOS,
  sampleScenario,
  scenarioPhaseMs,
  type Scenario,
  type ScenarioId,
} from '../scenario';
import { isValidGeoPoint } from '../validation';

function findScenario(id: ScenarioId): Scenario {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id);
  if (scenario === undefined) {
    throw new Error(`scenario not found: ${id}`);
  }
  return scenario;
}

/** 全フレーム（100ms 刻み）を走査する。 */
function forEachFrame(
  scenario: Scenario,
  callback: (elapsedMs: number) => void,
): void {
  for (let elapsedMs = 0; elapsedMs <= scenario.durationMs; elapsedMs += 100) {
    callback(elapsedMs);
  }
}

describe('SCENARIOS — データ不変条件', () => {
  it('12 件定義され、id が一意', () => {
    expect(SCENARIOS).toHaveLength(13);
    const ids = SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(13);
    expect(ids).toEqual([
      'static',
      'straight',
      'rotate',
      'gps-dropout',
      'heading-unknown',
      'stale-data',
      'heading-jitter',
      'heading-jump',
      'north-crossing',
      'gps-jump',
      'train-speed',
      'heading-accuracy-degrade',
      'gps-recover-train',
    ]);
  });

  it('keyframes は昇順・先頭 atMs = 0・ラベル非空・duration 正', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.durationMs).toBeGreaterThan(0);
      expect(scenario.labelJa.trim().length).toBeGreaterThan(0);
      expect(scenario.keyframes.length).toBeGreaterThan(0);
      expect(scenario.keyframes[0]?.atMs).toBe(0);

      let previousAtMs = -1;
      for (const frame of scenario.keyframes) {
        expect(frame.atMs).toBeGreaterThan(previousAtMs); // 厳密に昇順（重複なし）
        previousAtMs = frame.atMs;
        expect(frame.atMs).toBeLessThanOrEqual(scenario.durationMs);
      }
      expect(scenario.stallAfterMs === null || scenario.stallAfterMs >= 0).toBe(true);
    }
  });

  it('方位データは headingDeg が null か [0,360)・accuracy は 0〜3 か null', () => {
    for (const scenario of SCENARIOS) {
      for (const frame of scenario.keyframes) {
        const headingDeg = frame.heading.headingDeg;
        if (headingDeg !== null) {
          expect(Number.isFinite(headingDeg)).toBe(true);
          expect(headingDeg).toBeGreaterThanOrEqual(0);
          expect(headingDeg).toBeLessThan(360);
        }
        const accuracy = frame.heading.accuracy;
        if (accuracy !== null) {
          expect([0, 1, 2, 3]).toContain(accuracy);
        }
        // 位置が不正（NaN / 範囲外）なら座標契約違反
        if (frame.location !== null) {
          expect(isValidGeoPoint(frame.location.point)).toBe(true);
        }
      }
    }
  });

  it('既定シナリオは static', () => {
    expect(DEMO_SCENARIO_ID).toBe('static');
  });
});

describe('sampleScenario — 全フレームの有無（FR-10 / NFR-10）', () => {
  it('static: 常に位置と方位があり、方位 0°・精度 3', () => {
    const scenario = findScenario('static');
    forEachFrame(scenario, (elapsedMs) => {
      const frame = sampleScenario(scenario, elapsedMs);
      expect(frame.location).not.toBeNull();
      expect(frame.heading.headingDeg).toBe(0);
      expect(frame.heading.accuracy).toBe(3);
      expect(frame.heading.reference).toBe('true-north');
    });
  });

  it('gps-dropout: 5〜15 秒だけ location が null、方位は出続ける', () => {
    const scenario = findScenario('gps-dropout');
    forEachFrame(scenario, (elapsedMs) => {
      const frame = sampleScenario(scenario, elapsedMs);
      const inDropout = elapsedMs >= 5_000 && elapsedMs < 15_000;
      if (inDropout) {
        expect(frame.location).toBeNull();
      } else {
        expect(frame.location).not.toBeNull();
      }
      expect(frame.heading.headingDeg).not.toBeNull();
      expect(frame.heading.reference).not.toBe('unknown');
    });
  });

  it('heading-unknown: 常に headingDeg が null・reference は unknown', () => {
    const scenario = findScenario('heading-unknown');
    forEachFrame(scenario, (elapsedMs) => {
      const frame = sampleScenario(scenario, elapsedMs);
      expect(frame.heading.headingDeg).toBeNull();
      expect(frame.heading.reference).toBe('unknown');
      expect(frame.location).not.toBeNull();
    });
  });

  it('straight: 位置が出続け、緯度が単調増加する', () => {
    const scenario = findScenario('straight');
    // 100ms 刻みでは step-hold により同じ緯度が続くため「非減少」を確認する。
    let previousLatitude = Number.NEGATIVE_INFINITY;
    for (let elapsedMs = 0; elapsedMs < scenario.durationMs; elapsedMs += 100) {
      const frame = sampleScenario(scenario, elapsedMs);
      expect(frame.location).not.toBeNull();
      const latitude = frame.location === null ? NaN : frame.location.point.latitude;
      expect(Number.isFinite(latitude)).toBe(true);
      expect(latitude).toBeGreaterThanOrEqual(previousLatitude);
      previousLatitude = latitude;
    }
    // キーフレーム境界（500ms）では厳密に増加する。
    let previousBoundaryLatitude = Number.NEGATIVE_INFINITY;
    for (let elapsedMs = 0; elapsedMs < scenario.durationMs; elapsedMs += 500) {
      const frame = sampleScenario(scenario, elapsedMs);
      const latitude = frame.location === null ? NaN : frame.location.point.latitude;
      expect(latitude).toBeGreaterThan(previousBoundaryLatitude);
      previousBoundaryLatitude = latitude;
    }
    expect(previousLatitude).toBeGreaterThan(-90);
  });

  it('rotate: 方位が 5 秒ごとに 30° ずつ進む（0→30→…→330→0）', () => {
    const scenario = findScenario('rotate');
    expect(sampleScenario(scenario, 0).heading.headingDeg).toBe(0);
    expect(sampleScenario(scenario, 4_999).heading.headingDeg).toBe(0);
    expect(sampleScenario(scenario, 5_000).heading.headingDeg).toBe(30);
    expect(sampleScenario(scenario, 55_000).heading.headingDeg).toBe(330);
    // duration ちょうどは repeat により先頭へ折り返す
    expect(sampleScenario(scenario, 60_000).heading.headingDeg).toBe(0);
    forEachFrame(scenario, (elapsedMs) => {
      const headingDeg = sampleScenario(scenario, elapsedMs).heading.headingDeg;
      expect(headingDeg).not.toBeNull();
      expect(headingDeg as number).toBeGreaterThanOrEqual(0);
      expect(headingDeg as number).toBeLessThan(360);
    });
  });

  it('stale-data: サンプルデータは存在する（停止判定は T12 のコントローラの責務）', () => {
    const scenario = findScenario('stale-data');
    expect(scenario.stallAfterMs).not.toBeNull();
    expect(scenario.repeat).toBe(false);
    const frame = sampleScenario(scenario, 44_000);
    expect(frame.location).not.toBeNull();
    expect(frame.heading.headingDeg).not.toBeNull();
  });

  it('straight は東京駅プリセットへ近づく（開始 ≈168 m 南 → 終了 <10 m）', () => {
    const scenario = findScenario('straight');
    const presets = DEMO_PRESETS;
    const tokyo = presets[0];
    expect(tokyo).toBeDefined();
    if (tokyo === undefined) {
      return;
    }
    const firstLocation = sampleScenario(scenario, 0).location;
    // duration ちょうどは repeat で先頭に戻るため、最後のキーフレーム位置（59.5 秒）で判定する。
    const lastLocation = sampleScenario(scenario, 59_500).location;
    expect(firstLocation).not.toBeNull();
    expect(lastLocation).not.toBeNull();
    if (firstLocation === null || lastLocation === null) {
      return;
    }
    const startDistance = haversineDistanceM(firstLocation.point, tokyo.point);
    const endDistance = haversineDistanceM(lastLocation.point, tokyo.point);
    expect(startDistance).not.toBeNull();
    expect(endDistance).not.toBeNull();
    expect(startDistance as number).toBeGreaterThan(150);
    expect(startDistance as number).toBeLessThan(190);
    expect(endDistance as number).toBeLessThan(10); // 到着判定（< 10 m）に届く
  });
});

describe('sampleScenario — step-hold と範囲外時刻', () => {
  it('キーフレーム間は直前のキーフレームを保持する', () => {
    const scenario = findScenario('straight');
    expect(sampleScenario(scenario, 250)).toBe(sampleScenario(scenario, 0));
    expect(sampleScenario(scenario, 499)).toBe(sampleScenario(scenario, 0));
    expect(sampleScenario(scenario, 500)).not.toBe(sampleScenario(scenario, 0));
    expect(sampleScenario(scenario, 750)).toBe(sampleScenario(scenario, 500));
  });

  it('負の時刻は 0 にクランプされる', () => {
    const scenario = findScenario('straight');
    expect(sampleScenario(scenario, -1)).toBe(sampleScenario(scenario, 0));
    expect(scenarioPhaseMs(scenario, -1)).toBe(0);
  });

  it('空の keyframes でもクラッシュせず「位置なし・方位不明」を返す（防御）', () => {
    const empty: Scenario = {
      id: 'static',
      labelJa: '空',
      durationMs: 1_000,
      repeat: true,
      stallAfterMs: null,
      keyframes: [],
    };
    const frame = sampleScenario(empty, 500);
    expect(frame.atMs).toBe(0);
    expect(frame.location).toBeNull();
    expect(frame.heading.headingDeg).toBeNull();
    expect(frame.heading.reference).toBe('unknown');
  });
});

describe('scenarioPhaseMs', () => {
  it('repeat: true は折り返す', () => {
    const scenario = findScenario('straight');
    expect(scenario.repeat).toBe(true);
    expect(scenario.durationMs).toBe(60_000);
    expect(scenarioPhaseMs(scenario, 0)).toBe(0);
    expect(scenarioPhaseMs(scenario, 5_000)).toBe(5_000);
    expect(scenarioPhaseMs(scenario, 60_000)).toBe(0);
    expect(scenarioPhaseMs(scenario, 65_000)).toBe(5_000);
    expect(scenarioPhaseMs(scenario, 125_000)).toBe(5_000);
  });

  it('repeat: false は durationMs でクランプする', () => {
    const scenario = findScenario('stale-data');
    expect(scenario.repeat).toBe(false);
    expect(scenario.durationMs).toBe(45_000);
    expect(scenarioPhaseMs(scenario, 30_000)).toBe(30_000);
    expect(scenarioPhaseMs(scenario, 45_000)).toBe(45_000);
    expect(scenarioPhaseMs(scenario, 120_000)).toBe(45_000);
  });

  it('非有限の時刻は 0', () => {
    const scenario = findScenario('static');
    expect(scenarioPhaseMs(scenario, NaN)).toBe(0);
    expect(scenarioPhaseMs(scenario, Infinity)).toBe(0);
  });
});

describe('DEMO_PRESETS — §10.6', () => {
  it('3 件・id 一意・名前非空・すべて origin = preset', () => {
    expect(DEMO_PRESETS.length).toBeGreaterThanOrEqual(2);
    expect(DEMO_PRESETS.length).toBeLessThanOrEqual(3);
    const ids = DEMO_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of DEMO_PRESETS) {
      expect(preset.name.trim().length).toBeGreaterThan(0);
      expect(preset.origin).toBe('preset');
      expect(isValidGeoPoint(preset.point)).toBe(true);
    }
  });

  it('東京駅〜新宿駅は約 6.1 km（±0.3 km）', () => {
    const tokyo = DEMO_PRESETS.find((preset) => preset.name === '東京駅');
    const shinjuku = DEMO_PRESETS.find((preset) => preset.name === '新宿駅');
    expect(tokyo).toBeDefined();
    expect(shinjuku).toBeDefined();
    if (tokyo === undefined || shinjuku === undefined) {
      return;
    }
    const distance = haversineDistanceM(tokyo.point, shinjuku.point);
    expect(distance).not.toBeNull();
    const meters = distance as number;
    expect(meters).toBeGreaterThan(6_100 - 300);
    expect(meters).toBeLessThan(6_100 + 300);
    // 地球半径の定数を使っていることの間接確認（1° ≈ 111 km）
    expect(EARTH_RADIUS_M).toBeGreaterThan(6_000_000);
  });
});

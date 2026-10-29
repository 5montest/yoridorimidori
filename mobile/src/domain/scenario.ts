import type { GeoPoint, HeadingAccuracyLevel, HeadingReference } from './types';

/** Mock センサーのシナリオ ID（§8.4）。 */
export type ScenarioId =
  | 'static'
  | 'straight'
  | 'rotate'
  | 'gps-dropout'
  | 'heading-unknown'
  | 'stale-data';

/** シナリオの 1 キーフレーム（その時刻以降、次のキーフレームまで保持される）。 */
export interface ScenarioKeyframe {
  /** シナリオ開始からの経過 ms。昇順であること。 */
  readonly atMs: number;
  /** 位置。null = この時点で位置サンプルを出さない（GPS 欠損）。 */
  readonly location: {
    readonly point: GeoPoint;
    readonly accuracyM: number | null;
  } | null;
  /** 方位。headingDeg が null = 方位不明。 */
  readonly heading: {
    readonly headingDeg: number | null;
    readonly accuracy: HeadingAccuracyLevel | null;
    readonly reference: HeadingReference;
  };
}

/** Mock シナリオの定義データ（再生は MockSensorControllerImpl が行う。§8.2）。 */
export interface Scenario {
  readonly id: ScenarioId;
  readonly labelJa: string;
  readonly durationMs: number;
  /** ループ再生するか。 */
  readonly repeat: boolean;
  /** この時刻以降はサンプルを出さない（古いデータ／途絶の再現）。null なら出し続ける。 */
  readonly stallAfterMs: number | null;
  readonly keyframes: readonly ScenarioKeyframe[];
}

/** シナリオ開始からの経過。`repeat` なら折り返し、`repeat: false` なら `durationMs` でクランプ。 */
export function scenarioPhaseMs(scenario: Scenario, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }
  const durationMs = scenario.durationMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  if (!scenario.repeat) {
    return Math.min(elapsedMs, durationMs);
  }
  return elapsedMs % durationMs;
}

/** 経過 ms 時点のサンプル。step-hold（直前のキーフレームを保持）。 */
export function sampleScenario(scenario: Scenario, elapsedMs: number): ScenarioKeyframe {
  const phaseMs = scenarioPhaseMs(scenario, elapsedMs);
  const first = scenario.keyframes[0];
  if (first === undefined) {
    // データ不正（空）でもクラッシュしないよう「位置なし・方位不明」を返す（防御）。
    return {
      atMs: 0,
      location: null,
      heading: { headingDeg: null, accuracy: null, reference: 'unknown' },
    };
  }
  let current = first;
  for (const frame of scenario.keyframes) {
    if (frame.atMs <= phaseMs) {
      current = frame;
    } else {
      break;
    }
  }
  return current;
}

// ── シナリオ定義（§8.4。座標は東京駅周辺のダミー値） ───────────────────────

/** 東京駅（§10.6 のプリセットと同じ概値）。 */
const TOKYO_STATION: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };
/** 直進シナリオの緯度 1 キーフレームあたりの変化（0.0000126° ≈ 1.4 m）。 */
const STRAIGHT_LAT_STEP_DEG = 0.0000126;
/** 直進シナリオのキーフレーム間隔（500 ms）。 */
const STRAIGHT_FRAME_INTERVAL_MS = 500;
/** 直進シナリオの開始地点 = 東京駅から約 168 m 南。 */
const STRAIGHT_START: GeoPoint = {
  latitude: TOKYO_STATION.latitude - 168 / 111_195.08,
  longitude: TOKYO_STATION.longitude,
};

function straightKeyframes(): readonly ScenarioKeyframe[] {
  const frames: ScenarioKeyframe[] = [];
  const count = 60_000 / STRAIGHT_FRAME_INTERVAL_MS; // 121 フレーム（0〜60,000 ms）
  for (let index = 0; index <= count; index += 1) {
    frames.push({
      atMs: index * STRAIGHT_FRAME_INTERVAL_MS,
      location: {
        point: {
          latitude: STRAIGHT_START.latitude + index * STRAIGHT_LAT_STEP_DEG,
          longitude: STRAIGHT_START.longitude,
        },
        accuracyM: 8,
      },
      heading: { headingDeg: 0, accuracy: 3, reference: 'true-north' },
    });
  }
  return frames;
}

function rotateKeyframes(): readonly ScenarioKeyframe[] {
  const frames: ScenarioKeyframe[] = [];
  // 5 秒ごとに 30° ずつ回り、60 秒で 1 周（0→330→0）。
  for (let index = 0; index <= 12; index += 1) {
    frames.push({
      atMs: index * 5_000,
      location: { point: TOKYO_STATION, accuracyM: 8 },
      heading: { headingDeg: (index * 30) % 360, accuracy: 3, reference: 'true-north' },
    });
  }
  return frames;
}

const FIXED_HEADING = { headingDeg: 0, accuracy: 3, reference: 'true-north' } as const;
const FIXED_LOCATION = { point: TOKYO_STATION, accuracyM: 8 } as const;

/** 全シナリオ（§8.4 の 6 件）。 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'static',
    labelJa: '静止',
    durationMs: 60_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: [{ atMs: 0, location: FIXED_LOCATION, heading: FIXED_HEADING }],
  },
  {
    id: 'straight',
    labelJa: '直進（目的地へ歩行）',
    durationMs: 60_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: straightKeyframes(),
  },
  {
    id: 'rotate',
    labelJa: '回転（方位 1 周）',
    durationMs: 60_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: rotateKeyframes(),
  },
  {
    id: 'gps-dropout',
    labelJa: 'GPS 欠損（5〜15 秒）',
    durationMs: 30_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: [
      { atMs: 0, location: FIXED_LOCATION, heading: FIXED_HEADING },
      { atMs: 5_000, location: null, heading: FIXED_HEADING },
      { atMs: 15_000, location: FIXED_LOCATION, heading: FIXED_HEADING },
    ],
  },
  {
    id: 'heading-unknown',
    labelJa: '方位不明',
    durationMs: 30_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: [
      {
        atMs: 0,
        location: FIXED_LOCATION,
        heading: { headingDeg: null, accuracy: null, reference: 'unknown' },
      },
    ],
  },
  {
    id: 'stale-data',
    labelJa: '古いデータ（1 秒で停止）',
    durationMs: 45_000,
    repeat: false,
    stallAfterMs: 1_000,
    keyframes: [{ atMs: 0, location: FIXED_LOCATION, heading: FIXED_HEADING }],
  },
];

/** 開発画面の既定シナリオ。 */
export const DEMO_SCENARIO_ID: ScenarioId = 'static';

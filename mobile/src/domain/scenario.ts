import type { GeoPoint, HeadingAccuracyLevel, HeadingReference } from './types';

/** Mock センサーのシナリオ ID（§8.4）。 */
export type ScenarioId =
  | 'static'
  | 'straight'
  | 'rotate'
  | 'gps-dropout'
  | 'heading-unknown'
  | 'stale-data'
  // 2026-11-01: 方位安定化の検証用
  | 'heading-jitter'
  | 'heading-jump'
  | 'north-crossing'
  | 'gps-jump'
  | 'train-speed'
  | 'heading-accuracy-degrade'
  // 2026-11-03: GPS 途絶後の移動再取得（電車）
  | 'gps-recover-train';

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

/** 赤道 1 度あたりの距離（m）。Mock の位置移動に使う。 */
const METERS_PER_DEGREE_AT_EQUATOR = 111_195.08;

/** 東京駅から東へ `meters` 移動した点（Mock 用）。 */
function eastPointAtMeters(meters: number): GeoPoint {
  return {
    latitude: TOKYO_STATION.latitude,
    longitude: TOKYO_STATION.longitude + meters / METERS_PER_DEGREE_AT_EQUATOR,
  };
}

/** 方位ジッター（±20°）。 */
function headingJitterKeyframes(): readonly ScenarioKeyframe[] {
  const frames: ScenarioKeyframe[] = [];
  const pattern = [0, 20, 350, 15, 345, 10, 350];
  for (let index = 0; index < 40; index += 1) {
    frames.push({
      atMs: index * 250,
      location: FIXED_LOCATION,
      heading: {
        headingDeg: pattern[index % pattern.length] ?? 0,
        accuracy: 2,
        reference: 'true-north',
      },
    });
  }
  return frames;
}

/** 方位ジャンプ（2 秒ごとに 0°/180°）。 */
function headingJumpKeyframes(): readonly ScenarioKeyframe[] {
  const frames: ScenarioKeyframe[] = [];
  for (let index = 0; index <= 8; index += 1) {
    frames.push({
      atMs: index * 2_000,
      location: FIXED_LOCATION,
      heading: {
        headingDeg: index % 2 === 0 ? 0 : 180,
        accuracy: 3,
        reference: 'true-north',
      },
    });
  }
  return frames;
}

/** 0°/360° をまたぐ回転（350°→10°）。 */
function northCrossingKeyframes(): readonly ScenarioKeyframe[] {
  const headings = [350, 355, 0, 5, 10, 5, 0, 355, 350];
  return headings.map((headingDeg, index) => ({
    atMs: index * 1_000,
    location: FIXED_LOCATION,
    heading: { headingDeg, accuracy: 3, reference: 'true-north' },
  }));
}

/** GPS 位置飛び（500m 東へ飛ぶ→戻る）。 */
function gpsJumpKeyframes(): readonly ScenarioKeyframe[] {
  const jump = eastPointAtMeters(500);
  return [
    { atMs: 0, location: FIXED_LOCATION, heading: FIXED_HEADING },
    { atMs: 2_000, location: { point: jump, accuracyM: 8 }, heading: FIXED_HEADING },
    { atMs: 4_000, location: FIXED_LOCATION, heading: FIXED_HEADING },
    { atMs: 6_000, location: { point: jump, accuracyM: 8 }, heading: FIXED_HEADING },
    { atMs: 8_000, location: FIXED_LOCATION, heading: FIXED_HEADING },
  ];
}

/** 電車移動（20m/s で東へ）。 */
function trainSpeedKeyframes(): readonly ScenarioKeyframe[] {
  const frames: ScenarioKeyframe[] = [];
  for (let index = 0; index <= 40; index += 1) {
    frames.push({
      atMs: index * 500,
      location: { point: eastPointAtMeters(index * 10), accuracyM: 8 },
      heading: { headingDeg: 90, accuracy: 3, reference: 'true-north' },
    });
  }
  return frames;
}

/** GPS 途絶（3〜30 秒）の後に、電車（20m/s）で 600m 先から復帰する。 */
function gpsRecoverTrainKeyframes(): readonly ScenarioKeyframe[] {
  const heading = { headingDeg: 90, accuracy: 3, reference: 'true-north' } as const;
  const frames: ScenarioKeyframe[] = [
    { atMs: 0, location: FIXED_LOCATION, heading },
    { atMs: 3_000, location: null, heading },
  ];
  for (let index = 0; index <= 15; index += 1) {
    frames.push({
      atMs: 30_000 + index * 1_000,
      location: { point: eastPointAtMeters(600 + index * 20), accuracyM: 8 },
      heading,
    });
  }
  return frames;
}

/** 方位精度の劣化（3→1→0→不明→3）。 */
function headingAccuracyDegradeKeyframes(): readonly ScenarioKeyframe[] {
  const levels: readonly (0 | 1 | 2 | 3 | null)[] = [3, 3, 3, 1, 1, 1, 0, 0, 0, null, null, null, 3, 3, 3];
  return levels.map((accuracy, index) => ({
    atMs: index * 1_000,
    location: FIXED_LOCATION,
    heading: {
      headingDeg: accuracy === null ? null : 0,
      accuracy,
      reference: accuracy === null ? 'unknown' : 'true-north',
    },
  }));
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
  {
    id: 'heading-jitter',
    labelJa: '方位ジッター（±20°）',
    durationMs: 10_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: headingJitterKeyframes(),
  },
  {
    id: 'heading-jump',
    labelJa: '方位ジャンプ（180°）',
    durationMs: 16_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: headingJumpKeyframes(),
  },
  {
    id: 'north-crossing',
    labelJa: '方位 0° またぎ（350→10）',
    durationMs: 9_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: northCrossingKeyframes(),
  },
  {
    id: 'gps-jump',
    labelJa: 'GPS 位置飛び（500m）',
    durationMs: 10_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: gpsJumpKeyframes(),
  },
  {
    id: 'train-speed',
    labelJa: '電車移動（20m/s）',
    durationMs: 20_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: trainSpeedKeyframes(),
  },
  {
    id: 'heading-accuracy-degrade',
    labelJa: '方位精度の劣化（3→1→0→不明）',
    durationMs: 15_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: headingAccuracyDegradeKeyframes(),
  },
  {
    id: 'gps-recover-train',
    labelJa: 'GPS 途絶→電車で復帰（600m）',
    durationMs: 45_000,
    repeat: true,
    stallAfterMs: null,
    keyframes: gpsRecoverTrainKeyframes(),
  },
];


/** 開発画面の既定シナリオ。 */
export const DEMO_SCENARIO_ID: ScenarioId = 'static';

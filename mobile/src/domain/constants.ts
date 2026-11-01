/** 地球平均半径（IUGG 平均）。haversine 用。 */
export const EARTH_RADIUS_M = 6_371_008.8;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** 同一地点判定: 距離がこれ未満なら方位を定義しない（FR-04 / E-01）。1cm。 */
export const SAME_POINT_EPS_M = 0.01;
/** 極点判定: |緯度| が 90° にこれ以上近ければ極点として扱う（度）。 */
export const POLE_EPS_DEG = 1e-9;

/** 到着判定半径（m）。要件 FR-06「10 m 未満」に合わせ、比較は distance < 10 で行う。 */
export const ARRIVAL_RADIUS_M = 10;

/** 希望更新間隔（ms）。Android の timeInterval に渡す。 */
export const LOCATION_UPDATE_INTERVAL_MS = 1000;
/** 方位の dispatch 間引き（ms）。watchHeadingAsync に間隔指定が無いため UI 側で間引く。 */
export const HEADING_DISPATCH_MIN_INTERVAL_MS = 100;
/** 鮮度表示を更新するティッカーの間隔（ms）。 */
export const TICK_INTERVAL_MS = 1000;

/** リングバッファ容量（FR-09）。 */
export const SAMPLE_LOG_CAPACITY = 300;

/** 閾値群（テストで差し替え可能にするため型にする。D-08 / D-09）。 */
export interface Thresholds {
  readonly freshness: {
    readonly freshMaxMs: number; // これ以下 = fresh（既定 3000）
    readonly agingMaxMs: number; // これ以下 = aging（既定 10000）
    readonly staleMaxMs: number; // これ以下 = stale（既定 30000）
  };
  readonly gpsAccuracy: {
    readonly goodMaxM: number; // これ以下 = good（既定 10）
    readonly fairMaxM: number; // これ以下 = fair（既定 30）
  };
  readonly arrivalRadiusM: number; // 既定 10
  readonly sampleLogCapacity: number; // 既定 300
  /** 案内の安全側制御（2026-11-01）。仮説値。実測で調整する。 */
  readonly guidance: {
    /** 到着確定に必要な水平精度の上限（m）。 */
    readonly arrivalMaxAccuracyM: number;
    /** 到着確定に許す測位時刻と受信時刻の差（ms）。 */
    readonly arrivalMaxCaptureLagMs: number;
    /** 位置が stale のとき案内を一時保持するか。 */
    readonly holdWhenLocationStale: boolean;
    /** 方位が stale のとき案内を一時保持するか。 */
    readonly holdWhenHeadingStale: boolean;
    /** 方位精度が低い（0/1/null）とき案内を一時保持するか。 */
    readonly holdWhenHeadingAccuracyLow: boolean;
    /** GPS 精度が poor/unknown のとき案内を一時保持するか。 */
    readonly holdWhenGpsPoor: boolean;
    /** 目的地が近いとき（distance < accuracy * ratio）案内を一時保持する。 */
    readonly nearDestinationAccuracyRatio: number;
  };
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  freshness: { freshMaxMs: 3_000, agingMaxMs: 10_000, staleMaxMs: 30_000 },
  gpsAccuracy: { goodMaxM: 10, fairMaxM: 30 },
  arrivalRadiusM: ARRIVAL_RADIUS_M,
  sampleLogCapacity: SAMPLE_LOG_CAPACITY,
  guidance: {
    arrivalMaxAccuracyM: 10,
    arrivalMaxCaptureLagMs: 5_000,
    holdWhenLocationStale: true,
    holdWhenHeadingStale: true,
    holdWhenHeadingAccuracyLow: true,
    holdWhenGpsPoor: true,
    nearDestinationAccuracyRatio: 3,
  },
};

/** 位置取得プロファイル（アダプタが Location.Accuracy にマップする）。 */
export type AccuracyProfile = 'navigation' | 'balanced';
export const DEFAULT_ACCURACY_PROFILE: AccuracyProfile = 'navigation';
export const SETTINGS_DEFAULT = {
  accuracyProfile: DEFAULT_ACCURACY_PROFILE,
  locationUpdateIntervalMs: LOCATION_UPDATE_INTERVAL_MS,
} as const;

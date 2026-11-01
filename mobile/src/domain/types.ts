// ── 位置・方位 ───────────────────────────────────────────────────────────────

/** 地理座標。単位: 度。lat ∈ [-90, 90], lon ∈ [-180, 180] を満たすこと。 */
export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

/** 方位の基準。'true-north' = 真北基準（trueHeading 由来）。 */
export type HeadingReference = 'true-north' | 'magnetic-north' | 'unknown';

/** コンパス校正レベル。0=校正なし / 1=低 / 2=中 / 3=高（ライブラリの数値をそのまま保持）。 */
export type HeadingAccuracyLevel = 0 | 1 | 2 | 3;

/** 値の供給元。UI とログに「どちらの値か」を残すため保持する。 */
export type SensorSource = 'device' | 'mock';

/** GPS の 1 フィックス。単位: 度 / m / ms。 */
export interface SensorFix {
  readonly point: GeoPoint;
  /** 水平精度（半径 m）。取れない場合は null。 */
  readonly accuracyM: number | null;
  /** ライブラリが返した測位時刻（epoch ms）。不正なら null。 */
  readonly capturedAtEpochMs: number | null;
  /** アプリが値を受け取った時刻（単調増加 ms）。鮮度計算は必ずこちらを使う。 */
  readonly receivedAtMonotonicMs: number;
  /** アプリが値を受け取った時刻（epoch ms）。ログ用。 */
  readonly receivedAtEpochMs: number;
  readonly source: SensorSource;
}

/** 端末方位の 1 フィックス。headingDeg は [0, 360)。不明なら null。 */
export interface HeadingFix {
  readonly headingDeg: number | null;
  readonly reference: HeadingReference;
  readonly accuracy: HeadingAccuracyLevel | null;
  readonly receivedAtMonotonicMs: number;
  readonly receivedAtEpochMs: number;
  readonly source: SensorSource;
}

// ── 目的地 ─────────────────────────────────────────────────────────────────

/** 目的地の由来。「初回プリセット」か「ユーザー操作」かを区別する。 */
export type DestinationOrigin = 'manual' | 'preset' | 'current-location';

/** 永続化される目的地。 */
export interface Destination {
  /** アプリ内で一意な ID（保存時に生成）。 */
  readonly id: string;
  /** 表示名（前後空白を除去し 1〜50 文字）。 */
  readonly name: string;
  readonly point: GeoPoint;
  readonly createdAtEpochMs: number;
  readonly origin: DestinationOrigin;
  /** お気に入り（☆）。既定 false。 */
  readonly favorite: boolean;
  /** 最後に目的地として使った時刻（epoch ms）。未使用は null。 */
  readonly lastUsedAtEpochMs: number | null;
}

/** 登録・更新の入力（ID と作成時刻は保存側が決める）。 */
export interface DestinationInput {
  readonly name: string;
  readonly point: GeoPoint;
  readonly origin: DestinationOrigin;
}

/** 更新可能なフィールドのみ。 */
export type DestinationPatch = Partial<Pick<Destination, 'name' | 'point'>>;

// ── 記録（FR-09） ───────────────────────────────────────────────────────────

/** 精度・鮮度の 1 サンプル。全フィールド JSON 安全（プリミティブのみ）。 */
export interface SampleLogEntry {
  readonly recordedAtEpochMs: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly gpsAccuracyM: number | null;
  readonly headingDeg: number | null;
  readonly headingReference: HeadingReference;
  readonly headingAccuracy: HeadingAccuracyLevel | null;
  /** 記録時点の位置の経過時間（ms）。 */
  readonly locationAgeMs: number;
  /** 記録時点の方位の経過時間（ms）。方位未取得なら null。 */
  readonly headingAgeMs: number | null;
}

// ── 判定結果（表示用の区分コード） ─────────────────────────────────────────

/** 鮮度区分。閾値は Thresholds で注入する（§6.7）。 */
export type Freshness = 'fresh' | 'aging' | 'stale' | 'lost';

/** GPS 精度区分。 */
export type GpsAccuracyClass = 'good' | 'fair' | 'poor' | 'unknown';

/** 方位精度区分。0 は 'uncalibrated'（要校正）として区別する。 */
export type HeadingAccuracyClass = 'good' | 'fair' | 'poor' | 'uncalibrated' | 'unknown';

/** 案内表示の信頼度（2026-11-01 追加）。
 * - normal: 通常案内
 * - hold: 一時保持（前回の値を表示し「確認中」を明示）
 * - unavailable: 案内保留（不確かな方向を通常表示しない）
 */
export type GuidanceAvailability = 'normal' | 'hold' | 'unavailable';

/** 案内を制限している要因（UI の文言の出し分けに使う）。 */
export type GuidanceIssue = 'position' | 'heading' | 'both' | null;

/** 画面の主状態。優先順位は §6.8。 */
export type NavStatus =
  | 'no-destination'
  | 'locating'
  | 'position-lost'
  | 'heading-unknown'
  | 'arrived'
  | 'navigating';

/** 追加の警告（status と独立に複数付く）。 */
export type WarningCode =
  | 'location-stale'
  | 'location-lost'
  | 'heading-stale'
  | 'heading-lost'
  | 'heading-low-accuracy'
  | 'heading-uncalibrated'
  | 'heading-unavailable'
  | 'magnetic-reference'
  | 'gps-low-accuracy';

/** 画面が必要とするすべての派生値。UI はこれを表示するだけ。 */
export interface NavState {
  readonly status: NavStatus;
  readonly distanceM: number | null;
  readonly targetBearingDeg: number | null;
  readonly relativeBearingDeg: number | null;
  readonly headingReference: HeadingReference;
  readonly locationFreshness: Freshness | null;
  readonly headingFreshness: Freshness | null;
  readonly locationAgeMs: number | null;
  readonly headingAgeMs: number | null;
  readonly gpsAccuracyClass: GpsAccuracyClass;
  readonly headingAccuracyClass: HeadingAccuracyClass;
  /** 表示順に整列済み（§6.8 の優先順位）。 */
  readonly warnings: readonly WarningCode[];
  /** 案内表示の信頼度（2026-11-01）。 */
  readonly guidanceAvailability: GuidanceAvailability;
  /** 案内を制限している要因（null = 制限なし）。 */
  readonly guidanceIssue: GuidanceIssue;
}

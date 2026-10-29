import type {
  Freshness,
  GpsAccuracyClass,
  HeadingAccuracyClass,
  HeadingReference,
  NavStatus,
  WarningCode,
} from '../domain/types';
import { formatAgeMs } from '../domain/format';
import { normalizeSignedDegrees } from '../domain/normalize';
import type { ValidationResult } from '../domain/validation';

/** 画面 ID（UI 内の自前遷移。ADR-07）。`'map'` は T27 で追加する。 */
export type ScreenId = 'main' | 'destinations' | 'add' | 'dev';

/** 目的地入力の検証エラーキー（domain の `ValidationResult.errorKey` を単一の源にする）。 */
export type ValidationErrorKey = NonNullable<ValidationResult<unknown>['errorKey']>;

/** 値が無いときの表示記号（文言ではなく記号。domain の format と同じ記号を使う）。 */
const NO_VALUE = '—';

// ── 区分コード → 日本語文言（§9.4 / NFR-08 / D-12）─────────────────────────

/** 総合状態の文言。§6.8 / §9.4。 */
export function navStatusLabel(status: NavStatus): string {
  switch (status) {
    case 'no-destination':
      return '目的地を選んでください';
    case 'locating':
      return '測位中';
    case 'position-lost':
      return '位置情報が途絶しています';
    case 'heading-unknown':
      return '方位不明';
    case 'arrived':
      return '到着';
    case 'navigating':
      return 'ナビゲーション中';
  }
}

/** 鮮度区分の文言。`null`（未取得）も非空で返す。§6.6 / §9.4。 */
export function freshnessLabel(freshness: Freshness | null): string {
  switch (freshness) {
    case 'fresh':
      return '最新';
    case 'aging':
      return 'やや古い';
    case 'stale':
      return '古い';
    case 'lost':
      return '途絶';
    case null:
      return '未取得';
  }
}

/** GPS 精度区分の文言。§6.7 / §9.4。 */
export function gpsAccuracyLabel(accuracyClass: GpsAccuracyClass): string {
  switch (accuracyClass) {
    case 'good':
      return '良好';
    case 'fair':
      return '普通';
    case 'poor':
      return '不良';
    case 'unknown':
      return '不明';
  }
}

/** 方位精度区分の文言。`uncalibrated`（要校正）と `unknown`（不明）を区別する。§6.7。 */
export function headingAccuracyLabel(accuracyClass: HeadingAccuracyClass): string {
  switch (accuracyClass) {
    case 'good':
      return '良好';
    case 'fair':
      return '普通';
    case 'poor':
      return '不良';
    case 'uncalibrated':
      return '要校正';
    case 'unknown':
      return '不明';
  }
}

/** 方位基準の文言。磁北は「磁北基準」を含む（§9.4）。 */
export function headingReferenceLabel(reference: HeadingReference): string {
  switch (reference) {
    case 'true-north':
      return '真北基準';
    case 'magnetic-north':
      return '磁北基準';
    case 'unknown':
      return '基準不明';
  }
}

/** 警告コードの文言（表示順は domain の `warnings` 配列順に従う）。§9.4。 */
export function warningLabel(warning: WarningCode): string {
  switch (warning) {
    case 'location-stale':
      return '位置情報が古くなっています';
    case 'location-lost':
      return '位置情報が途絶しています';
    case 'heading-stale':
      return '方位情報が古くなっています';
    case 'heading-lost':
      return '方位情報が途絶しています';
    case 'heading-low-accuracy':
      return '方位が不安定です';
    case 'heading-uncalibrated':
      return '方位の校正が必要です（8 の字に振ってください）';
    case 'heading-unavailable':
      return 'この環境では方位を取得できません';
    case 'magnetic-reference':
      return '磁北基準で表示しています';
    case 'gps-low-accuracy':
      return 'GPS 精度が不良です';
  }
}

/** 目的地入力の検証エラー文言。§6.11 の `errorKey` を日本語化する。 */
export function validationErrorLabel(errorKey: ValidationErrorKey): string {
  switch (errorKey) {
    case 'name-required':
      return '名前を入力してください';
    case 'name-too-long':
      return '名前は 50 文字以内で入力してください';
    case 'latitude-invalid':
      return '緯度は -90〜90 の数値で入力してください';
    case 'longitude-invalid':
      return '経度は -180〜180 の数値で入力してください';
    case 'point-invalid':
      return '緯度・経度を入力してください';
  }
}

// ── 表示の合成（単位・記号の付与はここに集約。数値の再計算はしない）──────────

/** 鮮度 + 経過秒（例: `最新（1 秒前）`）。経過時間が無ければ鮮度のみ。 */
export function freshnessWithAgeLabel(
  freshness: Freshness | null,
  ageMs: number | null,
): string {
  const label = freshnessLabel(freshness);
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) {
    return label;
  }
  return `${label}（${formatAgeMs(ageMs)}前）`;
}

/** GPS 精度の生値（例: `8 m`）と区分（例: `良好`）を併記する。§9.4。 */
export function gpsAccuracyWithValueLabel(
  accuracyM: number | null,
  accuracyClass: GpsAccuracyClass,
): string {
  const value =
    accuracyM === null || !Number.isFinite(accuracyM) || accuracyM < 0
      ? NO_VALUE
      : `${Math.round(accuracyM)} m`;
  return `${value}（${gpsAccuracyLabel(accuracyClass)}）`;
}

/** 方位精度の生値（0〜3）と区分を併記する。§9.4。 */
export function headingAccuracyWithValueLabel(
  level: 0 | 1 | 2 | 3 | null,
  accuracyClass: HeadingAccuracyClass,
): string {
  const value = level === null ? NO_VALUE : `${level}`;
  return `${value}（${headingAccuracyLabel(accuracyClass)}）`;
}

/** 相対方位を方角の言葉にする（数値表示の補助・アクセシビリティ用）。 */
export function relativeDirectionLabel(relativeBearingDeg: number | null): string {
  if (relativeBearingDeg === null || !Number.isFinite(relativeBearingDeg)) {
    return '不明';
  }
  const normalized = normalizeSignedDegrees(relativeBearingDeg);
  const magnitude = Math.abs(normalized);
  if (magnitude <= 22.5) {
    return '正面';
  }
  if (magnitude <= 67.5) {
    return normalized > 0 ? '右斜め前' : '左斜め前';
  }
  if (magnitude <= 112.5) {
    return normalized > 0 ? '右' : '左';
  }
  if (magnitude <= 157.5) {
    return normalized > 0 ? '右後ろ' : '左後ろ';
  }
  return '真後ろ';
}

/** 鳥のコンテナに付けるアクセシビリティ文言。§9.4 / NFR-08。 */
export function birdAccessibilityLabel(
  relativeBearingDeg: number | null,
  arrived: boolean,
): string {
  if (arrived) {
    return '到着しました。目的地は目の前です';
  }
  if (relativeBearingDeg === null || !Number.isFinite(relativeBearingDeg)) {
    return '目的地の方向が分かりません';
  }
  return `目的地は${relativeDirectionLabel(relativeBearingDeg)}の方向です`;
}

/** 画面 ID の文言（画面切替・見出し）。 */
export function screenLabel(screen: ScreenId): string {
  switch (screen) {
    case 'main':
      return 'ナビ';
    case 'destinations':
      return '目的地';
    case 'add':
      return '目的地を追加';
    case 'dev':
      return '記録';
  }
}

// ── 画面の固定文言（文言はこのファイル以外に書かない）──────────────────────

/** 画面・コンポーネントに表示する固定文言。 */
export const UI_TEXT = {
  appTitle: '寄鳥美鳥地',
  noValue: NO_VALUE,
  /** メイン画面 */
  main: {
    destinationLabel: '目的地',
    destinationEmpty: '目的地を選んでください',
    changeDestination: '変更',
    distanceLabel: '距離',
    relativeBearingLabel: '相対方位',
    arrived: '到着',
    statusLabel: '総合状態',
    gpsLabel: '位置',
    headingLabel: '方位',
    warningsLabel: '警告',
    openDestinations: '目的地',
    openDevLog: '記録',
    mockOn: 'Mock: ON',
    mockOff: 'Mock: OFF',
  },
  /** 目的地一覧 */
  destinationList: {
    title: '目的地',
    empty: '目的地が登録されていません',
    add: '追加',
    delete: '削除',
    selected: '選択中',
    back: 'ナビに戻る',
    latitudeShort: '緯度',
    longitudeShort: '経度',
  },
  /** 目的地追加 */
  destinationAdd: {
    title: '目的地を追加',
    nameLabel: '名前',
    namePlaceholder: '例: 東京駅',
    latitudeLabel: '緯度',
    latitudePlaceholder: '35.681236',
    longitudeLabel: '経度',
    longitudePlaceholder: '139.767125',
    useCurrentLocation: '現在地を使う',
    locationUnavailableNoFix: '現在地を取得できていません',
    locationUnavailableLost: '位置情報が途絶えているため現在地を使えません',
    save: '保存',
    cancel: 'キャンセル',
    saveFailed: '保存に失敗しました',
  },
  /** 開発用画面 */
  devLog: {
    title: '開発用（記録・Mock）',
    summaryTitle: '簡易集計',
    averageGps: '平均 GPS 精度',
    sampleCount: '平均の対象件数',
    headingAccuracyDistribution: '方位精度の分布（0/1/2/3）',
    staleRatio: '古いサンプル率',
    samplesTitle: 'サンプル（直近 20 件）',
    samplesEmpty: 'サンプルがありません',
    columnTime: '時刻',
    columnLatitude: '緯度',
    columnLongitude: '経度',
    columnGpsAccuracy: 'GPS 精度',
    columnHeading: '方位',
    columnHeadingAccuracy: '方位精度',
    columnLocationAge: '位置経過',
    columnHeadingAge: '方位経過',
    storageWarningsTitle: '保存警告',
    errorsTitle: '直近エラー',
    back: 'ナビに戻る',
    noSummaryValue: NO_VALUE,
  },
  /** Mock 操作パネル */
  mockControl: {
    title: 'Mock 操作',
    modeLabel: 'Mock モード',
    on: 'Mock ON',
    off: 'Mock OFF',
    manualTitle: '手動入力',
    latitude: '緯度',
    longitude: '経度',
    accuracy: 'GPS 精度',
    heading: '方位',
    headingAccuracy: '方位精度',
    headingReference: '方位基準',
    apply: '適用',
    invalidInput: '数値の形式が正しくありません',
    increase: '増やす',
    decrease: '減らす',
    scenarioTitle: 'シナリオ',
    scenarioNone: '手動（シナリオなし）',
    timeScaleTitle: '時間加速',
    devOnlyNote: '開発ビルドのみ表示しています',
    trueNorth: '真北',
    magneticNorth: '磁北',
    referenceUnknown: '不明',
    accuracyLevels: ['0（校正なし）', '1（低）', '2（中）', '3（高）'] as const,
  },
  /** 権限拒否の案内 */
  permissionNotice: {
    title: '位置情報が許可されていません',
    deniedReason: '現在地を取得できないため、鳥は目的地の方向を向けません。',
    action: '対処: 位置情報を許可するか、開発用の Mock モードでお試しください。',
    retry: '再要求',
    tryMock: 'Mock で試す',
    settingsHint: '設定アプリで位置情報を許可してください（このアプリは設定画面を自動で開きません）',
    mockActive: 'Mock モードで動作中です',
    unavailable: 'この環境では位置情報を取得できません。Mock モードでお試しください。',
  },
  /** ErrorBoundary */
  errorBoundary: {
    title: '表示中にエラーが発生しました',
    body: '目的地・記録は消えていません。',
    backToMain: 'メインに戻る',
  },
  /** 画面切替 */
  screenSwitcher: {
    current: '表示中',
  },
} as const;

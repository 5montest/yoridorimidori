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

/** 画面 ID（UI 内の自前遷移。ADR-07）。 */
export type ScreenId = 'main' | 'destinations' | 'search' | 'add' | 'dev' | 'map';

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

// ── 一般ユーザー向けの言い換え（UX-4 / UX-8: 専門用語・英語 enum 名を出さない）────

/** 8 方位の言葉（UX 文言表: 真っすぐ前 / 右ななめ前 / 右 / 右ななめ後ろ / 真後ろ / ...）。 */
export function directionWordLabel(relativeBearingDeg: number | null): string {
  if (relativeBearingDeg === null || !Number.isFinite(relativeBearingDeg)) {
    return '分かりません';
  }
  const normalized = normalizeSignedDegrees(relativeBearingDeg);
  const magnitude = Math.abs(normalized);
  if (magnitude <= 22.5) {
    return '真っすぐ前';
  }
  if (magnitude <= 67.5) {
    return normalized > 0 ? '右ななめ前' : '左ななめ前';
  }
  if (magnitude <= 112.5) {
    return normalized > 0 ? '右' : '左';
  }
  if (magnitude <= 157.5) {
    return normalized > 0 ? '右ななめ後ろ' : '左ななめ後ろ';
  }
  return '真後ろ';
}

/** GPS の要約（一般向け・1 行サマリ用）。 */
export function gpsSummaryLabel(accuracyClass: GpsAccuracyClass): string {
  switch (accuracyClass) {
    case 'good':
      return '良好';
    case 'fair':
      return '普通';
    case 'poor':
      return '不良';
    case 'unknown':
      return '計測中';
  }
}

/** コンパスの要約（一般向け・1 行サマリ用）。`poor` は柔らかく「やや不安定」と言う。 */
export function compassSummaryLabel(accuracyClass: HeadingAccuracyClass): string {
  switch (accuracyClass) {
    case 'good':
      return '良好';
    case 'fair':
      return '普通';
    case 'poor':
      return 'やや不安定';
    case 'uncalibrated':
      return '要調整';
    case 'unknown':
      return '計測中';
  }
}

/** 1 行の状態サマリ（例: `GPS：良好　コンパス：普通`）。S2 / S6。 */
export function statusSummaryLine(
  gpsAccuracyClass: GpsAccuracyClass,
  headingAccuracyClass: HeadingAccuracyClass,
): string {
  return `${UI_TEXT.main.gpsPrefix}：${gpsSummaryLabel(gpsAccuracyClass)}　${
    UI_TEXT.main.compassPrefix
  }：${compassSummaryLabel(headingAccuracyClass)}`;
}

/** GPS の詳細（数値は詳細シートのみ。UX 文言表の詳細列）。 */
export function gpsDetailLabel(
  accuracyClass: GpsAccuracyClass,
  accuracyM: number | null,
): string {
  if (
    accuracyClass === 'unknown' ||
    accuracyM === null ||
    !Number.isFinite(accuracyM) ||
    accuracyM < 0
  ) {
    return '位置情報を取得しています…';
  }
  const meters = `約 ${Math.round(accuracyM)} m`;
  switch (accuracyClass) {
    case 'good':
    case 'fair':
      return `誤差 ${meters}`;
    case 'poor':
      return `誤差 ${meters}。屋外でお試しください`;
  }
}

/** 更新からの経過時間の詳細（一般向け）。 */
export function freshnessDetailLabel(
  freshness: Freshness | null,
  ageMs: number | null,
): string {
  if (freshness === null || ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) {
    return 'まだ取得できていません';
  }
  switch (freshness) {
    case 'fresh':
    case 'aging':
      return `${formatAgeMs(ageMs)}前に更新`;
    case 'stale':
      return `${formatAgeMs(ageMs)}前に更新。屋外で再取得してください`;
    case 'lost':
      return '30 秒以上更新されていません';
  }
}

/** コンパスの詳細（一般向け）。 */
export function compassDetailLabel(accuracyClass: HeadingAccuracyClass): string {
  switch (accuracyClass) {
    case 'good':
      return 'コンパスの精度: 高';
    case 'fair':
      return 'コンパスの精度: 中';
    case 'poor':
      return 'コンパスの精度: 低。周囲の金属や磁気の影響を受けている可能性があります';
    case 'uncalibrated':
      return '端末を 8 の字に振ってください';
    case 'unknown':
      return 'コンパスの準備中です';
  }
}

/** 方位基準の詳細（一般向け）。 */
export function headingReferenceDetailLabel(reference: HeadingReference): string {
  switch (reference) {
    case 'true-north':
      return '真北基準で表示しています';
    case 'magnetic-north':
      return '磁北基準で表示しています';
    case 'unknown':
      return '方位の基準を判定できていません';
  }
}

/** オンボーディングのページ番号（例: `1 / 3`）。 */
export function onboardingPageLabel(current: number, total: number): string {
  return `${current} / ${total}`;
}

// ── 目的地設定（S3/S4/S5）の状態文言 ─────────────────────────────────────────

/** 検索の状態（S5）。 */
export type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

/** 検索の状態に応じた案内文（0 件・失敗時は「次に何をすればよいか」を 1 文で）。 */
export function searchStatusMessageLabel(status: SearchStatus): string {
  switch (status) {
    case 'idle':
      return '場所や住所を入力して検索してください';
    case 'loading':
      return '検索しています…';
    case 'success':
      return '';
    case 'empty':
      return '見つかりませんでした。地図から選ぶか、現在地を使ってください。';
    case 'error':
      return '検索できませんでした。通信状況を確認して、もう一度お試しください。';
  }
}

/** 共有リンク取り込みの状態（タップ時読み取り。短縮リンクは解決しない）。 */
export type ShareLinkState =
  | 'idle'
  | 'reading'
  | 'ready'
  | 'no-url'
  | 'invalid'
  | 'success'
  | 'needs-resolution';

/** 共有リンク取り込みの案内文。 */
export function shareLinkMessageLabel(state: ShareLinkState): string {
  switch (state) {
    case 'idle':
      return '';
    case 'reading':
      return 'リンクを読み取っています…';
    case 'ready':
      return 'コピーしたリンクから目的地を読み取りました。この場所を目的地にできます。';
    case 'no-url':
      return 'クリップボードにリンクがありません。Google マップなどで「リンクをコピー」してからお試しください。';
    case 'invalid':
      return 'リンクから場所を読み取れませんでした。座標を含むリンクをコピーし直してください。';
    case 'success':
      return 'コピーしたリンクから目的地を設定しました';
    case 'needs-resolution':
      return '短縮リンクは読み取れません。Google マップで「リンクをコピー」し直してください。';
  }
}

/** 検索結果の件数表示（Android の geocode は最大 1 件のため 0/1 前提）。 */
export function searchResultCountLabel(count: number): string {
  if (count <= 0) {
    return '';
  }
  return count === 1 ? '1 件見つかりました' : `${count} 件見つかりました`;
}

/** 相対方位の説明文（数値表示の補助。§9.2 の「目的地は右後ろ」）。 */
export function relativeDirectionCaption(
  relativeBearingDeg: number | null,
  arrived: boolean,
): string {
  if (arrived) {
    return '到着しました';
  }
  if (relativeBearingDeg === null || !Number.isFinite(relativeBearingDeg)) {
    return '方位が分かりません';
  }
  return `目的地は${relativeDirectionLabel(relativeBearingDeg)}`;
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
  return `目的地は${directionWordLabel(relativeBearingDeg)}の方向です`;
}

/** 画面 ID の文言（画面切替・見出し）。 */
export function screenLabel(screen: ScreenId): string {
  switch (screen) {
    case 'main':
      return 'ナビ';
    case 'destinations':
      return '目的地';
    case 'search':
      return '検索結果';
    case 'add':
      return '目的地を追加';
    case 'dev':
      return '記録';
    case 'map':
      return '地図';
  }
}

// ── 開発用画面の表示整形（数値の再計算はせず、集計結果の整形だけを行う）────────

/** サンプル時刻の表示（端末ローカル時刻の HH:MM:SS）。 */
export function formatEpochClockTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    return NO_VALUE;
  }
  const date = new Date(epochMs);
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `${hours}:${minutes}:${seconds}`;
}

/** 平均 GPS 精度の表示（例: `8.2 m（12 件）`）。 */
export function sampleSummaryAverageGpsLabel(
  averageGpsAccuracyM: number | null,
  sampleCount: number,
): string {
  if (averageGpsAccuracyM === null || !Number.isFinite(averageGpsAccuracyM)) {
    return `—（${sampleCount} 件）`;
  }
  const rounded = Math.round(averageGpsAccuracyM * 10) / 10;
  return `${rounded} m（${sampleCount} 件）`;
}

/** 方位精度分布（0〜3）の表示。 */
export function sampleSummaryHeadingDistributionLabel(
  distribution: readonly [number, number, number, number],
): string {
  return `0: ${distribution[0]} 件 / 1: ${distribution[1]} 件 / 2: ${distribution[2]} 件 / 3: ${distribution[3]} 件`;
}

/** 古いサンプル率の表示（例: `25 %`）。 */
export function sampleSummaryStaleRatioLabel(staleRatio: number | null): string {
  if (staleRatio === null || !Number.isFinite(staleRatio)) {
    return NO_VALUE;
  }
  return `${Math.round(staleRatio * 100)} %`;
}

/** 方位精度レベル（0〜3・null）の表示。 */
export function headingAccuracyLevelLabel(level: 0 | 1 | 2 | 3 | null): string {
  return level === null ? NO_VALUE : `${level}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}


// ── 画面の固定文言（文言はこのファイル以外に書かない）──────────────────────

/** 画面・コンポーネントに表示する固定文言。 */
export const UI_TEXT = {
  appTitle: '寄鳥美鳥地',
  noValue: NO_VALUE,
  /** メイン画面（S2）*/
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
    openMap: '地図',
    mockOn: 'Mock: ON',
    mockOff: 'Mock: OFF',
    // ── 一般ユーザー向け（UX 刷新）──
    gpsPrefix: 'GPS',
    compassPrefix: 'コンパス',
    destinationChipEmpty: '目的地を選ぶ',
    destinationChipPrefix: '目的地',
    favoriteAdd: 'お気に入りに追加',
    favoriteRemove: 'お気に入りから外す',
    directionPrefix: '目的地は',
    arrivedTitle: '到着しました',
    arrivedBody: '目的地に着きました。おつかれさまでした。',
    locatingTitle: '現在地を探しています…',
    locatingBody: '電波の良い場所で、少しお待ちください。',
    retry: 'もう一度探す',
    permissionTitle: '位置情報を使えません',
    permissionBody:
      'このアプリは現在地から目的地の方向を示します。位置情報の利用を許可してください。',
    permissionAllow: '許可する',
    permissionLater: 'あとで',
    positionLostTitle: '現在地が分からなくなりました',
    positionLostBody: '屋外に出るか、端末の位置情報がオンになっているか確認してください。',
    noDestinationBody: '目的地を選ぶと、オオハシが方向を教えます。',
    headingUnknownBody: 'コンパスを準備しています。端末を軽く動かしてみてください。',
    devMenuHint: 'タイトルを長押し',
  },
  /** 状態の詳細（S6）*/
  statusDetail: {
    title: '状態の詳細',
    close: '閉じる',
    gpsTitle: 'GPS（位置情報）',
    compassTitle: 'コンパス（方位）',
    warningsTitle: '気になる点',
    noWarnings: '特にありません。このまま使えます。',
    freshTitle: '更新状況',
  },
  /** 目的地一覧（暫定 S3。U06 で検索・地図・最近・お気に入りに置換）*/
  destinationList: {
    title: '目的地',
    empty: '目的地が登録されていません',
    add: '追加',
    delete: '削除',
    selected: '選択中',
    back: 'ナビに戻る',
    latitudeShort: '緯度',
    longitudeShort: '経度',
    useCurrentLocation: '現在地を目的地にする',
    openMap: '地図から選ぶ',
    hint: '目的地をタップするとナビに戻ります。',
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
    noSamplesHint: 'まだサンプルがありません（位置フィックスで記録されます）',
    noErrors: 'エラーはありません',
    noWarnings: '保存警告はありません',
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
    enableHint: 'Mock ON の状態で「適用」すると値が反映されます',
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
  /** 地図画面（native / web フォールバック共通） */
  mapScreen: {
    title: '地図',
    back: 'ナビに戻る',
    webFallback: '地図はこのプラットフォームでは表示できません',
    apiKeyNote: '地図が表示されない場合は Google Maps API キーが未設定です',
    noLocation: '現在地が取得できていないため地図を表示できません',
    noDestination: '目的地が選択されていません',
    currentLocationMarker: '現在地',
    destinationMarker: '目的地',
    destinationLabel: '目的地',
    distanceLabel: '距離',
    relativeBearingLabel: '相対方位',
    locationLabel: '現在地',
    coordinatesLabel: '座標',
  },
  /** オンボーディング（S1・初回のみ 3 枚）*/
  onboarding: {
    skip: 'スキップ',
    next: '次へ',
    start: 'はじめる',
    page1Title: '寄り道も、迷わない。',
    page1Body:
      '寄鳥美鳥地は、オオハシが目的地の方向を教えてくれるナビです。歩きながら、ふと顔を上げてみてください。',
    page2Title: '位置情報について',
    page2Body:
      '現在地から目的地の方向を計算するために位置情報を使います。データは端末の中だけで扱い、外部に送信しません。',
    page3Title: '目的地はかんたんに',
    page3Body:
      '地図をタップする・場所を検索する・現在地や最近使った場所から選ぶ、のどれでも目的地を設定できます。',
    reopen: 'オンボーディングを再表示',
    pageTitles: ['寄り道も、迷わない。', '位置情報について', '目的地はかんたんに'] as const,
    pageBodies: [
      '寄鳥美鳥地は、オオハシが目的地の方向を教えてくれるナビです。歩きながら、ふと顔を上げてみてください。',
      '現在地から目的地の方向を計算するために位置情報を使います。データは端末の中だけで扱い、外部に送信しません。',
      '地図をタップする・場所を検索する・現在地や最近使った場所から選ぶ、のどれでも目的地を設定できます。',
    ] as const,
  },
  /** 開発メニュー（S7・隠し導線）*/
  devMenu: {
    title: '開発メニュー',
    back: 'ナビに戻る',
    subtitle: '一般の操作では表示されません',
    coordinateSetting: '座標で設定（開発用）',
    coordinateSettingNote:
      '通常の目的地設定は「目的地を選ぶ」から地図・検索で行います。座標入力は開発用です。',
    logSection: '記録・Mock',
    onboardingReset: 'オンボーディングを再表示',
    statusDetail: '状態の詳細',
    statusDetailNote: 'GPS・コンパスの精度と鮮度を確認します（一般画面には表示しません）。',
    statusDetailOpen: '状態の詳細を表示',
  },
  /** 目的地を選ぶ（S3）*/
  destinationPicker: {
    title: '目的地を選ぶ',
    back: '戻る',
    searchPlaceholder: '場所や住所を検索',
    searchButton: '検索',
    searchRequiresNetwork: '場所の検索にはインターネット接続と位置情報の許可が必要です',
    useCurrentLocation: '現在地を目的地にする',
    currentLocationUnavailable: '現在地が取得できていません',
    currentLocationLost: '位置情報が途絶えているため現在地を使えません',
    openMap: '地図から選ぶ',
    recentTitle: '最近使った場所',
    favoritesTitle: 'お気に入り',
    noRecent: 'まだありません。目的地を選ぶとここに表示されます。',
    noFavorites: '☆ を付けた場所がここに表示されます。',
    otherMethodsTitle: 'その他の方法',
    clipboardButton: 'コピーしたリンクから設定',
    clipboardHint: 'Google マップの「リンクをコピー」などで共有できます',
    shareConfirm: 'この場所を目的地にする',
    shareDismiss: '閉じる',
    /** 場所名が取得できないときの既定の目的地名（地図・逆ジオコーディング用）。 */
    fallbackName: '選択した地点',
  },
  /** 共有リンク（クリップボード / ディープリンク）の確認シート */
  sharedDestination: {
    title: '共有された目的地',
    confirm: 'この場所を目的地にする',
    dismiss: 'あとで',
    readAgain: '別のリンクを読む',
  },
  /** 検索結果（S5）*/
  searchResults: {
    title: '検索結果',
    back: '戻る',
    loading: '検索しています…',
    select: 'ここを目的地にする',
    successCountSuffix: '件',
    emptyTitle: '見つかりませんでした',
    emptyBody: '地図から選ぶか、現在地を使って目的地を設定できます。',
    errorTitle: '検索できませんでした',
    errorBody: '通信状況と位置情報の許可を確認して、もう一度お試しください。',
    retry: 'もう一度検索',
    openMap: '地図から選ぶ',
    useCurrentLocation: '現在地を使う',
    addressUnknown: '住所は取得できませんでした',
  },
  /** 地図で選ぶ（S4）*/
  mapPick: {
    title: '地図で選ぶ',
    back: '戻る',
    instruction: '地図を動かして、ピンを目的地に合わせます',
    selectedLabel: '選択中',
    resolving: '場所を調べています…',
    noSelection: '地図を動かすと場所が決まります',
    /** 逆ジオコーディングが使えない場合の暫定の目的地名（U05 配線後も失敗時のフォールバック）。 */
    defaultDestinationName: '地図で選んだ場所',
    confirm: 'この場所を目的地にする',
    webFallback: '地図はこのプラットフォームでは表示できません',
    webFallbackBody: 'Android / iOS の実機でご利用ください。',
    tileError: '地図を読み込めません（通信状況を確認してください）',
    attribution: '© OpenStreetMap contributors',
    zoomIn: '拡大',
    zoomOut: '縮小',
  },
} as const;

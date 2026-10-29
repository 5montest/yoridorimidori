# architecture.md — 寄鳥美鳥地（よりどりみどり）スマートフォン用ナビプロトタイプ アーキテクチャ設計

- 版: v0.1
- 最終更新: 2026-10-30
- ステータス: 設計レビュー待ち（実装前に潰す未確認事項は §18 に集約）
- 対応要件: [requirements.md](requirements.md)（FR-01〜FR-12 / NFR-01〜NFR-10 / E-01〜E-15 / D-01〜D-13）
- 前提となる一次情報:
  - [docs/research/library-api-notes.md](docs/research/library-api-notes.md) — 外部ライブラリ API の確定仕様（2026-10-30 取得）
  - [docs/research/pc-build-verification.md](docs/research/pc-build-verification.md) — PC 構築の実測結果とサンドボックス制約
  - [docs/environment-report.md](docs/environment-report.md) — 実行環境の可否判定・Android 実機/AVD 未整備
  - `mobile/` の実物（`package.json` / `tsconfig.json` / `app.json`） — 確定依存と設定
- 関連文書: [tasks.md](tasks.md)（本設計から導出する実装タスク分解）

> **この文書は設計のみを扱う。実装コードは含まない。** 記載の TypeScript は「型契約」であり、実装は tasks.md のタスクで行う。

---

## 0. 読み方 — 「確定」と「未確認」の区別

### 0.1 記法

| 記法 | 意味 |
|---|---|
| **【確定】** | `docs/research/library-api-notes.md` 等の一次情報で確認済み。断定してよい |
| **【RN コア】** | React Native 0.88.1 の標準 API。調査ノートの調査対象外だが、フレームワーク標準として使用する（実装時に型検査＋目視で確認） |
| **⚠️ 未確認** | 一次情報で確認できていない。**断言しない**。実装前に確認するか、確認できるまで使わない（§18 に集約） |
| **【設計判断】** | requirements に明記がなく、本設計で決めた事項（§15.3 / ADR 一覧） |
| **【要承認】** | 依存追加・要件変更など、Lead／ユーザーの承認が必要な事項（§付録A） |

**節番号の表記**: `§n.m` は**本書の節**を指す。一次情報ノート（[library-api-notes.md](docs/research/library-api-notes.md)）の節を指す場合は **`notes §n.m`** と書く（ただし §0.2 の「出典」列のみ notes の節番号を直接記す）。`§18-n` は §18 のチェックリスト項目、`§付録A-n` は付録 A の項目番号。

### 0.2 本設計が依存する外部 API の確認状況

| API / 型 | 用途 | 確認状況 | 出典（notes の節） |
|---|---|---|---|
| `Location.watchPositionAsync(options, callback, errorHandler?)` → `Promise<LocationSubscription>`（`remove()`） | 位置の継続取得 | **【確定】** | §2.3 |
| `Location.getLastKnownPositionAsync(options?)` → `Promise<LocationObject \| null>` | 起動直後の即時表示 | **【確定】** | §2.3 |
| `Location.requestForegroundPermissionsAsync()` / `getForegroundPermissionsAsync()` | 前景位置権限 | **【確定】** | §2.3 |
| `Location.hasServicesEnabledAsync()` | 位置情報サービス ON/OFF | **【確定】** | §2.3 |
| `Location.Accuracy`（`LocationAccuracy` の別名）: `High=4` / `BestForNavigation=6` ほか | 取得精度指定 | **【確定】** | §2.5 |
| `LocationObject`（`coords.{latitude, longitude, accuracy, ...}` + `timestamp`(ms) + `mocked?`） | 位置の生データ | **【確定】** | §2.4 |
| `coords.heading` は**進行方向**でありコンパス方位ではない | 混同禁止の根拠 | **【確定】** | §2.4 |
| `Location.watchHeadingAsync(callback, errorHandler?)` → `Promise<LocationSubscription>` | 端末方位の継続取得（**Android / iOS のみ、Web 非対応**） | **【確定】** | §2.6 |
| `LocationHeadingObject` = `{ trueHeading, magHeading, accuracy }`、`trueHeading` は権限なしで `-1`、`accuracy` は 0〜3 の数値 | 方位の生データ | **【確定】** | §2.6 |
| `react-native-maps` `MapView` props（`provider` / `initialRegion` / `showsUserLocation` / `showsMyLocationButton` / `showsCompass` / `liteMode` 等）、`Marker` props（`coordinate` / `title` / `identifier` / `rotation` 等）、`Region` の使用例 | 地図画面（オプション） | **【確定】**（`Region` の厳密な型定義のみ ⚠️ 未確認。§18-12） | §3.3 / §3.4 |
| `react-native-maps` は **Web 非対応**（`MapView.web.ts` = `UnimplementedView`） | Web フォールバックの根拠 | **【確定】** | §3.6 |
| AsyncStorage 2.2.0 API（`getItem` / `setItem` / `removeItem` / `multiGet` 等）／文字列のみ／非暗号化／Android 合計 6MB・1 件約 2MB | 永続化 | **【確定】** | §6.1 |
| AsyncStorage 公式 Jest モック `.../jest/async-storage-mock` | 永続化テスト | **【確定】** | §6.1 |
| `expo-location` 同梱モックは**空実装**（`undefined` を返す）、専用の公式モック手順は無い | 自前 Mock が必要な根拠 | **【確定】** | §2.8 / §4.3 |
| `jest-expo` preset（`"preset": "jest-expo"`）、Jest 30、`transformIgnorePatterns` 公式推奨値 | テスト基盤 | **【確定】** | §4.1 / §4.2 |
| `react-native-svg` 15.16.0（SDK 58 ピン） | 鳥のベクター描画 | ⚠️ **未確認**（本設計時点で API 一次情報を調査していない） | §18-1 |
| `Animated` / `Easing` / `TextInput` / `Pressable` / `Platform` / `__DEV__` / `setInterval` | 回転アニメーション・入力・プラットフォーム分岐 | **【RN コア】**（標準 API。実装時に型検査と目視で確認） | 対象外 |
| `performance.now()` の RN 上での有無 | 単調時計 | ⚠️ **未確認**（フォールバック必須 → §5.4） | §18-4 |
| `AppState`（背景判定） | 書込フラッシュの契機 | **【RN コア】**（採用は任意・§10.4） | 対象外 |

**原則（要件の設計原則 7）**: 上表で ⚠️ のものは、**実装時に確認するまで「確認済み API」として扱わない**。確認できない場合は代替手段（RN コア API 等）に閉じ込める。

---

## 1. 設計原則と実現方法（7 原則 ↔ 機構の 1 対 1 対応）

7 原則は [README.md](README.md) §設計原則に定義されている（requirements.md は同原則を前提に機能要件を記述）。本設計では次の機構で実現する。

| # | 原則 | 実現する機構 | 検証方法 | 対応要件 |
|---|---|---|---|---|
| 1 | **GPS・コンパス取得とナビ計算を分離**（取得=アダプタ、計算=純粋関数） | `adapters/` は「ライブラリ値 → ドメイン型」の変換だけを行い、`domain/` は外部 import ゼロ・副作用ゼロ。方位・距離・鮮度・精度区分・到着判定・回転角はすべて `domain/` の純粋関数 | §14 の依存ルールをレビューで確認＋`domain/**` に `import` 文が domain 内のみであることを目視/検査。domain 関数は Jest で直接テスト | FR-04, FR-05, FR-12 / NFR-03 |
| 2 | **Mock センサーで PC 上で再現可能** | 5 つのポート（§4）＋ Mock アダプタ（手動値・シナリオ再生・時間加速）。Jest では `FakeClock` + 明示ステップで決定論的に再現。UI から Mock モード切替 | FR-10 の受け入れ基準を Mock シナリオ＋Jest で検証（§12） | FR-10 / NFR-10 |
| 3 | **BLE 将来連携のためのインターフェース分離** | `LocationProvider` / `HeadingProvider` を「取得元を問わない契約」として定義。UI・hooks は**取得元の型を一切知らない**（`import` 構造で保証）。BLE 実装は同じ契約を満たすだけ | FR-12 の受け入れ基準「UI 層が具体的な取得元に依存していない」を import レビューで確認 | FR-12 |
| 4 | **方位計算と境界条件に単体テスト必須** | `domain/` はすべて純粋関数として切り出し、E-01〜E-15 を専用ファイルでテスト（§12.3 のマトリクス） | `npm test`（`jest --runInBand`）が常時 PASS。カバレッジ目標: domain 100% | FR-04, FR-05, NFR-04 |
| 5 | **精度・鮮度を表示・記録できる** | `accuracy.ts` / `freshness.ts` の区分関数＋`constants.ts` の閾値一元管理＋`SampleLogRepository`（リングバッファ 300 件）。区分コードを返し、日本語文言は `ui/labels.ts` に集約 | 境界値テスト（3s / 10s / 30s、10m / 30m）と記録上限テスト | FR-08, FR-09 / NFR-08 |
| 6 | **バックエンドを使用しない** | `fetch` / `axios` / WebSocket / 外部 API を一切使わない。永続化は AsyncStorage のみ、地図はオプション（地図タイルは Google/Apple の地図 SDK が取得するが、アプリコードは通信しない） | コードレビューで `fetch` `XMLHttpRequest` `WebSocket` `axios` の 4 語を grep（0 件） | NFR-01, NFR-02, NFR-09 |
| 7 | **未確認のライブラリ API を想像で実装しない** | §0.2 の確認状況表＋§18 の検証チェックリスト。⚠️ 未確認 API は「アダプタ 1 ファイル」または「オプション画面 1 ファイル」に隔離し、ダメでもアプリが壊れないフォールバックを必須化 | 実装タスクの完了条件に「使用 API の出典節を PR コメントに記載」を含める | NFR-06 |

---

## 2. 全体像

### 2.1 レイヤ構成図と各レイヤの責務

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ App.tsx  【コンポジションルート】                                              │
│  ・具体実装（Clock / Repository / Provider）を生成し props で注入する          │
│  ・ロジック・計算・分岐は書かない（判断は domain / hooks、表示は ui）           │
└──────────────┬───────────────────────────────────────────┬───────────────────┘
               │ 実装を注入                                 │ 表示関数を注入
      ┌────────▼───────────┐                    ┌──────────▼───────────────────┐
      │ hooks/             │   NavState         │ ui/                          │
      │  useNavApp()       │───────────────────▶│  screens/ components/        │
      │  useReducer        │   （純粋セレクタで   │  labels.ts theme.ts          │
      │  状態の唯一の保持者  │    算出した表示用値） │  （表示のみ。計算しない）      │
      └────────┬───────────┘                    └──────────┬───────────────────┘
               │ domain の純粋関数を呼ぶ                     │ 型・区分コードのみ
      ┌────────▼───────────┐                               │
      │ domain/  【純粋】    │◀──────────────────────────────┘
      │  副作用ゼロ          │
      │  外部ライブラリ依存ゼロ│
      └────────▲───────────┘
               │ 型のみ（interface を import）
      ┌────────┴───────────┐
      │ ports/ 【契約】      │  interface / type の定義のみ
      └────────▲───────────┘
               │ implements
      ┌────────┴──────────────────────────────────────────────────────────────┐
      │ adapters/                                                             │
      │  expo/    : expo-location を購読し SensorFix / HeadingFix へ変換        │
      │  storage/ : AsyncStorage へ目的地・サンプルログを保存                   │
      │  clock/   : SystemClock（単調時計＋壁時計）/ FakeClock（テスト用）        │
      │  memory/  : InMemory 実装（テスト・開発用）                             │
      │  mock/    : MockLocationProvider / MockHeadingProvider / シナリオ制御   │
      └───────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ ネイティブ境界（唯一の OS 依存点）
                        expo-location / AsyncStorage / react-native-maps
```

| レイヤ | 責務（やること） | 責務でないこと（禁止） | 代表ファイル |
|---|---|---|---|
| `domain/` | 方位・距離・角度正規化・鮮度/精度区分・到着判定・回転角・表示整形・入力検証・リングバッファ・シナリオのサンプリング。**すべて純粋関数** | I/O・時刻取得・乱数・文言・`react-native` 依存 | `bearing.ts` / `nav.ts` / `freshness.ts` ほか |
| `ports/` | 取得元・保存先・時計・Mock 制御の**契約**（型と interface のみ） | 実装・既定値・分岐 | `location.ts` / `clock.ts` ほか |
| `adapters/` | 外部ライブラリとの境界。ライブラリ値をドメイン型へ変換、不正値の遮断、購読/解除、保存、Mock 供給 | ビジネス判定（到着・警告・区分）、文言作成 | `ExpoLocationProvider.ts` / `AsyncStorage*Repository.ts` / `Mock*` |
| `hooks/` | 状態の唯一の保持者（`useReducer`）。起動・権限・購読ライフサイクル・永続化のオーケストレーション。純粋セレクタで `NavState` を導出 | 表示、`adapters` の直接呼び出し（ポート型のみ受ける） | `useNavApp.ts` / `navReducer.ts` / `selectors.ts` |
| `ui/` | `NavState` と文言の描画、入力受付、画面遷移の見た目 | 方位・距離・鮮度の再計算、取得元（`adapters`）の import | `MainScreen.tsx` / `Bird.tsx` / `labels.ts` |
| `App.tsx` | 具体実装（Clock/Repository/Provider）の生成と注入、画面 state の保持 | 計算・判定・表示ロジック | コンポジションルート |

> **依存の向きは常に内側（`domain`）へ**。`domain` は誰にも依存しない。循環依存は禁止。

### 2.2 依存ルール（許可される import の向き）

| from \ to | domain | ports | adapters | hooks | ui | 外部ライブラリ |
|---|---|---|---|---|---|---|
| `domain/` | ✅ | ❌ | ❌ | ❌ | ❌ | **❌（`react-native` も import しない）** |
| `ports/` | ✅（型のみ） | ✅ | ❌ | ❌ | ❌ | ❌ |
| `adapters/` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅（expo-location / AsyncStorage のみ） |
| `hooks/` | ✅ | ✅ | **❌** | ✅ | ❌ | ⚠️ 最小限（`react` のみ。RN コンポーネントは import しない） |
| `ui/` | ✅（型・純粋関数） | ✅（型のみ） | **❌** | ❌ | ✅ | ✅（`react-native` / `react-native-svg` / `react-native-maps`※地図画面のみ） |
| `App.tsx` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**禁止事項（レビューで確認）**
- `domain/` が `react-native` / `expo-location` / `AsyncStorage` を import すること。
- `ui/` が `adapters/` を import すること（取得元への依存禁止＝FR-12）。
- `hooks/` が `adapters/` を import すること（ポート型だけで受ける）。
- `ui/` で方位・距離・鮮度を**再計算**すること（必ず domain の結果を表示する）。
- `react-native-maps` の import が `ui/screens/MapScreen.tsx` 以外に漏れること（Web バンドル事故防止）。

> **強制方法**: ESLint 等の追加依存は導入しない（§付録A）。**コードレビュー + 任意の import 検査**で担保する。検査を自動化する場合は `node scripts/check-imports.mjs`（純 Node・追加依存なし）を任意タスクとして置く（§17 P10）。Jest で実現する案は、jest-expo 環境で `fs` が使えるか ⚠️ 未確認のため採用しない。

### 2.3 データフロー（1 更新サイクル）

```
[位置]
expo-location watchPositionAsync
  → ExpoLocationProvider（アダプタ）
     ・coords の有限性/lat lon 範囲を検証
     ・Clock.nowMonotonicMs() で受信時刻を付与
     ・mapLocationReading()（domain の純粋変換）
  → SensorFix
  → dispatch({ type: 'sensor/location', fix })
  → navReducer（純粋）: state.location を差し替え
  → selectNavState(state, thresholds)（純粋）
     ・距離（haversine）・目標方位（大円 initial bearing）
     ・鮮度（nowMonotonicMs - receivedAtMonotonicMs）
     ・精度区分・到着判定・警告コード
  → NavState
  → ui: 鳥の回転角・距離・ステータス文言を描画

[方位] 同様に HeadingFix → state.heading → NavState.relativeBearingDeg
[時計] 1 秒ごとの tick → dispatch({ type: 'tick' }) → 鮮度の再計算（データが止まっても「古い」に変わる）
```

### 2.4 起動シーケンス

```
App.tsx
 ├─ SystemClock / AsyncStorage リポジトリ / 実センサープロバイダを生成
 └─ <Root showDevTools={__DEV__} deps={...} />
        └─ useNavApp(deps) が起動時に順に実行:
             1. destinations.list() + readSelection() を並列実行 → dispatch('boot/completed')
                （空ならプリセットを投入: D-07）
             2. permission = locationProvider.getPermissionState()
             3. 'undetermined' かつ canAskAgain なら requestPermission() → dispatch('permission/changed')
             4. granted のときのみ:
                  a. getLastKnown() → あれば dispatch('sensor/location')（即時に前回値を表示）
                  b. locationProvider.start(onFix, onError) → unsubscribe を保持
                  c. headingProvider.isAvailable() → true なら start(...)
             5. sampleLog.load() → dispatch('samples/loaded')
             6. 1 秒ティッカー開始 → dispatch('tick', nowMonotonicMs)
アンマウント時: unsubscribe（位置・方位） / ティッカー停止 / sampleLog.flush()
```

### 2.5 実行時状態機械（全体）

```
        ┌──────────┐  目的地なし
        │  boot    │──────────────▶ no-destination
        └────┬─────┘                    │ 目的地選択
             │ boot 完了                 ▼
             │                    ┌──────────────┐  位置なし/古い
             ├───────────────────▶│  locating    │◀──────────────┐
             │                    └──────┬───────┘                │
             │                           │ 位置あり                │ lost
             │                           ▼                       │
             │                    ┌──────────────┐  方位不明/未取得 │
             ├───────────────────▶│ heading-unknown│──────────────┤
             │                    └──────┬───────┘                │
             │                           │ 方位あり                │
             │                           ▼                       │
             │                    ┌──────────────┐  距離 < 10m     │
             └───────────────────▶│  navigating  │──────────────▶ arrived
                                  └──────────────┘
```
※ 状態の優先順位・警告の合成規則は §6.8 で厳密に定義する（この図は概要）。

---

## 3. データモデル

### 3.1 単位の約束

| 概念 | 単位 | 型 | 備考 |
|---|---|---|---|
| 緯度・経度 | **度（decimal degrees）** | `number` | WGS84。緯度 `[-90, 90]`、経度 `[-180, 180]` |
| 方位（target/heading/relative） | **度** | `number` | target / heading は `[0, 360)`、relative は `(-180, 180]` |
| 距離 | **メートル** | `number` | 0 以上。負値は不正 |
| 精度（GPS） | **メートル（半径）** | `number \| null` | `LocationObject.coords.accuracy` の意味（不確かさの半径）。`null` は不明 |
| 精度（コンパス） | **0〜3 の整数レベル** | `0 \| 1 \| 2 \| 3 \| null` | 3=高精度, 2=中, 1=低, 0=校正なし（【確定】notes §2.6） |
| 経過時間・鮮度 | **ミリ秒** | `number` | UI 表示時に秒へ丸める |
| 時刻（記録用） | **Unix epoch ミリ秒** | `number` | 壁時計。`Date` オブジェクトは保存しない（JSON 安全のため） |
| 時刻（鮮度計算用） | **単調増加ミリ秒** | `number` | 起点は不定（0 基準でよい）。差分のみを使う |

### 3.2 型定義（`src/domain/types.ts`）

```ts
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
}
```

**不変条件**
1. 全フィールド `readonly`（`noUncheckedIndexedAccess` 下でも扱いやすいよう配列は `readonly T[]`）。
2. `Date` / `Map` / `Set` / クラスインスタンスを保存型に使わない（JSON 往復で壊れないこと）。
3. `-0` は保持しない（`0` に正規化。§6.3）。
4. `NaN` / `Infinity` をデータモデルに入れない（アダプタ境界で弾く。§5.1 / §11）。

---

## 4. ポート（インターフェース）定義

配置: `src/ports/`（1 ポート 1 ファイル、`index.ts` で再 export）。実装は持たない。

### 4.1 共通型（`src/ports/common.ts`）

```ts
/** 購読解除。冪等（2 回呼んでも安全）であること。 */
export type Unsubscribe = () => void;

/** 取得系で発生しうるエラー。例外を投げずにこの型で通知する。 */
export type ProviderErrorCode =
  | 'permission-denied'      // 位置情報権限が拒否された
  | 'services-disabled'      // 端末の位置情報サービスが OFF
  | 'unsupported-platform'   // 実行環境がその API 非対応（Web のコンパス等）
  | 'unavailable'            // センサーが利用不可（エミュレータ等）
  | 'runtime-error'          // ライブラリがエラーを返した
  | 'invalid-data';          // ライブラリの戻り値が不正（NaN / 範囲外）

export interface ProviderError {
  readonly code: ProviderErrorCode;
  /** UI に出してよい短い説明（日本語）。 */
  readonly message: string;
  /** ライブラリの生メッセージ等（ログ用。UI には出さない）。 */
  readonly detail?: string;
  readonly atMonotonicMs: number;
}

/** 権限の状態。'unavailable' は「その環境では権限概念自体が無い/API が無い」。 */
export interface PermissionOutcome {
  readonly status: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  readonly canAskAgain: boolean;
  /** Android の付与精度（'fine' でなければ高精度 GPS は期待できない）。 */
  readonly androidAccuracy?: 'fine' | 'coarse' | 'none';
}
```

### 4.2 `LocationProvider`（`src/ports/location.ts`）

```ts
import type { SensorFix } from '../domain/types';
import type { PermissionOutcome, ProviderError, Unsubscribe } from './common';

/**
 * 現在地の供給元。実装: ExpoLocationProvider（端末）/ MockLocationProvider（開発）。
 * 将来の BLE 実装もこの契約を満たす（FR-12）。
 *
 * 契約:
 *  - start() は同期的に throw しない。失敗は onError で通知する。
 *  - start() の解決後、onFix が 0 回以上呼ばれる。以降は unsubscribe まで継続する。
 *  - unsubscribe は冪等。呼び出し後は onFix / onError が呼ばれないこと。
 *  - onFix は JS スレッド上で呼ばれる。UI dispatch は軽量に保つ（§7.4）。
 *  - getLastKnown() は「直前の既知位置」を返す。無ければ null。古い値を返す可能性がある。
 */
export interface LocationProvider {
  /** 実装識別子（ログ・開発画面用）: 'expo-location' | 'mock'。 */
  readonly id: string;

  /** 前景位置権限を要求する（ユーザー操作起点）。 */
  requestPermission(): Promise<PermissionOutcome>;

  /** 現在の権限状態を問い合わせる（ダイアログを出さない）。 */
  getPermissionState(): Promise<PermissionOutcome>;

  /** 購読開始。 */
  start(
    onFix: (fix: SensorFix) => void,
    onError: (error: ProviderError) => void,
  ): Promise<Unsubscribe>;

  /** 直前の既知位置（起動直後の即時表示用）。 */
  getLastKnown(): Promise<SensorFix | null>;
}
```

### 4.3 `HeadingProvider`（`src/ports/heading.ts`）

```ts
import type { HeadingFix } from '../domain/types';
import type { ProviderError, Unsubscribe } from './common';

/**
 * 端末方位（コンパス）の供給元。実装: ExpoHeadingProvider / MockHeadingProvider。
 *
 * 重要（【確定】notes §2.6）:
 *  - watchHeadingAsync は Android / iOS のみ。Web では使えない → isAvailable() で false。
 *  - LocationHeadingObject.trueHeading は位置権限が無いと -1 を返す。
 *    → -1（および範囲外/NaN）は「方位不明」として headingDeg=null / reference='unknown' にする。
 *  - 互換のため trueHeading が使えない場合は magHeading にフォールバックし、
 *    reference='magnetic-north' を立てる（D-05）。
 *  - coords.heading（進行方向）は絶対に使わない（混同禁止）。
 *
 * 契約: start / unsubscribe の振る舞いは LocationProvider と同じ。
 */
export interface HeadingProvider {
  readonly id: string;

  /** この環境で方位が取得できる見込みがあるか（Web は false）。 */
  isAvailable(): Promise<boolean>;

  start(
    onFix: (fix: HeadingFix) => void,
    onError: (error: ProviderError) => void,
  ): Promise<Unsubscribe>;
}
```

### 4.4 `Clock`（`src/ports/clock.ts`）

```ts
/**
 * 時刻供給。鮮度計算は単調増加時計のみを使う（requirements §10: 壁時計変更の影響を受けない）。
 * 実装: SystemClock（端末）/ FakeClock（テスト・シナリオ）。
 */
export interface Clock {
  /** 単調増加ミリ秒。差分のみ意味を持つ。巻き戻らないこと。 */
  nowMonotonicMs(): number;
  /** Unix epoch ミリ秒。記録・表示用の壁時計。 */
  nowEpochMs(): number;
}
```

> **注意**: `nowMonotonicMs()` の戻り値の**基準点は不定**（`performance.now()` 相当なら起動時 0、`Date.now()` フォールバックなら epoch）。**絶対値を保存・表示しない**。差分だけを使う。

### 4.5 `DestinationRepository`（`src/ports/destinationRepository.ts`）

```ts
import type {
  Destination,
  DestinationInput,
  DestinationPatch,
} from '../domain/types';

/**
 * 目的地の永続化（FR-01）。実装: AsyncStorageDestinationRepository / InMemory。
 *
 * 契約:
 *  - 入力は呼び出し側で validateDestinationInput() 済みであることを前提とする。
 *    アダプタも防御的に再検証し、不正なら保存せず例外ではなく null / エラー扱いを返す。
 *  - 保存に失敗した場合は例外を投げてよい（呼び出し側 hooks が捕捉して警告表示）。
 *  - 選択状態（現在の目的地）もここで永続化する（再起動後の復元: FR-01）。
 *  - 同一 id の追加は上書きしない（新規生成のみ）。
 */
export interface DestinationRepository {
  /** 保存済み目的地を古い順（作成順）で返す。壊れた要素は読み飛ばす。 */
  list(): Promise<readonly Destination[]>;

  /** 新規追加し、確定した Destination（id・作成時刻入り）を返す。 */
  add(input: DestinationInput): Promise<Destination>;

  /** 部分更新。存在しない id なら null。 */
  update(id: string, patch: DestinationPatch): Promise<Destination | null>;

  /** 削除。選択中の目的地が消えた場合は選択も解除する。 */
  remove(id: string): Promise<void>;

  /** 選択中 id。null = 未選択。 */
  readSelection(): Promise<string | null>;

  /** 選択中 id を保存。null で解除。存在しない id は保存しない（null 扱い）。 */
  writeSelection(id: string | null): Promise<void>;

  /** 全消去（開発用リセット・テスト用）。 */
  clear(): Promise<void>;
}
```

### 4.6 `SampleLogRepository`（`src/ports/sampleLogRepository.ts`）

```ts
import type { SampleLogEntry } from '../domain/types';

/**
 * 精度・鮮度サンプルの記録（FR-09）。実装: AsyncStorageSampleLogRepository / InMemory。
 *
 * 契約:
 *  - リングバッファ（既定 300 件。上限は Thresholds.sampleLogCapacity と一致させる）。
 *  - 上限超過時は「最も古い」ものから捨てる（追加順 = 時系列順）。
 *  - append は非同期。内部で書込をバッチ/デバウンスしてよい（§10.5）。
 *    書込失敗は append の reject で通知する（呼び出し側が警告表示、アプリは継続）。
 *  - list() は古い順 → 新しい順で返す（表示側で reverse する）。
 */
export interface SampleLogRepository {
  /** 起動時に 1 回呼ぶ。保存済みサンプルを返す。壊れた要素は読み飛ばす。 */
  load(): Promise<readonly SampleLogEntry[]>;

  /** 1 件追記（リングバッファ）。 */
  append(entry: SampleLogEntry): Promise<void>;

  /** 保留中の書込を確定させる（アンマウント時・開発画面表示時）。 */
  flush(): Promise<void>;

  /** 現在の内容（古い順）。 */
  list(): Promise<readonly SampleLogEntry[]>;

  /** 全消去。 */
  clear(): Promise<void>;
}
```

### 4.7 `MockSensorController`（開発用・`src/ports/mockSensor.ts`）

```ts
import type {
  GeoPoint,
  HeadingAccuracyLevel,
  HeadingReference,
} from '../domain/types';
import type { Unsubscribe } from './common';
import type { ScenarioId } from '../domain/scenario';

export type MockMode = 'manual' | 'scenario';

/** 開発画面に表示する Mock の現在値。 */
export interface MockSensorSnapshot {
  readonly mode: MockMode;
  readonly manualPoint: GeoPoint | null;
  readonly manualAccuracyM: number | null;
  readonly manualHeadingDeg: number | null;
  readonly manualHeadingAccuracy: HeadingAccuracyLevel | null;
  readonly manualHeadingReference: HeadingReference;
  readonly scenarioId: ScenarioId | null;
  /** シナリオ開始からの経過（時間加速適用後）。 */
  readonly scenarioElapsedMs: number;
  readonly timeScale: number;
  /** 現在位置サンプルが出ているか（GPS 欠損シナリオで false）。 */
  readonly locationPresent: boolean;
  /** 現在方位サンプルが出ているか（方位不明シナリオで false）。 */
  readonly headingPresent: boolean;
}

/**
 * Mock センサーの制御点。開発画面と MockLocationProvider / MockHeadingProvider が共有する。
 * 実装: MockSensorControllerImpl（adapters/mock）。
 *
 * 契約:
 *  - advance(byMs) は「時計を進める」唯一の入口。実アプリでは 100ms 間隔の
 *    ティッカー（アダプタ内部）が呼ぶ。Jest ではテストが明示的に呼ぶ（タイマー不使用）。
 *  - 購読者には snapshot の変更時のみ通知する（値が変わらなければ通知しない）。
 *  - Math.random() を使わない（決定論のため）。
 */
export interface MockSensorController {
  getSnapshot(): MockSensorSnapshot;
  subscribe(listener: (snapshot: MockSensorSnapshot) => void): Unsubscribe;

  setMode(mode: MockMode): void;
  setManualLocation(point: GeoPoint | null, accuracyM: number | null): void;
  setManualHeading(
    headingDeg: number | null,
    accuracy: HeadingAccuracyLevel | null,
    reference: HeadingReference,
  ): void;
  selectScenario(id: ScenarioId | null): void;
  setTimeScale(scale: 1 | 2 | 5 | 10): void;

  /** 時間を進める（シナリオ再生・手動モードのタイマー駆動）。 */
  advance(byMs: number): void;

  /** 手動値・シナリオ経過・モードを初期化する（Mock OFF 時など）。 */
  reset(): void;
}
```

### 4.8 ポートの実装一覧（2 実装以上で契約を担保 = FR-12）

| ポート | 実装 A（実機） | 実装 B（Mock/テスト） | 実装 C（テスト補助） |
|---|---|---|---|
| `LocationProvider` | `ExpoLocationProvider` | `MockLocationProvider` | （不要） |
| `HeadingProvider` | `ExpoHeadingProvider` | `MockHeadingProvider` | （不要） |
| `Clock` | `SystemClock` | `FakeClock` | （不要） |
| `DestinationRepository` | `AsyncStorageDestinationRepository` | `InMemoryDestinationRepository` | （不要） |
| `SampleLogRepository` | `AsyncStorageSampleLogRepository` | `InMemorySampleLogRepository` | （不要） |
| `MockSensorController` | `MockSensorControllerImpl`（本番でも同梱・開発画面のみ操作可） | — | — |

---

## 5. アダプタ設計

### 5.1 `ExpoLocationProvider`（`src/adapters/expo/ExpoLocationProvider.ts`）

**使用 API（すべて【確定】notes §2.3〜2.5）**

| 用途 | API |
|---|---|
| 権限要求 / 取得 | `Location.requestForegroundPermissionsAsync()` / `Location.getForegroundPermissionsAsync()` |
| 継続取得 | `Location.watchPositionAsync(options, callback, errorHandler?)` → `{ remove() }` |
| 直前位置 | `Location.getLastKnownPositionAsync({ maxAge: 30_000 })` |
| サービス状態 | `Location.hasServicesEnabledAsync()` |
| 精度指定 | `Location.Accuracy.BestForNavigation`（=6、既定）/ `Location.Accuracy.High`（=4、省電力プロファイル） |

**watch オプション（設計値）**

```ts
{
  accuracy: Location.Accuracy.BestForNavigation, // 6（【確定】notes §2.5）
  timeInterval: 1000,                            // Android のみ有効（【確定】notes §2.3）
  // distanceInterval は「未確認」（0 の扱いが不明）のため指定しない
}
```
- `timeInterval` は **Android のみ**（公式に Android のみと明記）。iOS の更新頻度は OS 任せ＝**要件の「既定 1 秒程度」は Android で満たし、iOS は実測して調整**（§18-7）。
- `mayShowUserSettingsDialog` は既定 `true` のため指定しない（Android の高精度モード誘導ダイアログ）。
- 取得プロファイル（`navigation` → 6 / `balanced` → 4）と更新間隔は `SETTINGS_DEFAULT`（§6.1）を既定とする。**設定値の永続化は本フェーズでは行わない**（起動時は常に既定値。開発画面から一時的に変更できてもよい）。**数値（4/6）はアダプタ内のマップ表に閉じ込め**、domain には出さない。

**変換手順（`domain/sensorMapping.ts` の純粋関数を呼ぶ）**
1. `location.coords.latitude / longitude` を `Number.isFinite` で検証し、範囲（±90 / ±180）を検証 → 不正なら **onError('invalid-data')** を通知して**サンプルを捨てる**（アプリは落とさない）。
2. `accuracy`: `number` かつ有限かつ `>= 0` のときのみ採用、それ以外は `null`。
3. `capturedAtEpochMs`: `location.timestamp` が有限なら採用、それ以外 `null`（**壁時計が信用できない値でも鮮度計算には影響しない**。鮮度は受信時の単調時計で計算）。
4. `receivedAtMonotonicMs = clock.nowMonotonicMs()` / `receivedAtEpochMs = clock.nowEpochMs()`。
5. `source = 'device'`。

**エラー処理**
- `watchPositionAsync` の `errorHandler(reason: string)` → `{ code: 'runtime-error', detail: reason }` を onError。
- 権限が `denied` の状態で `start()` された場合、内部で `getForegroundPermissionsAsync()` を確認し、`permission-denied` を onError して **watch を張らない**（無駄な購読を避ける）。
- `hasServicesEnabledAsync()` が `false` → `services-disabled` を onError（watch は張らない）。
- **start() は throw しない**（`Promise<Unsubscribe>` を返し、失敗は onError）。

**`getLastKnown()`**: `getLastKnownPositionAsync({ maxAge: 30_000 })` → `null` なら `null`。取得値は同じ変換を通す（`source` は `'device'`。古い値であることは `receivedAtMonotonicMs` が古いことで表現される）。

### 5.2 `ExpoHeadingProvider`（`src/adapters/expo/ExpoHeadingProvider.ts`）

**使用 API（【確定】notes §2.6）**: `Location.watchHeadingAsync(callback, errorHandler?)`、`Platform.OS`（【RN コア】）。

**`isAvailable()`**
```ts
// 設計方針: watchHeadingAsync は Android / iOS のみ（【確定】notes §2.6）。
// それ以外（web 等）は false。API の存在チェックは行わない（型上は常に存在するため）。
if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
return true;
```
> `Platform` 分岐は**このアダプタ 1 箇所に閉じる**（NFR-03）。判定ロジックは純粋関数
> `decideHeadingAvailability({ platform, hasWatchHeading })` に切り出し、domain ではなく
> `adapters/mapping/headingStrategy.ts`（純粋・テスト可能）に置く。テストでは platform を引数で渡す。

**`trueHeading` の扱い（D-05 の実装）** — `domain/sensorMapping.ts` の `mapHeadingReading()`:

```
入力: { trueHeading: number, magHeading: number, accuracy: number }（構造的部分型）
1. accuracy を toHeadingAccuracyLevel() で 0|1|2|3|null に正規化
   （整数でない/範囲外/NaN → null = 「不明」）
2. trueHeading が有限かつ 0 <= trueHeading <= 360 なら:
     headingDeg = normalizeDegrees360(trueHeading), reference = 'true-north'
3. そうでなく magHeading が有限かつ範囲内なら:
     headingDeg = normalizeDegrees360(magHeading), reference = 'magnetic-north'  ← 磁北フォールバック
4. どちらも不可なら:
     headingDeg = null, reference = 'unknown'（UI は「方位不明」＋ニュートラル）
```
- `-1` は「位置権限なし」の意味（【確定】）だが、**防御的に「負値・範囲外・NaN はすべて不明」**として扱う。
- `reference === 'magnetic-north'` のときは UI に**「磁北基準」注記を必ず出す**（FR-03 / D-05）。→ `NavState.headingReference` と警告 `magnetic-reference` で表現。
- `coords.heading`（進行方向）は**参照しない**。`ExpoHeadingProvider` が `watchPositionAsync` の値を方位に使っていないことをコードレビューで確認する。

**更新頻度の制御**: `watchHeadingAsync` には更新間隔のオプションが無い（【確定】notes §2.6）。→ **hooks 側で dispatch を 100ms 間隔に間引く**（§7.4）。アダプタは受信したら即 onFix してよい。

**エラー**: `errorHandler(reason)` → `runtime-error`。`isAvailable()` が false の場合でも `start()` は呼ばれうるため、その場合は `unsupported-platform` を onError して購読を張らない。

### 5.3 アダプタ共通の変換関数（`src/domain/sensorMapping.ts`）

domain に置く理由: **ライブラリの型を import せず「構造的部分型」で受ける**ことで、domain の「外部依存ゼロ」とテスト容易性を両立させる。

```ts
// 構造的部分型（expo-location の型と構造互換。型 import はしない）
export interface LocationReadingLike {
  readonly coords: {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracy: number | null;
  };
  readonly timestamp: number;
}
export interface HeadingReadingLike {
  readonly trueHeading: number;
  readonly magHeading: number;
  readonly accuracy: number;
}

export function mapLocationReading(
  reading: LocationReadingLike,
  receivedAtMonotonicMs: number,
  receivedAtEpochMs: number,
  source: SensorSource,
): SensorFix | null;   // 緯度経度が不正なら null（呼び出し側が invalid-data にする）

export function mapHeadingReading(
  reading: HeadingReadingLike,
  receivedAtMonotonicMs: number,
  receivedAtEpochMs: number,
  source: SensorSource,
): HeadingFix;        // 不正値は null / 'unknown' に落とす（throw しない）

export function toHeadingAccuracyLevel(value: number): HeadingAccuracyLevel | null;
export function decideHeadingAvailability(input: {
  readonly platform: string;
  readonly hasWatchHeading: boolean;
}): 'available' | 'unsupported-platform' | 'missing-api';
```

### 5.4 `SystemClock`（`src/adapters/clock/SystemClock.ts`）

要件 §10「精度・鮮度の判定は端末の単調増加時計を基準」を満たす。

```
nowMonotonicMs():
  1. performance.now() が関数として存在すれば使う（⚠️ RN 上での有無は未確認 §18-4）
  2. 無ければ Date.now() を使い、内部に保持した前回値との max() を返す
     （壁時計が巻き戻っても単調性を保証する）
nowEpochMs(): Date.now()
```
- 実装時に **`performance` の利用可否を 1 度だけ起動時に判定**し、フォールバックへ倒す（機能検出）。
- 単調性は「前回値との max」で担保する（`Date.now()` が NTP で戻るケース対策）。
- `FakeClock`（`src/adapters/clock/FakeClock.ts`）は `advance(ms)` / `setEpoch(ms)` を持ち、テストで自由に時間を動かす。**タイマーを使わない**ため沙箱の子プロセス制約と無関係。

### 5.5 アダプタの禁止事項

- アダプタで**ビジネス判定**（到着判定・警告の決定・鮮度区分）を行わない（domain の責務）。
- アダプタで**文言**を組み立てない（`ui/labels.ts` の責務）。`ProviderError.message` は例外で、これは「原因の短い説明」であり表示文言は `ui/labels.ts` が `code` から生成する。

---

## 6. ドメイン設計（アルゴリズムと判定）

### 6.1 定数（`src/domain/constants.ts`）— 閾値の一元管理（D-08 / D-09）

```ts
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
    readonly freshMaxMs: number;   // これ以下 = fresh（既定 3000）
    readonly agingMaxMs: number;   // これ以下 = aging（既定 10000）
    readonly staleMaxMs: number;   // これ以下 = stale（既定 30000）
  };
  readonly gpsAccuracy: {
    readonly goodMaxM: number;     // これ以下 = good（既定 10）
    readonly fairMaxM: number;     // これ以下 = fair（既定 30）
  };
  readonly arrivalRadiusM: number;      // 既定 10
  readonly sampleLogCapacity: number;   // 既定 300
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  freshness: { freshMaxMs: 3_000, agingMaxMs: 10_000, staleMaxMs: 30_000 },
  gpsAccuracy: { goodMaxM: 10, fairMaxM: 30 },
  arrivalRadiusM: ARRIVAL_RADIUS_M,
  sampleLogCapacity: SAMPLE_LOG_CAPACITY,
};

/** 位置取得プロファイル（アダプタが Location.Accuracy にマップする）。 */
export type AccuracyProfile = 'navigation' | 'balanced';
export const DEFAULT_ACCURACY_PROFILE: AccuracyProfile = 'navigation';
export const SETTINGS_DEFAULT = {
  accuracyProfile: DEFAULT_ACCURACY_PROFILE,
  locationUpdateIntervalMs: LOCATION_UPDATE_INTERVAL_MS,
} as const;
```
- 閾値は **`DEFAULT_THRESHOLDS` の 1 箇所**だけに定義し、`computeNavState` 等へ**引数で注入**する（テストで境界値を動かさず検証できる）。
- 実測後に D-08/D-09 を調整する場合、**このファイルだけ**を変更すればよい。

### 6.2 角度正規化（`src/domain/normalize.ts`）

```ts
export function toRadians(deg: number): number;         // deg * DEG2RAD
export function toDegrees(rad: number): number;         // rad * RAD2DEG

/** [0, 360) へ正規化。非有限は NaN を返す（呼び出し側でガード）。-0 は 0。 */
export function normalizeDegrees360(deg: number): number;

/** (-180, 180] へ正規化。非有限は NaN を返す。−180 は 180 に寄せる。-0 は 0。 */
export function normalizeSignedDegrees(deg: number): number;
```

**参照実装（設計）**

```
normalizeDegrees360(deg):
  if (!Number.isFinite(deg)) return NaN
  let r = deg % 360            // JS の % は被除数の符号を引き継ぐ: -1 % 360 === -1
  if (r < 0) r += 360
  if (r >= 360) r -= 360       // 浮動小数の誤差で 360 になるのを防ぐ
  return r === 0 ? 0 : r       // -0 を 0 に落とす

normalizeSignedDegrees(deg):
  if (!Number.isFinite(deg)) return NaN
  let r = deg % 360
  if (r <= -180) r += 360      // -180 → 180（一意性のため）
  if (r > 180) r -= 360
  return r === 0 ? 0 : r       // -0 → 0
```

**性質（テストで確認する）**
| 入力 | `normalizeDegrees360` | `normalizeSignedDegrees` |
|---|---|---|
| `-0` | `0`（`Object.is(v, -0) === false`） | `0` |
| `0` | `0` | `0` |
| `-180` | `180` | `180` |
| `180` | `180` | `180` |
| `359.999` | `359.999` | `-0.001` |
| `360` | `0` | `0` |
| `540` | `180` | `180` |
| `720` | `0` | `0` |
| `-1` | `359` | `-1` |
| `NaN` / `Infinity` | `NaN` | `NaN` |

> **要件 E-07 の解釈（要確認 → §15.2-1）**: E-07 の「`359.999` はそのまま」は、`(-180, 180]` 正規化では矛盾する（正しくは `-0.001`）。**この記述は `[0, 360)` 正規化（目標方位）についてのもの**と解釈し、テストは両関数を明示的に分けて検証する。要件側の文言修正を提案する。

### 6.3 大円方位（`src/domain/bearing.ts`）

**式（initial bearing / 前向き方位角）**

```
φ1, φ2 : 始点・終点の緯度 [rad]
Δλ     : 経度差 [rad]（= normalizeSignedDegrees(lon2 - lon1) を rad 化）
θ      = atan2( sin Δλ · cos φ2 , cos φ1 · sin φ2 − sin φ1 · cos φ2 · cos Δλ )
bearing = normalizeDegrees360( toDegrees(θ) )
```

```ts
/** 現在地 → 目的地の初期方位。定義できない場合は null（throw しない）。 */
export function initialBearingDeg(from: GeoPoint, to: GeoPoint): number | null;
```

**`null` を返す条件（優先順位順）**
1. `from` / `to` が `isValidGeoPoint()` を満たさない（**E-12**: NaN / ±Infinity / 緯度範囲外 / 経度範囲外）。
2. `from` または `to` の緯度が**極点**（`||lat| - 90| <= POLE_EPS_DEG`）→ **方針: 方位を定義しない**（E-05）。極点では経度の意味が消え、`cos φ = 0` で式が退化するため。
3. 2 点間距離が `SAME_POINT_EPS_M` 未満（**E-01**: 同一地点）。距離は内部で `haversineDistanceM` を呼んで判定する。

**浮動小数点の注意（実装時に守る）**
- 度→ラジアンの変換は**式の直前に 1 度だけ**行い、途中で丸めない。
- 経度差は必ず `normalizeSignedDegrees(lon2 - lon1)` を経由させる（日付変更線 E-03。数値が ±360 を跨いでも三角関数は周期的なので結果は同じだが、**意図を明示し、巨大な角度を trig に渡さない**ことで精度劣化を避ける）。
- 戻り値の最終正規化は `((deg % 360) + 360) % 360` ではなく **`normalizeDegrees360(deg)`** を使う（`%` の符号と `-0` を一箇所で処理するため）。
- `atan2(0, 0)` は `0` を返す（JS 仕様）。同一点は先に弾くので到達しない。
- **`null` と `0` を混同しない**（`null` は「方位なし」、`0` は「真北」）。比較は `=== null`。
- 極点近傍（±89.9°）では `cos φ` が小さいため方位の感度が高い。**有限値を返すこと**を保証し、精度の良し悪しは要件外（E-04）。

**検証ケース（E-06 の注意）**
- 「真北/真南/真東/真西 = 0/180/90/270」を**厳密に**検証するのは **赤道上の点**を使う（例: `(0,0)→(1,0)` = 0、`(0,0)→(0,1)` = 90、`(0,0)→(-1,0)` = 180、`(0,0)→(0,-1)` = 270）。
- 中緯度の「同じ緯度を東へ」は**大円の初期方位が 90° ちょうどにならない**（地球が球のため、initial bearing はわずかに北寄り/南寄り）。したがって E-06 のテストは赤道基準で行い、中緯度は「90° ± 1°」の許容範囲で検証する。**この点を要件の「真東 90°」の解釈として tasks.md に引き継ぐ。**

### 6.4 haversine 距離（`src/domain/distance.ts`）

**式**

```
a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
c = 2 · atan2( √a , √(1 − a) )
d = EARTH_RADIUS_M · c
```

```ts
/** 2 点間の大円距離（m）。不正入力は null。 */
export function haversineDistanceM(a: GeoPoint, b: GeoPoint): number | null;
```

**実装規則**
- `isValidGeoPoint(a) && isValidGeoPoint(b)` を満たさなければ `null`（E-12）。
- 浮動小数誤差で `a` が `[0,1]` をわずかに外れると `√(1−a)` が `NaN` になる（**特に E-02 対蹠点**）。→ **`a` を `[0, 1]` にクランプする**（`a < 0 ? 0 : a > 1 ? 1 : a`）。これにより対蹠点は `c = π`（= 地球半周）の有限値を返す。
- 戻り値は常に有限・`>= 0`（同一地点は `0`）。
- 単位はメートル。表示整形は `formatDistanceM()`（§6.10）が行う。

**既知値（テストの基準）**
- 赤道 1° = `EARTH_RADIUS_M * π / 180` ≈ **111,195.08 m**
- 同一地点 = `0`
- 対蹠点 `(0,0)`↔`(0,180)` ≈ `π * EARTH_RADIUS_M` ≈ **20,015,086.6 m**
- 日付変更線 `(0,179.9)`↔`(0,-179.9)` ≈ `0.2°` 分 = **22,239.02 m**（方位は 90°。E-03）

### 6.5 相対方位（`src/domain/bearing.ts`）

```ts
/** target - heading を (-180, 180] に正規化。どちらかが非有限なら null。 */
export function relativeBearingDeg(
  targetBearingDeg: number,
  headingDeg: number,
): number | null;
// 実装: normalizeSignedDegrees(normalizeDegrees360(target) - normalizeDegrees360(heading))
```
- **意味**: `0` = 目的地は正面（画面上方向）、`+90` = 右、`-90` = 左。
- `-180` は `180` に寄せる（E-07）。`relativeBearingDeg(0, 180) = 180`、`relativeBearingDeg(0, -180) = 180`。
- 出力は常に `(-180, 180]`（プロパティとしてテスト: 乱数 10,000 件で範囲内・同値性を確認）。

### 6.6 鮮度（`src/domain/freshness.ts`）— FR-08 / D-09

```ts
/** 経過 ms を求める。負（タイムスタンプ逆転 E-11）は 0 に丸める。 */
export function elapsedMs(nowMonotonicMs: number, updatedAtMonotonicMs: number): number;

/** 区分。未取得（null 入力）は null。 */
export function classifyFreshness(elapsedMs: number | null, t: Thresholds): Freshness | null;
```

**区分（境界の包含規則を明示）**

| 経過時間 `e`（ms） | 区分 | 文言（`ui/labels.ts`） |
|---|---|---|
| `e === null` | `null` | 未取得 |
| `0 <= e <= 3,000` | `fresh` | 最新 |
| `3,000 < e <= 10,000` | `aging` | やや古い |
| `10,000 < e <= 30,000` | `stale` | 古い |
| `e > 30,000` | `lost` | 途絶 |

- `elapsedMs` は `Math.max(0, now - updated)`。**NaN が混じったら 0**（防御的）。
- **E-10 との差異（要確認 → §15.2-2）**: E-10 は「30 秒前 → lost」と読めるが、FR-08 の閾値（`stale <= 30s`, `lost > 30s`）では 30 秒ちょうどは `stale`。本設計は **FR-08 の数値定義を採用**（境界は上表）。テストは `2,999 / 3,000 / 3,001 / 9,999 / 10,000 / 10,001 / 29,999 / 30,000 / 30,001` を固定値で検証する。
- **テスト容易性（Clock 注入）**: `classifyFreshness` は純粋関数なので `FakeClock` を注入したテストで「実時間を待たずに」境界を検証できる。`elapsedMs` の引数は単調時計の値であり、`Date.now()` を直接使わない（requirements §10）。

### 6.7 精度区分（`src/domain/accuracy.ts`）— FR-08 / D-08

```ts
export function classifyGpsAccuracy(
  accuracyM: number | null,
  t: Thresholds,
): GpsAccuracyClass;

export function classifyHeadingAccuracy(
  level: HeadingAccuracyLevel | null,
): HeadingAccuracyClass;
```

**GPS 精度（`coords.accuracy` = 半径 m）**

| 値 | 区分 | 文言 |
|---|---|---|
| `null` / 非有限 / **`<= 0`** | `unknown` | 不明 |
| `0 < a <= 10` | `good` | 良好 |
| `10 < a <= 30` | `fair` | 普通 |
| `a > 30` | `poor` | 不良 |

> `<= 0` を `unknown` とするのは**【設計判断 ADR-01】**。Android では「未取得」を `0` で返す実装が観測されうるため、`0 m`（完全精度）と区別できない。要件 FR-08 に「不明」区分が存在するので、安全側（不明）に倒す。実測で `0` が正常値として頻出する場合は設定で `0` を `good` に変更できるよう、閾値型に `zeroIsUnknown: boolean` を追加できる拡張余地を残す（現時点では定数コメントで代替）。

**方位精度（`LocationHeadingObject.accuracy` = 0〜3）**

| 値 | 区分 | 文言（確定マッピング） |
|---|---|---|
| `3` | `good` | 良好 |
| `2` | `fair` | 普通 |
| `1` | `poor` | 不良 |
| `0` | `uncalibrated` | 不明（要校正） |
| `null`（または 0〜3 以外の数値） | `unknown` | 不明 |

- ライブラリは `number` を返すが、**0〜3 以外は `null` に落とす**（`toHeadingAccuracyLevel`）。テストで `-1`, `4`, `1.5`, `NaN` を確認。
- `uncalibrated` と `unknown` は UI 文言を分ける（前者は「8 の字に振ってください」等の対処を出す余地）。

### 6.8 ナビ状態の合成（`src/domain/nav.ts`）— 要件の中心

```ts
export interface NavStateInput {
  readonly destination: Destination | null;
  readonly location: SensorFix | null;
  readonly heading: HeadingFix | null;
  /** 鮮度計算に使う現在時刻（単調増加 ms）。 */
  readonly nowMonotonicMs: number;
  /** 方位プロバイダ自体が利用不可（Web・エミュレータ等）。警告の出し分けに使う。 */
  readonly headingUnavailable?: boolean;
}

/** 純粋セレクタ。副作用なし・throw しない。thresholds は既定 DEFAULT_THRESHOLDS。 */
export function computeNavState(
  input: NavStateInput,
  thresholds?: Thresholds,
): NavState;
```

**アルゴリズム（この順序で評価する）**

| 手順 | 条件 | 設定する値 |
|---|---|---|
| 1 | `destination === null` | `distanceM=null`, `targetBearingDeg=null`, `relativeBearingDeg=null`, `status='no-destination'`。鮮度・精度は**計算して表示に使う**（現在地は出せるため） |
| 2 | `location === null` | `distanceM=null`, bearings `null`, `status='locating'`（方位はあるかもしれないが距離がない） |
| 3 | `distanceM = haversineDistanceM(location.point, destination.point)`、`target = initialBearingDeg(...)` | `distanceM` が `null`（不正座標）→ `status='locating'` + `WarningCode` なしで安全に処理 |
| 4 | `distanceM < thresholds.arrivalRadiusM`（**strict**） | `status='arrived'`。`targetBearingDeg` は計算値（`null` のこともある）、`relativeBearingDeg=null` |
| 5 | `locationFreshness === 'lost'` | `status='position-lost'`、`relativeBearingDeg=null`（**鳥はニュートラル**） |
| 6 | `heading === null` または `heading.headingDeg === null` | `status='heading-unknown'`、`relativeBearingDeg=null` |
| 7 | 上記以外 | `status='navigating'`、`relativeBearingDeg = relativeBearingDeg(target, heading.headingDeg)` |
| 8 | 最後に警告コードを合成（下表） | `warnings` を**表示優先度順に整列** |

**警告コードの合成規則**

| 条件 | 警告 |
|---|---|
| `locationFreshness === 'stale'` | `location-stale` |
| `locationFreshness === 'lost'` | `location-lost`（`status='position-lost'` と併用） |
| `headingFreshness === 'stale'` | `heading-stale` |
| `headingFreshness === 'lost'` | `heading-lost` |
| `headingAccuracyClass === 'poor'` または `'uncalibrated'` | `heading-low-accuracy` / `heading-uncalibrated`（該当する方を追加。E-09） |
| `headingAccuracyClass === 'unknown'` かつ `heading !== null` | `heading-low-accuracy` |
| `heading === null` かつ `headingUnavailable === true`（方位プロバイダ自体が利用不可） | `heading-unavailable` |
| `heading.reference === 'magnetic-north'` | `magnetic-reference`（磁北基準の注記） |
| `gpsAccuracyClass === 'poor'` | `gps-low-accuracy` |

- **警告の表示順**は「位置系 → 方位系 → 精度系 → 基準系」の固定順（UI のちらつき防止）。`NavState.warnings` は整列済みで返す。
- `status` は**1 つだけ**返し、付加情報は `warnings` で表現する（画面は `status` + `warnings` を併記）。
- **E-09（方位精度が最低値）**: `relativeBearingDeg` は**計算して返す**（鳥は回転する）が、`heading-low-accuracy` / `heading-uncalibrated` 警告を付ける。要件どおり「回転するが警告を出す」。
- **E-10（位置が古い）**: `stale` は警告のみ、`lost` は `status='position-lost'` かつ `relativeBearingDeg=null`（誤誘導防止のため鳥はニュートラル）。これは要件に明記が無いため**【設計判断 ADR-02】**（§15.3）。

### 6.9 回転角（`src/domain/rotation.ts`）— FR-06 / E-14

UI は「累積回転角（連続値）」を持ち、目標方位へ**最短経路**で補間する。

```ts
/**
 * 前回の累積回転角から、目標の画面角度へ最短経路で向かう「次の累積角度」を返す。
 * previous: 連続値（負も可、360 を超えてもよい）
 * targetScreenDeg: (-180, 180] の相対方位（鳥の向き）
 */
export function nextContinuousAngleDeg(
  previousContinuousDeg: number,
  targetScreenDeg: number,
): number;

/** 見た目が同一の 360° 単位で累積値を巻き戻す（数値の肥大化防止）。 */
export function reduceContinuousAngle(
  continuousDeg: number,
  maxAbsDeg?: number,   // 既定 720
): number;
```

**参照実装（設計）**

```
nextContinuousAngleDeg(prev, target):
  if (!Number.isFinite(prev) || !Number.isFinite(target)) return prev   // 防御
  base  = normalizeDegrees360(prev)                 // 前回の見た目の角度
  delta = normalizeSignedDegrees(target - base)     // 最短差分（-180, 180]
  return prev + delta

reduceContinuousAngle(cont, maxAbs = 720):
  if (!Number.isFinite(cont)) return 0
  while (cont >  maxAbs) cont -= 360
  while (cont < -maxAbs) cont += 360
  return cont
```

**検証（E-14）**

| 前回の見た目 | 新しい target | `delta` | 次の累積値 | 意味 |
|---|---|---|---|---|
| `359°` | `1°` | `+2°` | `361°` | 時計回りに 2°（**-358° の逆回転をしない**） |
| `1°` | `359°` | `-2°` | `-1°` | 反時計回りに 2° |
| `0°` | `180°` | `180°` | `180°` | 一意性規則により +180 |
| `0°` | `-180°` | `180°` | `180°` | `-180` は `180` に寄る |
| `719°` | 任意 | — | `reduceContinuousAngle` で `≤ 720` に収まる | 数値肥大化防止（見た目は同一） |

- **ニュートラル状態**（`relativeBearingDeg === null`）の目標角度は `0°`（上向き）。同じ関数で滑らかに戻す。
- 到着時（`status === 'arrived'`）も目標 `0°`（上向き）にして「到着」を強調する（**【設計判断 ADR-03】**）。

### 6.10 表示整形（`src/domain/format.ts`）

```ts
/** 距離表示。null は '—'。 */
export function formatDistanceM(distanceM: number | null): string;
/** 経過表示（秒）。例: '0 秒', '12 秒'。 */
export function formatAgeMs(ageMs: number | null): string;
/** 方位表示。null は '—'。例: '123°'（整数へ丸め、360 は出さない）。 */
export function formatBearingDeg(bearingDeg: number | null): string;
```

**距離の規則（FR-07 / E-13）**

| 入力（m） | 出力 | 根拠 |
|---|---|---|
| `null` | `'—'` | 未取得 |
| `0` | `'0 m'` | |
| `999.6` | `'1000 m'` | 生値が 1,000 未満なので m 表記（**四捨五入で 1000 になる**。要件の字義どおり） |
| `1000` | `'1.00 km'` | 1,000 以上は km（小数 2 桁） |
| `1500` | `'1.50 km'` | |
| `999.4` | `'999 m'` | |
| 負値 / 非有限 | `'—'` | 防御 |

> **要確認（§15.2-3）**: `999.6 → '1000 m'` は要件の字義どおりだが UX 上は違和感がある。`Math.round` 後の値で km/m を判定する案（`999.6 → '1.00 km'`）は**要件の文言変更**になるため、本設計では字義どおりを採用し、判断を Lead に委ねる（テストは両案を切り替えられるよう、関数 1 箇所に閉じ込める）。

- 方位の表示は整数丸め（`359.6 → '360°'` を避けるため、丸め後 360 になったら `0` にする）。
- 距離の丸めは `Math.round`（四捨五入）。**表示専用であり、内部値は丸めない**。

### 6.11 検証（`src/domain/validation.ts`）

```ts
export function isValidLatitude(lat: number): boolean;    // isFinite && -90 <= lat <= 90
export function isValidLongitude(lon: number): boolean;   // isFinite && -180 <= lon <= 180
export function isValidGeoPoint(p: GeoPoint): boolean;

export interface ValidationResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  /** 失敗理由（UI 文言キー）。 */
  readonly errorKey?:
    | 'name-required'
    | 'name-too-long'
    | 'latitude-invalid'
    | 'longitude-invalid'
    | 'point-invalid';
}

/** 前後空白除去・文字数検査・座標検査を行う。 */
export function validateDestinationInput(
  input: { readonly name: string; readonly point: GeoPoint },
): ValidationResult<DestinationInput>;
```
- 名前: `trim()` 後 1〜50 文字。空白のみは `name-required`。
- `DestinationOrigin` は呼び出し側で付与（現在地由来 / 手入力 / プリセット）。
- **NaN / Infinity / 範囲外**は必ず拒否（FR-01 / E-12）。
- 検証ロジックは純粋なので、UI からも保存前にも同じ関数を使う（二重実装しない）。

### 6.12 リングバッファ（`src/domain/ringBuffer.ts`）— FR-09

```ts
/** 末尾に追加し、容量を超えたら先頭（最古）から捨てる。元配列は変更しない。 */
export function ringPush<T>(buffer: readonly T[], item: T, capacity: number): readonly T[];

/** 容量を満たすよう切り詰める（古いものを捨てる）。 */
export function ringTrim<T>(buffer: readonly T[], capacity: number): readonly T[];
```
- `capacity < 1` は `[]`（防御）。`capacity` が非整数なら `Math.floor`。
- テスト: 300 件で追加 → 301 件目で先頭が消える／`capacity=1`／`buffer` が空／`readonly` 不変（元配列が変わっていないこと）。
- `noUncheckedIndexedAccess` のため、実装では `buffer[0]` を直接使わずスプレッドや `slice` を使う（tasks.md の実装注意）。

---

## 7. 状態管理（hooks + useReducer）

外部状態管理ライブラリは**追加しない**（要件の制約）。React 標準の `useReducer` + `useEffect` のみ。

### 7.1 状態（`src/hooks/navState.ts`）

```ts
import type {
  Destination,
  HeadingFix,
  SensorFix,
  SampleLogEntry,
  NavState,
} from '../domain/types';
import type { PermissionOutcome, ProviderError } from '../ports/common';
import type { ScenarioId } from '../domain/scenario';
import type { Thresholds } from '../domain/constants';

/** アプリ全体の状態（永続化対象ではない「実行時の状態」）。 */
export interface NavAppState {
  /** 起動時ロードが完了したか。 */
  readonly booted: boolean;
  readonly permission: PermissionOutcome | null;
  /** 方位プロバイダが利用不可と判明した（Web/エミュレータ等）。 */
  readonly headingUnavailable: boolean;
  readonly location: SensorFix | null;
  readonly heading: HeadingFix | null;
  readonly destinations: readonly Destination[];
  readonly selectedDestinationId: string | null;
  /** Mock モード ON/OFF（開発ビルドのみ切替可）。 */
  readonly mockMode: boolean;
  readonly scenarioId: ScenarioId | null;
  /** 鮮度計算の基準時刻（tick / 新規フィックスで更新）。 */
  readonly nowMonotonicMs: number;
  readonly samples: readonly SampleLogEntry[];
  /** 直近のエラー（新しい順、最大 10 件）。 */
  readonly errors: readonly ProviderError[];
  /** 永続化の警告（保存失敗など。UI は控えめに表示）。 */
  readonly storageWarnings: readonly string[];
  readonly devToolsVisible: boolean;
  /** 起動時に注入された閾値（リデューサ・セレクタが参照。実行中は不変）。 */
  readonly thresholds: Thresholds;
}
```

**起動時の初期状態**: `booted=false`, それ以外は空/null。目的地のロード完了で `booted=true`。

### 7.2 アクションとリデューサ（`src/hooks/navReducer.ts`）

```ts
export type NavAction =
  | { readonly type: 'boot/completed'; readonly destinations: readonly Destination[];
      readonly selectedDestinationId: string | null; readonly nowMonotonicMs: number }
  | { readonly type: 'permission/changed'; readonly permission: PermissionOutcome }
  | { readonly type: 'sensor/location'; readonly fix: SensorFix }
  | { readonly type: 'sensor/heading'; readonly fix: HeadingFix }
  | { readonly type: 'sensor/reset' }             // Mock 切替時に古い値を破棄
  | { readonly type: 'heading/unavailable' }
  | { readonly type: 'provider/error'; readonly error: ProviderError }
  | { readonly type: 'tick'; readonly nowMonotonicMs: number }
  | { readonly type: 'destination/selected'; readonly id: string | null }
  | { readonly type: 'destination/added'; readonly destination: Destination; readonly select: boolean }
  | { readonly type: 'destination/updated'; readonly destination: Destination }
  | { readonly type: 'destination/removed'; readonly id: string }
  | { readonly type: 'destinations/replaced'; readonly destinations: readonly Destination[] }
  | { readonly type: 'samples/loaded'; readonly samples: readonly SampleLogEntry[] }
  | { readonly type: 'samples/appended'; readonly entry: SampleLogEntry }
  | { readonly type: 'mock/toggled'; readonly enabled: boolean }
  | { readonly type: 'mock/scenario'; readonly scenarioId: ScenarioId | null }
  | { readonly type: 'storage/warning'; readonly message: string }
  | { readonly type: 'errors/cleared' };

/** 純粋リデューサ。Clock・保存・通信を一切呼ばない。 */
export function navReducer(state: NavAppState, action: NavAction): NavAppState;

export function createInitialNavAppState(
  devToolsVisible: boolean,
  thresholds: Thresholds,
): NavAppState;
```

**リデューサの規則**
- **純粋**（同じ state + action で常に同じ結果）。`Date.now()` / `Math.random()` / ストレージ呼び出し禁止。
- `sensor/location`: `nowMonotonicMs = fix.receivedAtMonotonicMs`（未来の tick で上書きしないよう `Math.max`）。
- `destination/removed`: 削除対象が選択中なら `selectedDestinationId=null`。
- `mock/toggled`: `sensor/reset` 相当も同時に行い、`mockMode` を更新。
- `errors`: 最大 10 件。同一 `code` が連続する場合は置き換え（スパム防止）。
- `samples/appended`: リングバッファに積み、`state.thresholds.sampleLogCapacity` を超えたら先頭を落とす（`ringPush` を利用）。

### 7.3 セレクタ

```ts
export function selectSelectedDestination(state: NavAppState): Destination | null;
export function selectNavState(state: NavAppState, thresholds?: Thresholds): NavState;
export function selectLatestError(state: NavAppState): ProviderError | null;
```
- `selectNavState` は `computeNavState()` に**そのまま委譲**する（ロジックの二重実装を禁止）。`thresholds` 省略時は `state.thresholds` を使う。
- `useMemo` の依存は `[state.selectedDestinationId, state.destinations, state.location, state.heading, state.nowMonotonicMs]`。

### 7.4 `useNavApp`（`src/hooks/useNavApp.ts`）

```ts
export interface NavAppDeps {
  readonly clock: Clock;
  readonly locationProvider: LocationProvider;
  readonly headingProvider: HeadingProvider;
  readonly destinationRepository: DestinationRepository;
  readonly sampleLogRepository: SampleLogRepository;
  readonly thresholds: Thresholds;
  readonly devToolsVisible: boolean;
}

export interface NavApp {
  readonly state: NavAppState;
  readonly nav: NavState;
  readonly actions: {
    selectDestination(id: string | null): void;
    addDestination(input: DestinationInput): Promise<boolean>;  // false = 検証エラー
    removeDestination(id: string): Promise<void>;
    useCurrentLocationAsDestination(name?: string): Promise<boolean>;
    toggleMockMode(): void;
    selectScenario(id: ScenarioId | null): void;
    retryPermission(): Promise<void>;
    showSettingsHint(): void;   // 文言表示のみ（外部 API は呼ばない §18-8）
  };
}

export function useNavApp(deps: NavAppDeps): NavApp;
```

**責務（hooks に集約する処理）**

| 処理 | 実装方針 |
|---|---|
| 起動ロード | `destinationRepository.list()` / `readSelection()` / `sampleLogRepository.load()` を並列実行 → `boot/completed` / `samples/loaded` |
| 権限フロー | `getPermissionState()` → 必要なら `requestPermission()` → `permission/changed`（§11.2） |
| 購読ライフサイクル | `useEffect` で `start()`。**アンマウント/依存変化時**に `unsubscribe()`。`start()` の Promise 解決前にアンマウントされた場合は解決直後に `unsubscribe()` する（**race ガード**） |
| 取得値の dispatch | 位置は即時、**方位は 100ms に 1 回へ間引き**（`HEADING_DISPATCH_MIN_INTERVAL_MS`）。間引きは `useRef` の最終 dispatch 時刻で判定 |
| ティッカー | `setInterval(TICK_INTERVAL_MS)` で `tick` を dispatch。**画面がメイン（またはナビ中）のときだけ動かす**（省電力: NFR-07）。停止時は鮮度表示を止めるのではなく、`nowMonotonicMs` を最終値のまま表示（古いと出る） |
| サンプル記録 | 位置フィックス時のみ 1 件 `append`。`locationAgeMs`/`headingAgeMs` は記録時点で計算して**値を固定**（後から再計算しない）。失敗は `storage/warning` |
| 目的地操作 | 検証（`validateDestinationInput`）→ repository → dispatch。**選択状態も `writeSelection` に永続化** |
| 現在地を目的地に | 位置が `null` または `lost` なら **false**（UI はボタン無効＋理由表示） |
| Mock 切替 | 購読を解除 → `sensor/reset` → 新しい provider で再購読。**Mock OFF 時は実プロバイダへ戻す** |
| エラー収集 | `provider/error` を dispatch。権限拒否は `permission` にも反映 |

- **依存注入**: `useNavApp(deps)` はポート型だけを受け取る（`adapters` を import しない）。`App.tsx` が実体を渡す。
- **Mock の制御**: 開発画面は `MockSensorController` を props で受け取り、`setManualLocation` 等を呼ぶ。`useNavApp` は Mock コントローラを**知らない**（Mock プロバイダ経由で値が来る）。これにより「実センサーと Mock の差し替え」が hooks に漏れない。

### 7.5 画面遷移

- 画面遷移は**自前の状態**（`useState<ScreenId>`）で行う。`react-navigation` は追加しない（依存追加の禁止）。
- `App.tsx` が `screen` を保持し、`ScreenSwitcher`（`ui/components`）に渡す。
- 画面復帰時にデータを再計算しない（state は hooks が保持している）。

---

## 8. Mock センサー設計（FR-10 / NFR-10）

### 8.1 なぜ自前モックが必要か（一次情報）

- `expo-location@58.0.20` は `mocks/ExpoLocation.ts` を同梱するが、**全メソッドが空実装**で `Promise<any>` を返すだけ（実質 `undefined`）。位置・方位の**現実的な値を返す公式モックデータは存在しない**（【確定】notes §2.8 / §4.3）。
- したがって「`jest.mock('expo-location')` で公式モックを使う」ことはできず、**自前の Mock 実装（ポート実装）が必要**。
- 本設計の Mock は **ポートの実装**であり、`expo-location` をモックしない。**テスト対象のロジック（domain / hooks）から見て、実センサーとの区別が無い**ことが最大の利点（NFR-10 / FR-12 の「同一の型を満たす」）。

### 8.2 構成

```
開発画面（ui） ──操作──▶ MockSensorController（adapters/mock）
                                │ snapshot 通知
                                ├──▶ MockLocationProvider ──SensorFix──▶ hooks
                                └──▶ MockHeadingProvider  ──HeadingFix─▶ hooks
                 （実アプリでは上記 2 つが ExpoLocationProvider / ExpoHeadingProvider に差し替わる）
```

- `MockSensorControllerImpl` は `Clock` を注入され、`advance(byMs)` で時間を進める。
- **実アプリでの駆動**: アダプタ内部の `setInterval(100ms)` が `advance(100 * timeScale)` を呼ぶ。`timeScale` は 1/2/5/10。
- **Jest での駆動**: テストが `controller.advance(ms)` を明示的に呼ぶ。`jest.useFakeTimers()` は**使わない**（決定論と静寂性のため）。
- `Math.random()` を使わない。ID 生成も `FakeClock` の時刻 + 連番。

### 8.3 手動モード

開発画面で以下を入力できる（`TextInput` + 増減ボタン。**スライダーは追加依存のため使わない** → §付録A-2）。

| 項目 | 入力 | 範囲 |
|---|---|---|
| 緯度 | 数値入力 | `-90`〜`90`（不正は適用せずエラー表示） |
| 経度 | 数値入力 | `-180`〜`180` |
| GPS 精度 | 数値入力 or 選択（5 m / 15 m / 50 m / 不明） | `null` 以上 |
| 方位 | 数値入力 or プリセット（0/90/180/270） | `0`〜`359.9` |
| 方位精度 | 選択（3 / 2 / 1 / 0 / 不明） | 0〜3 / null |
| 方位基準 | 選択（真北 / 磁北） | `true-north` / `magnetic-north` |
| GPS 欠損 | チェック | 位置サンプルを出さない |
| 方位不明 | チェック | `headingDeg=null` を出す |

### 8.4 シナリオ（`src/domain/scenario.ts` — 定義データは純粋、再生はアダプタ）

```ts
export type ScenarioId =
  | 'static'
  | 'straight'
  | 'rotate'
  | 'gps-dropout'
  | 'heading-unknown'
  | 'stale-data';

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

/** 経過 ms 時点のサンプル。step-hold（直前のキーフレームを保持）。 */
export function sampleScenario(scenario: Scenario, elapsedMs: number): ScenarioKeyframe;
/** シナリオをループさせたときの経過（repeat=false なら duration でクランプ）。 */
export function scenarioPhaseMs(scenario: Scenario, elapsedMs: number): number;
export const SCENARIOS: readonly Scenario[];
export const DEMO_SCENARIO_ID: ScenarioId;   // 既定: 'static'
```

**シナリオ一覧（設計値。座標は東京駅周辺のダミー値でよい）**

| id | 名称 | 長さ | 内容 | 期待される UI 状態 |
|---|---|---|---|---|
| `static` | 静止 | 60s | 位置固定（精度 8 m）、方位固定 0°、精度 3 | `navigating`、距離が一定、鳥は目的地方向で停止 |
| `straight` | 直進 | 60s | 500ms ごとに目的地へ一定歩行（約 1.4 m/s。緯度経度を 0.0000126° ずつ変化） | 距離が減少、`arrived` に遷移（<10 m） |
| `rotate` | 回転 | 60s | 位置固定、方位を 30° ずつ 12 フレームで 1 周（0→330→0） | 鳥が最短経路で回転（359→1 で逆回転しない） |
| `gps-dropout` | GPS 欠損 | 30s | 0〜5s 位置あり → 5〜15s `location: null` → 15s 以降復帰 | 一時的に `position-lost`/`locating`、復帰後に `navigating` |
| `heading-unknown` | 方位不明 | 30s | 位置あり、`headingDeg: null` 固定 | `heading-unknown`、鳥ニュートラル、理由表示 |
| `stale-data` | 古いデータ | 45s | 0s に 1 度だけ位置・方位を出し、以降 `stallAfterMs=1_000` で停止 | 鮮度が aging → stale → lost、`position-lost` 警告 |
| `low-accuracy`（任意） | 精度不良 | 30s | 位置精度 50 m、方位精度 0 | `gps-low-accuracy` + `heading-uncalibrated` 警告 |

- **`static` だけでは E-10 を再現できない**ため、`stale-data`（サンプル停止）と `gps-dropout`（サンプル欠損）を**別シナリオとして区別**する。前者は「値はあるが古い」、後者は「値が来ない」。
- シナリオは**データ**として定義し、再生ロジック（`sampleScenario`）は純粋関数なので、Jest で全フレームを検証できる（`for (let t = 0; t <= duration; t += 100)` で状態遷移を確認）。

### 8.5 PC（Jest / Expo web）での再現方法

| 環境 | 方法 | 状態 |
|---|---|---|
| **Jest** | `MockLocationProvider` / `MockHeadingProvider` + `FakeClock` + `advance()`。タイマー不使用。`useNavApp` はテストしない（RNTL 未導入のため）が、**リデューサ / セレクタ / シナリオ / マッピングは全テスト可能** | ✅ 追加依存なしで可能 |
| **Expo web** | `mockMode` を ON にし、`MockLocationProvider` を使用。ただし Web バンドルには `react-dom` / `react-native-web` / `@expo/metro-runtime` が必要（**未インストール**）→ **【要承認】§付録A-1** | ⚠️ 依存追加なしでは不可 |
| **実機（Android）** | `expo.dev/go` の SDK 58 版 Expo Go + `npx expo start`。方位が取れない場合は Mock へ | 実機準備待ち（D-04） |

> 要件 FR-10 の受け入れ基準は「PC（**Expo web / Jest**）上で全画面が動作」。**Jest だけでは「全画面」の目視確認はできない**が、要件 §8-3 の「Mock モードで PC 上に同じ挙動を再現できる（**Expo web または Jest**）」は Jest で充足可能。UI の目視確認まで行う場合は web 依存 3 点の追加承認が必要（§付録A-1）。**この判断は Lead に委ねる（§18-14）**。

---

## 9. UI 設計

### 9.1 画面一覧（要件 §7 に対応）

| 画面 | ファイル | 表示内容 | 使うポート/状態 |
|---|---|---|---|
| メイン（ナビ） | `ui/screens/MainScreen.tsx` | 鳥（中央・回転）、目的地名、距離、相対方位の数値、精度・鮮度ステータス、警告、Mock 切替（開発時のみ）、地図への遷移 | `NavState` のみ（props） |
| 目的地リスト | `ui/screens/DestinationListScreen.tsx` | 一覧・選択・削除 | `NavAppState.destinations`, actions |
| 目的地追加 | `ui/screens/DestinationAddScreen.tsx` | 名前・緯度・経度入力、「現在地を使う」 | actions（検証は domain） |
| 地図（オプション） | `ui/screens/MapScreen.tsx` / `MapScreen.web.tsx` | MapView（native）/ フォールバック（web） | `NavState`, 現在地・目的地 |
| 開発用（記録） | `ui/screens/DevLogScreen.tsx` | サンプル一覧、平均精度・古いサンプル率、シナリオ選択、Mock 手動入力 | `MockSensorController`, `samples` |

> 画面コンポーネントは**表示専用**（presentational）。データは `App.tsx` から props で渡し、操作はコールバックで返す。`ui/` は `hooks/` を import しない（§2.2）。

### 9.2 メイン画面レイアウト

```
┌──────────────────────────────────────┐
│ 目的地: 東京駅              [変更]   │  ← 目的地名（未設定なら「目的地を選んでください」）
├──────────────────────────────────────┤
│                                      │
│               ▲                      │
│              ╱ ╲                     │  ← 鳥（SVG）。相対方位の方向を向く
│             ╱   ╲                    │     上 = 目的地の方向
│            ╱     ╲                   │
│                                      │
│              1.24 km                 │  ← 距離（FR-07）
│              123°                    │  ← 相対方位の数値（FR-08: 数値で出す）
│     「目的地は右後ろ」               │  ← 相対方位の文言（任意。数値の補助）
├──────────────────────────────────────┤
│ 総合状態: ナビゲーション中            │  ← status の文言（FR-08）
│ 位置: 8 m（良好）  最新（1 秒前）      │  ← 精度 + 鮮度（数値＋文言 + 経過秒）
│ 方位: 2（普通）    最新（0 秒前）真北  │  ← 方位精度 + 基準
│ ⚠ 磁北基準です                        │  ← warnings
├──────────────────────────────────────┤
│ [目的地] [地図] [記録]   [Mock: OFF]  │  ← ナビゲーション
└──────────────────────────────────────┘
```

### 9.3 鳥の描画と回転

**マスコットは「オオハシ（トゥーカン）」**（2026-10-30 ユーザー決定）。**大きなクチバシが目的地の方向を指す**のが本アプリの視覚的アイデンティティ。クチバシが画面上（0°）を向いた状態を基準に描き、`Animated.View` の rotate で全体を回す。

**構造（`ui/components/Bird.tsx`）**

```tsx
// 設計スケッチ（実装は tasks.md のタスクで行う）
// パスデータは designer 提供の ui/components/toucanPaths.ts（viewBox 0 0 100 100、クチバシ上向き）
<Animated.View style={{ transform: [{ rotate: rotateInterpolation }] }}>
  <Svg width={w} height={h} viewBox="0 0 100 100">
    {TOUCAN_PATHS.map((p) => <Path key={p.id} d={p.d} fill={p.fill} />)}
  </Svg>
</Animated.View>
```

- **`react-native-svg` 15.16.0 の API は確認済み**（[svg-and-animation.md](docs/research/svg-and-animation.md)）: `Svg` の `width`/`height`/`viewBox`、`Path` の `d`/`fill`/`stroke`/`strokeWidth` 等を使用可。**SVG の props に `Animated.Value` を渡してはならない**（値を文字列化する実装のため解釈されない）。回転は必ず外側の `Animated.View`。

- **回転は `Animated.View` の `transform: rotate` で行う**（RN コア）。SVG 要素の `transform` 属性による回転は**採用しない**（`react-native-svg` の API が ⚠️ 未確認のため。§18-1）。SVG は**図形描画のみ**に使う。仮に `react-native-svg` の `transform` props が実装時に確認できても、毎フレームの再レンダリングが必要になり `Animated.Value` + `Animated.View` より重いため、回転は外側の `Animated.View` に任せる。
- **角度の持ち方**: `Animated.Value` に「累積回転（度）」を持たせる。`nextContinuousAngleDeg()`（§6.9）で目標値を決め、`Animated.timing(value, { toValue, duration: 250, easing, useNativeDriver: true })` で遷移。
- **補間**: `value.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] })`。RN の `interpolate` は範囲外を**線形外挿**するため `361deg` も連続的に表現できる想定だが、⚠️ **外挿挙動は実装時に目視確認する**（§18-2）。確認できない場合は `reduceContinuousAngle()` で `±720°` 以内に収め、`inputRange: [-720, 720]` の 1 本の補間でカバーする。
- **回転方向**: `relativeBearingDeg` の `+` を**時計回り**として扱う（`+90` = 右）。RN の `rotate` は正が時計回り（CSS 準拠）だが、**実機/PC で目視確認する**（§18-3）。
- **ニュートラル**: `relativeBearingDeg === null` のとき目標 `0°`（上向き固定）。到着時も `0°`。
- アニメーションは **`Animated` のみ**（`react-native-reanimated` は追加依存になるため使わない → §付録A-3）。
- 初回マウント時はアニメーションせず即時設定（`Animated.Value` の初期値にしてちらつきを防ぐ）。

**SVG 部分の注意**
- 鳥は「上向き」を 0° とする。図形は viewBox 内で上向きに描く（回転は外側で行う）。
- `fill` 等の色はテーマ（`ui/theme.ts`）から取る。
- ⚠️ `react-native-svg` の具体的な props（`Svg` / `Path` / `G` / `Circle`）は**一次情報未確認**。実装タスクの最初に公式ドキュメントで確認し、使う要素を最小限（`Svg`, `Path`, `Circle` 程度）に限定する。**確認できない場合は `View` の組み合わせで代替**する（鳥の品質は落ちるが要件は満たす）。

### 9.4 ステータス表示（FR-08 / NFR-08）

表示項目（**すべて「数値 + 文言」で、色だけに依存しない**）:

| 項目 | 例 | データ源 |
|---|---|---|
| GPS 精度 | `8 m（良好）` / `— （不明）` | `gpsAccuracyClass` + 生値 |
| GPS 鮮度 | `最新（1 秒前）` / `古い（25 秒前）` | `locationFreshness` + `locationAgeMs` |
| 方位精度 | `2（普通）` / `0（要校正）` / `—（不明）` | `headingAccuracyClass` |
| 方位鮮度 | `最新（0 秒前）` | `headingFreshness` + `headingAgeMs` |
| 方位基準 | `真北基準` / `磁北基準` | `headingReference` |
| 総合状態 | `目的地を選んでください` / `測位中` / `方位不明` / `データが古い` / `ナビゲーション中` / `到着` | `status` |
| 警告 | `⚠ 磁北基準` / `⚠ 方位が不安定` / `⚠ GPS 精度が不良` | `warnings` |

- 文言は `ui/labels.ts` の純粋関数に集約（テスト可能・国際化の余地）:
  ```ts
  export function navStatusLabel(status: NavStatus): string;
  export function freshnessLabel(f: Freshness | null): string;
  export function gpsAccuracyLabel(c: GpsAccuracyClass): string;
  export function headingAccuracyLabel(c: HeadingAccuracyClass): string;
  export function headingReferenceLabel(r: HeadingReference): string;
  export function warningLabel(w: WarningCode): string;
  ```
- 色は補助（テーマに `good/fair/poor/unknown` の 4 色を定義）。**文字ラベルを必ず併記**。
- アクセシビリティ: 鳥のコンテナに `accessibilityLabel`（例: 「目的地は右方向」）と `accessibilityRole="image"` を付ける（【RN コア】）。文字は `allowFontScaling` 既定のまま。

### 9.5 到着判定（FR-06 / E-01）

- `distanceM < thresholds.arrivalRadiusM`（**strict、既定 10 m 未満**）で `status='arrived'`。
- 到着時: 距離表示は実値（例 `3 m`）、鳥は上向き、`到着` を大きく表示、相対方位は非表示（`—`）。
- 境界のテスト: `9.999 → arrived` / `10.0 → navigating`（要件の「10 m 未満」に一致）。
- 到着後も位置更新は継続し、`distance >= 10 m` になれば `navigating` に戻る（ヒステリシスは設けない＝要件に無い）。

### 9.6 地図画面（FR-11 / D-03）

**ファイル分割（Metro のプラットフォーム解決を利用）**

| ファイル | 対象 | 内容 |
|---|---|---|
| `ui/screens/MapScreen.tsx` | Android / iOS | `react-native-maps` の `MapView` + `Marker` |
| `ui/screens/MapScreen.web.tsx` | Web | 地図を import しない**フォールバック**（「Web では地図を表示できません」＋方位サマリ＋戻るボタン） |

- **`MapScreen.web.tsx` は `react-native-maps` を import しない**（`MapView.web.ts` が `UnimplementedView` を返すことによる事故を避ける）。
- native 側で使用する props（すべて【確定】notes §3.3 / §3.4）:
  - `MapView`: `initialRegion`（マウント時のみ）、`showsCompass`、`showsMyLocationButton`、`liteMode`（任意・Android のみ）
  - `Marker`: `coordinate`, `title`, `identifier`（現在地用・目的地用）
- **`showsUserLocation` は使わない**（【確定】権限が無いと**無言で失敗**するため）。現在地は**自前の `Marker`** を `SensorFix` から描画する。
- **Google Maps API キー**: Expo Go では不要（【確定】）。カスタムビルドでは必須で、無いと**空白/グレー**（クラッシュではない、README 記載）。空白を検知する API は無いため、**画面に「地図が表示されない場合は API キー未設定です」注記**を常設し、`[方位表示に戻る]` を出す（アプリは壊れない）。キー注入は `app.config.ts` + 環境変数が必要になるが、`process` の型（`@types/node`）が無いため **現時点では実装しない（§付録A-4）**。
- `Region` 計算は純粋関数 `ui/mapRegion.ts` の `regionForPoints(a, b): { latitude, longitude, latitudeDelta, longitudeDelta }` として切り出し、テスト可能にする。既定 `latitudeDelta = max(|Δlat| * 2.5, 0.005)` 等、最小ズームを保証する。
- 現在地が無い場合は地図を開かずフォールバック文言を出す（`MapScreen` 内でも `location === null` をガード）。

### 9.7 開発用画面（FR-09 / FR-10）

- サンプル一覧: 直近 20 件（`samples` の末尾）を表形式で表示。列: 時刻（HH:MM:SS）、緯度、経度、GPS 精度、方位、方位精度、位置経過、方位経過。
- 簡易集計（純粋関数 `summarizeSamples(entries)`）:
  - 平均 GPS 精度（`null` 除外、件数表示）
  - 方位精度の分布（0〜3 の件数）
  - 古いサンプル率（`locationAgeMs > staleMaxMs` の割合）
- シナリオ選択（ラジオ風のボタン群）、手動入力、`Mock ON/OFF`、時間加速（×1/×2/×5/×10）。
- 表示は `devToolsVisible`（`App.tsx` で `__DEV__` から決定）のときのみ。**リリースビルドでは操作 UI を出さない**が、コードは同梱（サイズ影響は無視できる）。

### 9.8 テーマ・スタイル

- `ui/theme.ts` に色・余白・文字サイズ・区分色を定義（`StyleSheet` は【RN コア】）。
- `react-native-safe-area-context` 等は追加しない → `View` の `paddingTop` と `StatusBar` で対応する。
- ダークモードは対象外（`app.json` は `userInterfaceStyle: "light"`）。要件外。

---

## 10. 永続化設計（FR-01 / FR-09 / D-11）

### 10.1 ストレージキー

| キー | 内容 | サイズ見積り |
|---|---|---|
| `yoridorimidori/destinations/v1` | `{ schemaVersion: 1, items: Destination[], selectedId: string \| null }` | 100 件 × 約 150 B ≒ 15 KB |
| `yoridorimidori/samples/v1` | `{ schemaVersion: 1, items: SampleLogEntry[] }`（リング 300 件） | 300 件 × 約 210 B ≒ **63 KB** |

- **キーに `v1` を含める**。スキーマ変更時は `v2` キーへ移行し、`v1` は読み取りのみ（将来のマイグレーション余地）。
- すべて 1 キー = 1 JSON。**項目をまたいだ整合性は保たない**（目的地と選択 id は同一キー内に入れて整合を保証）。
- **`mockMode` / シナリオ / 取得プロファイルは永続化しない**（起動時は常に OFF・既定プロファイルから開始）。これらは開発用の一時状態であり、再起動後に Mock のまま起動して実センサーを取得しない事故を避けるため。永続化が必要になった場合は `yoridorimidori/settings/v1` を追加する（本フェーズでは**作らない**）。
- **`meta` キーは作らない**（スキーマバージョンは各値の中に持つ。`lastSavedAt` は記録から算出可能）。

### 10.2 スキーマバージョンとマイグレーション

- 読み込み時: `JSON.parse` → 型ガード（`isDestinationArray` 相当の検証）→ `schemaVersion === 1` を確認。
- `schemaVersion` が**未知（>1）**: データを読まず既定値で開始し、上書きしない（将来バージョンのデータを破壊しない）。警告を `storageWarnings` に積む。
- `schemaVersion` が**欠落**: v1 とみなして読む（防御的）。ただし `items` が配列でない等は破損扱い。
- 破損時の**退避**: 壊れた生文字列を `yoridorimidori/quarantine/<key>/<epochMs>` に 1 件だけ退避してから初期化（調査用）。退避も失敗したら単に初期化。

### 10.3 破損データの扱い（落ちないこと優先）

| ケース | 扱い |
|---|---|
| JSON パース失敗 | 全体を破損扱い → 退避 → 既定値。警告表示（開発画面） |
| `items` が配列でない | 同上 |
| 要素の型不正（lat が文字列等） | **その要素だけ読み飛ばす**（他の要素は救う）。`droppedCount` を警告に積む |
| 座標が範囲外/NaN | 要素を読み飛ばす（`isValidGeoPoint`） |
| `selectedId` が `items` に存在しない | `null` に補正 |
| 重複 `id` | 後勝ちを捨てる（先勝ち採用） |
| サンプル件数が容量超過 | 新しい方から容量分だけ残す（`ringTrim`） |
| 未知フィールド | 無視（前方互換） |

### 10.4 書き込み戦略

- **目的地系**: 操作ごとに即時保存（`setItem`）。変更頻度が低いため単純に read-modify-write。**同一リポジトリインスタンス内で Promise チェーンにより直列化**する（`this.queue = this.queue.then(...)`）。
- **サンプルログ**: メモリ上のリングバッファに即時 `push` し、**デバウンス（5 秒）または 20 件ごと**にまとめて `setItem`。`flush()` は保留分を即時に書く。
  - 位置更新 1 秒ごとに 1 件 → 5 秒で 5 件 → 書き込み 1 回。**書き込み回数を抑える**（NFR-07 省電力・フラッシュ寿命）。
  - アプリ終了（アンマウント）時に `flush()` を呼ぶ best effort（確実な終了フックは OS 依存。**失われても最大 5 秒分**と割り切る）。
  - `AppState` によるバックグラウンド検知は **【RN コア】だが必須ではない**（§18-9）。採用する場合は `AppState.addEventListener('change', ...)` で `background` 時に `flush()`（⚠️ 実装時に API 形を確認）。
- **同時書き込みの禁止**: 2 つのリポジトリが別キーを持つため競合しない。同一キー内はキューで直列化。

### 10.5 サイズ制約（AsyncStorage の Android 制限）

- Android: **合計 6 MB / 1 エントリ約 2 MB**（【確定】notes §6.1）。
- 本設計の見積りは **合計 < 100 KB**（§10.1）で、制約に対し十分な余裕がある。
- 防御: `setItem` 前に文字列長を確認し、**200,000 文字を超えたら** サンプルを最新 150 件に切り詰めて保存（異常時の暴走防止）。それでも失敗する場合は `storageWarnings` に積み、アプリは継続。
- **暗号化されない**（【確定】）。保存するのは「目的地の座標・名前」と「センサーの数値ログ」のみで、氏名・連絡先等の機微情報は保存しない。外部送信もしない（NFR-09）。

### 10.6 既定値・プリセット（D-07）

- 初回起動（目的地キーが存在しない）時、`domain/presets.ts` の `DEMO_PRESETS` を投入する（2〜3 件）。例（**デモ用の概値。厳密な駅代表点ではない**）:

  | 名前 | 緯度 | 経度 | 備考 |
  |---|---|---|---|
  | 東京駅 | 35.681236 | 139.767125 | デモ用 |
  | 新宿駅 | 35.689592 | 139.700413 | デモ用（東京駅から約 6.1 km） |
  | 東京タワー | 35.658581 | 139.745433 | デモ用 |

  - テストでは**合成座標**（赤道上の点など）を使い、実在駅の距離は「約 6.1 km ± 0.3 km」の**範囲検証**にとどめる（座標の出所が概値のため）。
- 初回起動時の案内: 「現在地を目的地にする」を目立たせる（FR-01 / D-07）。

---

## 11. エラーハンドリング・権限フロー

### 11.1 原則

1. **落とさない**（クラッシュ・白画面・無言失敗を避ける）。
2. **原因と対処を画面に出す**（日本語・数値＋文言）。
3. **古い値は捨てずに「古い」と明示**する（FR-02）。
4. 例外はアダプタ境界で捕捉し、**型付きの `ProviderError` / 戻り値**に変換する。`throw` は「保存失敗」など回復可能なものに限定。

### 11.2 権限フロー

```
起動
 └─ getPermissionState()
      ├─ 'granted' ───────────────▶ 取得開始（メイン画面へ）
      ├─ 'undetermined' & canAskAgain
      │     └─ requestPermission()
      │            ├─ 'granted' ──▶ 取得開始
      │            └─ 'denied' ───▶ [拒否画面] 理由＋対処＋[Mock で試す][再要求]
      ├─ 'denied' & canAskAgain ──▶ [拒否画面] 再要求ボタンあり
      └─ 'denied' & !canAskAgain ─▶ [拒否画面] 「設定アプリで許可してください」＋[Mock で試す]
                                      （外部設定画面への遷移 API は未確認のため使わない §18-8）
```
- 拒否画面は**メイン画面のステータス領域に常設**する（別画面に飛ばさない。目的地選択は可能なまま）。
- **再要求**はボタン操作起点のみ（自動ループ禁止）。
- Mock モードは権限と独立に動く（拒否されてもデモ可能）。開発ビルドのみ表示。

### 11.3 障害時の扱い一覧

| # | 事象 | 検知 | 状態 | UI 表示 | 回復 |
|---|---|---|---|---|---|
| 1 | 位置権限拒否 | `PermissionOutcome.status === 'denied'` | `permission` に保持、位置購読なし | 「位置情報が許可されていません」＋理由＋対処 | 再要求 / Mock |
| 2 | 位置情報サービス OFF | `hasServicesEnabledAsync() === false` → `services-disabled` | `errors` に追加 | 「位置情報サービスが OFF です」 | ユーザー操作（OS 設定） |
| 3 | watch の実行時エラー | `errorHandler(reason)` | `errors` に追加、**直前値は保持** | 「位置情報の取得でエラー」＋鮮度表示は継続 | 自動では再購読しない（次回起動/再要求） |
| 4 | 位置が古い（stale） | `freshness === 'stale'` | 警告のみ | 「データが古い（25 秒前）」 | 新フィックス待ち |
| 5 | 位置が途絶（lost） | `freshness === 'lost'` | `status='position-lost'`、鳥ニュートラル | 「データが途絶しています」＋経過秒 | 新フィックスで復帰 |
| 6 | 方位が不明（`trueHeading=-1` 等） | マッピングで `headingDeg=null` | `status='heading-unknown'` | 「方位が分かりません」＋Mock 誘導 | 磁北フォールバックがあれば「磁北基準」で継続 |
| 7 | 方位 API 非対応（Web 等） | `isAvailable() === false` | `headingUnavailable=true` | 「この環境では方位を取得できません」＋Mock 誘導 | Mock 手動方位 |
| 8 | 方位精度が低い/校正なし | `accuracy 0/1` | 警告 | 「方位が不安定」/「要校正」 | 8 の字校正を促す文言（文言のみ） |
| 9 | ライブラリ戻り値が不正（NaN/範囲外） | `mapLocationReading() === null` | `invalid-data` エラー、サンプル破棄 | 開発画面のみ警告（通常 UI は直近値を維持） | 次のフィックス |
| 10 | タイムスタンプ逆転（E-11） | `elapsedMs(now, received) < 0` | **0 に丸め**（fresh） | 通常表示 | — |
| 11 | 保存失敗（容量・I/O） | `setItem` の reject | `storageWarnings` | 開発画面に「保存に失敗」 | 次回保存で再試行。サンプルは容量を縮小 |
| 12 | 保存データ破損 | パース/検証失敗 | 破損を退避して初期化 | 開発画面に警告 | 既定値で開始（目的地は再登録） |
| 13 | 目的地の入力不正 | `validateDestinationInput().ok === false` | 保存しない | フィールド下にエラー文言 | 修正して再入力 |
| 14 | 目的地未設定（E-15） | `destination === null` | `status='no-destination'` | 「目的地を選んでください」＋登録導線 | 登録/選択 |
| 15 | 描画時の想定外例外 | React Error Boundary | フォールバック画面 | 「表示中にエラーが発生しました」＋[戻る] | アプリ内で復帰（再マウント） |

### 11.4 Error Boundary（`ui/components/ErrorBoundary.tsx`）

- クラスコンポーネント（`getDerivedStateFromError` / `componentDidCatch`）で `children` を包む（【RN コア】/ React 標準）。
- フォールバックは「エラーが発生しました」＋目的地・記録データが消えない旨＋`[メインに戻る]`（state を初期化して再マウント）。
- 画面単位で包む（`MainScreen` / `MapScreen` は個別）。**地図画面の例外がメインを巻き込まない**ようにする。
- `componentDidCatch` では `console.error` のみ（外部送信しない）。

### 11.5 再購読・クリーンアップの規則

- `start()` の解決前にコンポーネントがアンマウントされた場合:
  ```ts
  let disposed = false;
  let unsub: Unsubscribe | null = null;
  start(onFix, onError).then((u) => {
    if (disposed) { u(); return; }   // 解決直後に解除
    unsub = u;
  }).catch((e) => { if (!disposed) dispatchError(e); });
  return () => { disposed = true; unsub?.(); };
  ```
- Mock 切替時も同じ経路（依存配列に `provider` を含める）。
- **二重購読の禁止**: `unsubscribe` を必ず保持し、再購読前に解除する。

---

## 12. テスト戦略

### 12.1 基盤（既存の `mobile/package.json` をそのまま使う）

| 項目 | 設定 | 状態 |
|---|---|---|
| preset | `"jest": { "preset": "jest-expo" }` | 設定済み |
| `transformIgnorePatterns` | 公式推奨値（`react-native-svg` を含む） | 設定済み |
| テスト実行 | `npm test` = `jest --runInBand` | 設定済み（**沙箱では必須**） |
| 型検査 | `npm run typecheck` = `tsc --noEmit` | 設定済み |
| 一括検証 | `npm run verify` = typecheck + test | 設定済み |
| `tsconfig` の `types` | `["jest"]`（`@types/jest` 30.0.0 を明示。TS 6 系では必須） | 設定済み |
| 追加依存 | **なし**（RNTL 等は追加しない） | — |

### 12.2 テストの配置

```
mobile/src/domain/__tests__/
  normalize.test.ts
  bearing.test.ts
  distance.test.ts
  freshness.test.ts
  accuracy.test.ts
  nav.test.ts
  rotation.test.ts
  format.test.ts
  validation.test.ts
  ringBuffer.test.ts
  sensorMapping.test.ts
  scenario.test.ts
mobile/src/adapters/__tests__/
  systemClock.test.ts
  asyncStorageRepositories.test.ts     // AsyncStorage 公式モック使用
  expoAdapters.test.ts                 // 必要な場合のみ jest.mock('expo-location')
mobile/src/hooks/__tests__/
  navReducer.test.ts                   // 純粋リデューサ（React 不要）
mobile/src/ui/__tests__/
  labels.test.ts                       // 文言の純粋関数
```
- `jest-expo` preset は `**/__tests__/**/*.test.ts(x)` を拾う。**命名は `*.test.ts`** に統一。
- `src/` 配下に置く（`tsconfig` の `include: ["**/*.ts"]` に含まれる）。
- `domain/__tests__` は **React Native を import しない**（`import ... from 'react-native'` を書かない）。これにより jest-expo 環境に依存せず高速に動く。

### 12.3 境界条件テストマトリクス（E-01〜E-15 を全カバー）

| # | ケース | テストファイル | 入力（要点） | 期待 |
|---|---|---|---|---|
| E-01 | 現在地 == 目的地 | `bearing.test.ts` / `nav.test.ts` | `initialBearingDeg(p, p)` | `null`（throw しない） |
| | | `distance.test.ts` | `haversineDistanceM(p, p)` | `0` |
| | | `nav.test.ts` | 目的地 = 現在地 | `status='arrived'`, `distanceM=0`, `targetBearingDeg=null` |
| E-02 | 対蹠点 | `distance.test.ts` | `(0,0)` ↔ `(0,180)` | `≈ π·R`（∓1 m）、**NaN なし** |
| | | `bearing.test.ts` | 同上 | `0 <= θ < 360` の有限値（値は問わない） |
| E-03 | 日付変更線 | `bearing.test.ts` | `(0,179.9)→(0,-179.9)` | `≈ 90°`（東西取り違えなし） |
| | | `distance.test.ts` | 同上 | `≈ 22,239 m` |
| E-04 | 高緯度 ±89.9° | `bearing.test.ts` / `distance.test.ts` | `(89.9,0)→(89.9,10)` 等 | 有限値、`0 <= θ < 360`、NaN なし |
| E-05 | 極点 ±90° | `bearing.test.ts` | `(90,0)→(0,0)` / `(0,0)→(90,0)` | `null`（**方針: 極点は方位不定**） |
| | | `distance.test.ts` | 同上 | 有限値（距離は定義できる） |
| E-06 | 真北/南/東/西 | `bearing.test.ts` | 赤道基準: `(0,0)→(1,0)` 等 | `0 / 180 / 90 / 270`（±1e-9） |
| E-07 | 相対方位の正規化 | `normalize.test.ts` | `-180, 180, -0, 540, 359.999` | 上表のとおり（`359.999→-0.001`） |
| | | `normalize.test.ts` | 乱数 10,000 件 | `(-180,180]` に収まる・`1` 回適用と `2` 回適用が一致 |
| E-08 | 方位不明（`trueHeading=-1`） | `sensorMapping.test.ts` | `{trueHeading:-1, magHeading:123.4, accuracy:2}` | `headingDeg=123.4`, `reference='magnetic-north'` |
| | | `sensorMapping.test.ts` | 両方 `-1` | `headingDeg=null`, `reference='unknown'` |
| | | `nav.test.ts` | `heading=null` | `status='heading-unknown'`, `relativeBearingDeg=null` |
| E-09 | 方位精度が最低値 | `accuracy.test.ts` | `0` / `1` | `'uncalibrated'` / `'poor'` |
| | | `nav.test.ts` | `heading.accuracy=0`, 有効方位 | `relativeBearingDeg` は**非 null**（回転する）、`warnings` に `heading-uncalibrated` |
| E-10 | 位置が古い（30 秒前） | `freshness.test.ts` | `30_000 / 30_001` | `'stale' / 'lost'`（境界規則は §6.6。要件との差異は §15.2-2） |
| | | `nav.test.ts` | `now - received > 30_000` | `status='position-lost'`, `warnings` に `location-lost` |
| E-11 | タイムスタンプ逆転 | `freshness.test.ts` | `elapsedMs(1_000, 2_000)` | `0`（負にしない） |
| | | `nav.test.ts` | `received > now` | `locationFreshness='fresh'`（落ちない） |
| E-12 | NaN / 範囲外座標 | `validation.test.ts` | `NaN, Infinity, 91, -181` | すべて `false` |
| | | `bearing.test.ts` / `distance.test.ts` | 同上 | `null`（クラッシュしない） |
| | | `sensorMapping.test.ts` | `latitude=NaN` の reading | `null` を返す |
| E-13 | 距離の丸め | `format.test.ts` | `999.6` / `1000` / `999.4` / `null` | `'1000 m'` / `'1.00 km'` / `'999 m'` / `'—'` |
| E-14 | 回転の最短経路 | `rotation.test.ts` | `nextContinuousAngleDeg(359, 1)` | `361`（`-358` でない） |
| | | `rotation.test.ts` | `(1, 359)` / `(0, 180)` / `(0, -180)` | `-1` / `180` / `180` |
| | | `rotation.test.ts` | `reduceContinuousAngle(1080)` | `≤ 720` かつ見た目同一（`% 360` 一致） |
| E-15 | 目的地未設定 | `nav.test.ts` | `destination=null` | `status='no-destination'`, 全 bearing/distance `null` |

**追加の必須テスト**

| 対象 | 内容 |
|---|---|
| 鮮度閾値の境界（FR-08） | `2_999 / 3_000 / 3_001 / 9_999 / 10_000 / 10_001 / 29_999 / 30_000 / 30_001` の 9 点 |
| GPS 精度の境界（FR-08） | `null / 0 / 10 / 10.001 / 30 / 30.001` |
| 方位精度の変換 | `0,1,2,3,4,-1,1.5,NaN,Infinity` |
| 到着の境界（FR-06） | `distance = 9.999 / 10.0`（`<` の strict を確認） |
| 距離フォーマット | `0, 0.4, 999.4, 999.5, 999.6, 1000, 1500, 1234.567` |
| リングバッファ（FR-09） | 300 件で満杯 → 301 件目で先頭が落ちる／`capacity=1`／元配列の不変 |
| シナリオ再生 | 各シナリオの全フレーム（100ms 刻み）で `location`/`heading` の有無が期待どおり／`repeat` の折り返し／`stallAfterMs` |
| リデューサ | 各アクション、削除時の選択解除、エラー最大 10 件、`samples/appended` のリング |
| 永続化の破損 | 不正 JSON／型不正要素の読み飛ばし／選択 id の補正／未知 schemaVersion |
| 文言 | 各 `status` / `freshness` / 精度区分に文言がある（空文字なし） |

### 12.4 モックの置き場所（重要）

| 対象 | 方法 | 理由 |
|---|---|---|
| **ドメインのロジック** | モック不要（純粋関数を直接呼ぶ） | 外部依存が無い |
| **Mock センサー** | `MockLocationProvider` / `MockHeadingProvider` + `FakeClock` | 自前実装（§8）。`expo-location` をモックしない |
| **`expo-location`（実アダプタのテストをする場合のみ）** | `jest.mock('expo-location', () => ({ watchPositionAsync: jest.fn(), ... }))` を**テストファイル内にインラインで書く** | 同梱モックは**空実装で使えない**（【確定】）。公式モックデータは存在しない |
| **AsyncStorage** | `mobile/__mocks__/@react-native-async-storage/async-storage.js` を作り、公式モックを再 export（`module.exports = require('@react-native-async-storage/async-storage/jest/async-storage-mock')`） | 公式モックが存在（【確定】）。**`.js` に置くことで `tsc` の型検査対象外**にする（型定義が無いため） |
| **タイマー** | `jest.useFakeTimers()` を**使わない**（`MockSensorController.advance()` で代用） | 決定論・沙箱の子プロセス制約と無関係 |

**`expo-location` の `jest.mock` が必要な範囲を最小化する設計**: 実アダプタは「ライブラリ呼び出し → `mapLocationReading()` 呼び出し」だけの薄い層にする。**変換ロジック（テストの大半）は domain の純粋関数**に置くため、`jest.mock('expo-location')` が無くても品質を担保できる。実アダプタの配線テストは「1 ファイル・数ケース」に留める（沙箱でのテスト時間短縮）。

### 12.5 カバレッジ・実行コマンド

```powershell
cd mobile
npm run typecheck            # tsc --noEmit（エラー 0）
npm test                     # jest --runInBand（全 PASS）
npx jest --runInBand --coverage   # カバレッジ確認（domain 100% 目標）
```
- カバレッジ目標: `src/domain/**` は statements/branches 100%。`adapters/mock/**`・`hooks/navReducer.ts` は 90% 以上。UI は対象外（描画テストをしないため）。
- **沙箱では `--runInBand` が必須**（jest-worker の fork が EPERM。`pc-build-verification.md` §5-5）。`npm test` に組み込み済みなので、生の `npx jest` を使わない。
- テストは**ネットワーク・実センサー・実タイマーに依存しない**。CI（将来）でも同じコマンドで動く。
- `tsc` の注意: `tsconfig` の `types: ["jest"]` により `process` や `require` は**型が無い**。テストで `require` を書かない（`__mocks__` に `.js` を置く方式で回避）。`node` 型を追加する場合は `@types/node` の追加＝【要承認】。

### 12.6 テストを書かない範囲（明示）

| 対象 | 理由 | 代替 |
|---|---|---|
| UI コンポーネントのレンダリングテスト | React 19 は `react-test-renderer` 非対応。`@testing-library/react-native` v14 の追加が必要（【要承認】§付録A-5） | `ui/labels.ts`（文言）と `domain`（値）をテスト。目視確認は Mock/web/実機 |
| 実機のセンサー精度 | 環境が無い（D-04） | Mock + 手動確認。実機導入後に実測 |
| `useNavApp` フックのテスト | レンダリングテストが必要 | リデューサ + セレクタ + ポートの組み合わせで担保。購読ライフサイクルは実機/目視 |
| 地図描画 | 実機/キーが必要 | `MapScreen.web.tsx` のフォールバック文言と `regionForPoints` の純粋関数をテスト |

---

## 13. 非機能要件の実現方法

| NFR | 要件 | 実現方法 | 検証 |
|---|---|---|---|
| NFR-01 | オフライン動作 | 通信 API 不使用。地図タイルはオプション（無くてもコアは動く） | 機内モードで手動確認（実機導入後） |
| NFR-02 | バックエンドなし | `fetch` / `axios` / WebSocket 不使用。`console` 出力のみ | `grep` で 0 件 |
| NFR-03 | Android 先行・iOS 展開可能 | `Platform.OS` 分岐は `adapters/expo/*` と `ui/screens/MapScreen*` のみ。`decideHeadingAvailability()` で純粋化 | import 構造レビュー・grep |
| NFR-04 | テスト | 純粋関数 + リデューサ + ストレージ + シナリオ（§12.3） | `npm test` |
| NFR-05 | 型安全（strict） | 既存 `tsconfig` の `strict` / `noUncheckedIndexedAccess` / `noImplicitOverride` を維持。`any` 禁止・`unknown` + 型ガード | `npm run typecheck` |
| NFR-06 | 未確認 API 禁止 | §0.2 の確認状況表＋§18。未確認はアダプタ/オプション画面に隔離 | レビュー・§18 |
| NFR-07 | 省電力・応答性 | 位置 1 秒（Android `timeInterval`）・方位 dispatch 100ms 間引き・ティッカー 1 秒・リングバッファ書込デバウンス・アニメ 250ms | 実機 30 分（未実施）・コードレビュー |
| NFR-08 | アクセシビリティ | 精度・鮮度は数値＋文言＋区分名。色は補助。`accessibilityLabel` | `ui/labels.ts` テスト・目視 |
| NFR-09 | プライバシー | 保存は端末内のみ・外部送信なし・機微情報を保存しない | コードレビュー・保存キー一覧 |
| NFR-10 | 再現性 | Mock シナリオ + Jest（決定論・タイマー不使用） | `npm test`・Mock 手動シナリオ |

---

## 14. ディレクトリ構成（`mobile/src/` 以下）

```
mobile/
├── App.tsx                       # ★コンポジションルート（実装を生成・注入。ロジック禁止）
├── index.ts                      # 既存のまま（registerRootComponent）
├── app.json                      # 既存（必要なら react-native-maps plugin を後日追加＝要承認）
├── tsconfig.json                 # 既存（strict / types: ["jest"] / noUncheckedIndexedAccess）
├── package.json                  # 既存（依存追加はしない）
├── __mocks__/
│   └── @react-native-async-storage/
│       └── async-storage.js      # 公式 Jest モックの再 export（.js なので tsc 対象外）
└── src/
    ├── domain/                   # ★純粋関数のみ。外部 import ゼロ・副作用ゼロ
    │   ├── types.ts              # データモデル（§3.2）
    │   ├── constants.ts          # 閾値・定数（§6.1）
    │   ├── normalize.ts          # 角度正規化（§6.2）
    │   ├── bearing.ts            # 大円方位・相対方位（§6.3 / §6.5）
    │   ├── distance.ts           # haversine（§6.4）
    │   ├── freshness.ts          # 経過時間・鮮度区分（§6.6）
    │   ├── accuracy.ts           # 精度区分（§6.7）
    │   ├── nav.ts                # NavState 合成（§6.8）
    │   ├── rotation.ts           # 最短経路の回転角（§6.9）
    │   ├── format.ts             # 距離・経過・方位の整形（§6.10）
    │   ├── validation.ts         # 座標・目的地入力の検証（§6.11）
    │   ├── ringBuffer.ts         # リングバッファ（§6.12）
    │   ├── sensorMapping.ts      # ライブラリ値 → ドメイン型（§5.3）
    │   ├── scenario.ts           # シナリオ定義・純粋なサンプリング（§8.4）
    │   ├── presets.ts            # デモ用プリセット目的地（§10.6）
    │   ├── summarize.ts          # サンプルの簡易集計（FR-09）
    │   └── __tests__/            # §12.2（domain のテスト。RN import 禁止）
    ├── ports/                    # ★契約（interface / type のみ）
    │   ├── common.ts             # Unsubscribe / ProviderError / PermissionOutcome
    │   ├── location.ts           # LocationProvider
    │   ├── heading.ts            # HeadingProvider
    │   ├── clock.ts              # Clock
    │   ├── destinationRepository.ts
    │   ├── sampleLogRepository.ts
    │   ├── mockSensor.ts         # MockSensorController / MockSensorSnapshot
    │   └── index.ts              # 再 export（hooks / adapters / App が使う）
    ├── adapters/                 # ★外部 I/O の唯一の場所
    │   ├── expo/
    │   │   ├── ExpoLocationProvider.ts
    │   │   ├── ExpoHeadingProvider.ts
    │   │   └── headingStrategy.ts        # Platform 依存判定（純粋・テスト可能）
    │   ├── storage/
    │   │   ├── storageKeys.ts            # キー定義（§10.1）
    │   │   ├── codec.ts                  # 検証付き encode/decode（純粋・テスト対象）
    │   │   ├── AsyncStorageDestinationRepository.ts
    │   │   └── AsyncStorageSampleLogRepository.ts
    │   ├── memory/
    │   │   ├── InMemoryDestinationRepository.ts
    │   │   └── InMemorySampleLogRepository.ts
    │   ├── clock/
    │   │   ├── SystemClock.ts
    │   │   └── FakeClock.ts
    │   ├── mock/
    │   │   ├── MockSensorControllerImpl.ts
    │   │   ├── MockLocationProvider.ts
    │   │   ├── MockHeadingProvider.ts
    │   │   └── mockTicker.ts             # setInterval 駆動（開発時のみ）
    │   └── __tests__/
    ├── hooks/                    # ★状態管理（ports 型と domain のみ import）
    │   ├── navState.ts           # NavAppState / 初期状態
    │   ├── navReducer.ts         # 純粋リデューサ（§7.2）
    │   ├── selectors.ts          # selectNavState 等（§7.3）
    │   ├── useNavApp.ts          # 起動・購読・永続化のオーケストレーション（§7.4）
    │   ├── useTicker.ts          # 1 秒 tick
    │   └── __tests__/
    └── ui/                       # ★表示のみ
        ├── screens/
        │   ├── MainScreen.tsx
        │   ├── DestinationListScreen.tsx
        │   ├── DestinationAddScreen.tsx
        │   ├── DevLogScreen.tsx
        │   ├── MapScreen.tsx             # native（react-native-maps を import）
        │   └── MapScreen.web.tsx         # web（地図なしフォールバック）
        ├── components/
        │   ├── Bird.tsx                  # SVG + Animated 回転
        │   ├── NavStatusPanel.tsx        # 精度・鮮度・警告
        │   ├── PermissionNotice.tsx      # 権限拒否の案内
        │   ├── MockControlPanel.tsx      # 開発用の手動値・シナリオ
        │   ├── ScreenSwitcher.tsx        # 画面切替
        │   └── ErrorBoundary.tsx
        ├── labels.ts                     # 日本語文言（純粋関数・テスト対象）
        ├── theme.ts                      # 色・余白・文字サイズ
        ├── mapRegion.ts                  # Region 計算（純粋）
        └── __tests__/
```

**既存雛形との整合**
- `App.tsx` は置き換える（コンポジションルート化）。`index.ts` は変更不要。
- `tsconfig.json` の `include: ["**/*.ts", "**/*.tsx", ...]` により `src/**` は自動で型検査対象。追加設定は不要。
- `jest` の `preset: "jest-expo"` と `transformIgnorePatterns`（`react-native-svg` を含む）は設定済みで、**変更不要**。
- 依存追加は**不要**（§付録A の項目はいずれも「入れない」判断）。

---

## 15. requirements との整合

### 15.1 決定ログ D-01〜D-13 との対応

| # | 決定 | 本設計での扱い | 備考 |
|---|---|---|---|
| D-01 | ルートに文書、アプリは `mobile/` | 本設計は `architecture.md` のみ。実装は `mobile/src/**` | 整合 |
| D-02 | Expo SDK 58（RN 0.88.1 / React 19.3.0 / TS ~6.0.3） | `mobile/package.json` の実物どおり。**依存追加なし** | 整合 |
| D-03 | 地図はオプション・Web フォールバック | `MapScreen.tsx` / `MapScreen.web.tsx` 分割。`showsUserLocation` 不使用・キーなしでも壊れない | 整合（§9.6） |
| D-04 | Android 実機/AVD 未整備 | **2026-10-30 解決**: Pixel 4a（Android 13）を USB 接続し、Expo Go 58.0.5 + `adb reverse` + Metro で起動・描画に成功（環境レポート §5.4）。実機タスクは実施可能 | 整合（実機タスクを tasks.md に記載） |
| D-05 | `trueHeading >= 0` 採用、`-1` は `magHeading` + 磁北注記 | `mapHeadingReading()` に集約（§5.2）。`reference='magnetic-north'` + `magnetic-reference` 警告 | 整合 |
| D-06 | 鳥は `react-native-svg` 15.16.0 | SVG は図形のみ。**回転は `Animated.View`**（SVG の transform は未確認のため不採用）。`react-native-svg` の API は実装冒頭に確認（§18-1） | **実装時確認の条件付き整合** |
| D-07 | 初回は「現在地を目的地に」案内・デモ 2〜3 件 | `presets.ts` + 初回投入（§10.6）。現在地ボタンは位置 `lost` で無効 | 整合 |
| D-08 | GPS 精度閾値 10/30 m（暫定） | `DEFAULT_THRESHOLDS.gpsAccuracy`。1 箇所で変更可 | 整合（実測後に調整） |
| D-09 | 鮮度閾値 3/10/30 s（暫定） | `DEFAULT_THRESHOLDS.freshness`。境界規則は §6.6 | 整合（実測後に調整） |
| D-10 | Android 7+（minSdk 実値は後で記録） | 設計上の依存なし。ビルド設定は変更しない | 未確認のまま（ブロックしない） |
| D-11 | AsyncStorage 2.2.0（expo-sqlite は将来） | 本設計は AsyncStorage。`SampleLogRepository` の**ポート越し**なので sqlite へ差し替え可能 | 整合（拡張点を明記） |
| D-12 | UI 日本語 | `ui/labels.ts` に文言集約。コード識別子は英語 | 整合 |
| D-13 | Expo Go は `expo.dev/go` の SDK 58 版 | 実機手順として README 記載済み。設計上の追加制約なし | 整合 |

### 15.2 requirements 側の修正・確認提案（**勝手に変更しない。報告のみ**）

| # | 対象 | 内容 | 本設計の暫定解釈 | 提案 |
|---|---|---|---|---|
| 1 | **E-07** | 「`359.999` はそのまま」は相対方位 `(-180,180]` の正規化と矛盾（正しくは `-0.001`） | `[0,360)` 正規化のケースと解釈し、2 関数を分けてテスト | requirements の文言を「`359.999`（`[0,360)` 正規化ではそのまま、`(-180,180]` 正規化では `-0.001`）」に修正 |
| 2 | **E-10** | 「位置が古い（例: 30 秒前）→ lost」だが、FR-08 は `stale <= 30s` / `lost > 30s` で 30 秒ちょうどは `stale` | FR-08 の数値定義を優先（境界は §6.6） | E-10 を「30 秒超」または「31 秒前」に修正、もしくは「30 秒程度」と曖昧化 |
| 3 | **E-13** | 「999.6 m / 1000 m」の期待値が未記載。`999.6 → '1000 m'` は要件の字義どおりだが UX 違和感 | 字義どおり（`<1000` は m 表記で四捨五入）。関数 1 箇所に閉じ込め | 期待値を明記（例: `999.6 → '1000 m'`）か、`Math.round` 後に閾値判定する規則へ変更 |
| 4 | **FR-06** | 「10 m 未満」と「十分近い（例: 10 m 未満）」 | `distance < 10`（strict） | 明記して統一（本設計は strict） |
| 5 | **FR-10 / 8-3** | 「PC 上で全画面が動作」だが、Web 依存 3 点が未導入。Jest では画面描画を確認できない | Jest でロジックを担保し、全画面の目視は Web 依存追加後 or 実機 | 受け入れ基準の「Expo web または Jest」の解釈を確定（§付録A-1） |
| 6 | **調査ノート §10-4** | 「`jest-expo` preset が expo-location 同梱モックを適用するか未検証」 | 本設計は同梱モックに依存しない（ポート実装で自作） | 検証は任意（依存しないため） |

> **Lead 判断（2026-10-30）**: 上記 1〜4 は **requirements.md 側を修正済み**（E-07・E-10・E-13 の文言、FR-06 の `distance < 10` strict）。5 は **D-04 解決（実機接続済み）により実機目視で代替**する。6 は設計が依存しないため追加対応不要。

### 15.3 本設計で決めた事項（ADR）

| # | 決定 | 理由 | 影響 |
|---|---|---|---|
| ADR-01 | GPS `accuracy <= 0` は「不明」として扱う | 「未取得を 0 で返す」実装と区別できないため安全側。要件に「不明」区分がある | `classifyGpsAccuracy` の境界テスト |
| ADR-02 | 位置 `lost` のとき鳥をニュートラル（`relativeBearingDeg=null`）にする | 誤った方向へ誘導しない（E-10 の趣旨）。`stale` は警告のみで回転継続 | `computeNavState` の優先順位（§6.8 手順 5） |
| ADR-03 | 到着時は鳥を上向き（0°）に戻す | 「向き」より「到着」を優先し、誤解を避ける | `nextContinuousAngleDeg` の目標値 |
| ADR-04 | 同一地点の閾値は 1 cm（`SAME_POINT_EPS_M`） | 完全一致だけだと浮動小数の誤差で `null` にならないケースがある | E-01 テストは「同一座標」で検証 |
| ADR-05 | 極点は「方位不定（`null`）」 | 経度の意味が消え式が退化する。E-05 の「方針を定めてテスト」に対応 | E-04（±89.9°）は有限値、E-05（±90°）は `null` |
| ADR-06 | 方位の dispatch は 100ms に間引き | `watchHeadingAsync` に間隔指定が無い（【確定】）ため UI 更新を抑える | `useNavApp` の `useRef` 実装 |
| ADR-07 | 画面遷移は自前 state（`react-navigation` 不採用） | 依存追加禁止。画面数が 5 で単純 | `ScreenSwitcher` |
| ADR-08 | Mock スライダーではなく数値入力 | `@react-native-community/slider` が未インストール（追加依存） | `MockControlPanel` の UI |
| ADR-09 | リングバッファの書込は 5 秒デバウンス | 書込回数を抑え、省電力とフラッシュ寿命に配慮 | `AsyncStorageSampleLogRepository` |
| ADR-10 | `react-native-maps` の `showsUserLocation` を使わず自前 Marker | 権限なしで無言失敗する（【確定】）ため | `MapScreen.tsx` |

---

## 16. リスクと対策

| # | リスク | 影響 | 対策 | 検証タイミング |
|---|---|---|---|---|
| 1 | **コンパス精度が悪い**（磁気・金属・建物） | 鳥の方向がずれる | 精度区分と鮮度を常時表示（FR-08）。`Magnetometer` での自前計算は**しない**（公式の計算手順が無く未確認 §5.3）。低精度時は警告 | 実機（D-04 後） |
| 2 | **エミュレータで方位が取れない** | 実機なしで方位検証できない | Mock 方位で開発。`isAvailable()` で reason を出し Mock に誘導（FR-03） | PC 上で常時 |
| 3 | **Android 実機/AVD が無い**（D-04） | 実機の受け入れ基準（目視±5°等）が未達のまま | Mock + Jest でロジックを担保。実機タスクを tasks.md で独立させ、導入後に実施 | 将来 |
| 4 | **Expo Go の SDK 58 移行期**（D-13） | 実機で起動できない可能性 | `expo.dev/go` の SDK 58 APK を使用。SDK 57 フォールバックのバージョンも調査済み（notes §1.4） | 実機準備時 |
| 5 | **Web プレビュー不可**（依存未導入・地図非対応・方位非対応） | PC で全画面の目視ができない | Jest でロジック検証。Web が必要なら依存 3 点の追加承認（§付録A-1）。地図は `MapScreen.web.tsx` | 実装開始時 |
| 6 | **サンドボックス制約**（パイプ付き spawn が EPERM） | `jest` / `expo install` / `expo export` の一部が失敗 | `npm test`（`--runInBand`）を使う。依存追加は `npm install --ignore-scripts`。`expo export --max-workers 1 --no-bytecode`。**依存追加をしない設計**にした | 常時 |
| 7 | **`react-native-svg` API 未確認** | 鳥の実装が止まる | 使う要素を最小化（`Svg` / `Path` / `Circle`）。回転は RN の `Animated.View`。確認できなければ `View` 代替 | 実装タスク冒頭（§18-1） |
| 8 | **`Animated` の線形外挿が想定外** | 359°→1° で逆回転 | `reduceContinuousAngle` で ±720° に収める。目視確認。最悪は `useNativeDriver:false` + 短いアニメで対応 | 実装時（§18-2） |
| 9 | **`watchPositionAsync` の頻度・`timeInterval` が iOS で無効** | iOS の更新頻度が想定外 | Android 優先（D-02 の Android 先行）。iOS は実測して調整。表示は鮮度でカバー | iOS 対応時 |
| 10 | **方位更新頻度が不明**（`watchHeadingAsync` に間隔指定なし） | UI 更新過多・電池消費 | 100ms 間引き（ADR-06）。ティッカー 1 秒 | 実機（D-04 後） |
| 11 | **Google Maps API キー未取得** | カスタムビルドで地図が空白 | Expo Go ではキー不要（【確定】）。空白時は注記＋フォールバック。キー注入は保留（§付録A-4） | カスタムビルド時 |
| 12 | **AsyncStorage の上限・破損** | 保存失敗・起動時クラッシュ | サイズ見積り < 100 KB。破損は要素単位で読み飛ばし＋退避。書込失敗は警告のみ | テスト |
| 13 | **TS 6 系の `types` 未設定で tsc が落ちる** | 型検査が回らない | `tsconfig` に `types: ["jest"]` 設定済（実測）。`__mocks__` は `.js` で型検査対象外に | 実装時 |
| 14 | **`@types/node` が無い**（`process` 不可） | 環境変数・`app.config.ts` が使えない | アプリコードで `process` を使わない。API キー注入は保留（§付録A-4） | 実装時 |
| 15 | **要件の境界値の解釈違い**（E-07/E-10/E-13） | テストの期待値がぶれる | §15.2 で明示。tests で両解釈をコメントアウトで残さず、決めた方針を固定 | 実装前（Lead 確認） |
| 16 | **プライバシー**（位置情報の保存） | 端末内とはいえ座標が残る | 外部送信ゼロ（NFR-09）。保存は目的地と数値ログのみ。開発画面から全消去できる | レビュー |

---

## 17. 実装順序の提案（tasks.md 作成者への引き継ぎ）

**基本方針**: 「純粋関数 → Mock → アダプタ → hooks → UI → 地図」。各フェーズは**単独で `npm run typecheck` / `npm test` が通る**状態で終える（各タスクの完了条件）。依存追加は発生しない。

| P | タスク | 主な成果物 | 依存 | 完了条件 | 規模 |
|---|---|---|---|---|---|
| **P0** | 基盤セットアップ | `src/` ディレクトリ、`domain/types.ts`、`domain/constants.ts`、`__mocks__/`（空でよい） | — | `npm run typecheck` / `npm test` が現状のまま PASS（既存テスト無しでも可） | 小 |
| **P1** | 角度正規化 | `normalize.ts` + `normalize.test.ts`（E-07 相当・プロパティ） | P0 | E-07 系テスト PASS。`-0` / `NaN` の扱いを固定 | 小 |
| **P2** | 距離・方位 | `distance.ts` / `bearing.ts` + テスト（E-01〜E-06, E-12） | P1 | E-01〜E-06 / E-12 の距離・方位テスト PASS。対蹠点・日付変更線・極点の扱いが固定 | 中 |
| **P3** | 鮮度・精度 | `freshness.ts` / `accuracy.ts` + テスト（E-09〜E-11, 閾値境界） | P1 | 9 点の鮮度境界・GPS 精度境界・方位精度変換のテスト PASS | 小 |
| **P4** | ナビ状態合成 | `nav.ts` + `rotation.ts` + テスト（E-08, E-14, E-15, 到着境界, 優先順位） | P2, P3 | `computeNavState` の全分岐（status/warnings）と `nextContinuousAngleDeg` のテスト PASS | 中 |
| **P5** | 表示整形・検証・リングバッファ | `format.ts` / `validation.ts` / `ringBuffer.ts` / `summarize.ts` + テスト（E-12, E-13, FR-09 上限） | P0 | E-13・検証・リングバッファのテスト PASS | 小 |
| **P6** | Mock センサー | `scenario.ts` / `presets.ts` + `adapters/mock/*`（`FakeClock` 含む） + テスト | P4, P5 | 全シナリオのサンプリング・`advance()` による状態遷移・`FakeClock` のテスト PASS。**`expo-location` を import しない** | 中 |
| **P7** | 永続化アダプタ | `storage/codec.ts` / `AsyncStorage*Repository.ts` / `__mocks__` + テスト（破損・リング・選択復元） | P5 | AsyncStorage 公式モックで CRUD・破損読み飛ばし・リング上限のテスト PASS | 中 |
| **P8** | 実センサーアダプタ | `expo/ExpoLocationProvider.ts` / `ExpoHeadingProvider.ts` / `headingStrategy.ts` / `sensorMapping.ts` / `SystemClock.ts` + テスト | P2, P3, P7 | `mapLocationReading` / `mapHeadingReading`（E-08 含む）・`headingStrategy`・`SystemClock` のテスト PASS。実アダプタの配線は任意で 1 ファイル | 中 |
| **P9** | 状態管理 | `hooks/navState.ts` / `navReducer.ts` / `selectors.ts` / `useNavApp.ts` / `useTicker.ts` + リデューサテスト | P4, P6, P7, P8 | リデューサ全アクション・セレクタのテスト PASS。購読ライフサイクル（race ガード）をコードレビュー | 大 |
| **P10** | UI（メイン＋ステータス） | `App.tsx`（コンポジションルート）/ `MainScreen` / `Bird` / `NavStatusPanel` / `labels.ts` / `theme.ts` / `ErrorBoundary` | P9 | `npm run typecheck` PASS。`labels` テスト PASS。Mock 手動値で PC/Jest 上で値が表示される（目視） | 大 |
| **P11** | 画面（目的地・記録・開発） | `DestinationListScreen` / `DestinationAddScreen` / `DevLogScreen` / `MockControlPanel` / `ScreenSwitcher` | P10 | 目的地 CRUD → 再起動相当（state リセット）で復元。サンプル一覧・集計・シナリオ切替が動く | 中 |
| **P12** | 地図（オプション） | `MapScreen.tsx` / `MapScreen.web.tsx` / `mapRegion.ts` | P10 | native でマーカー表示（実機 or Expo Go 導入後）。web でフォールバック表示・クラッシュなし | 中 |
| **P13** | 仕上げ | `npm run verify` 全 PASS、`expo export --max-workers 1 --no-bytecode` でバンドル生成確認（沙箱では CLI が終了しないため `dist/` の成果物で判定）、§18 チェックリスト消化、README 更新（必要時） | 全部 | `tsc` 0 エラー / 全テスト PASS / 外部通信 grep 0 件 / `dist/metadata.json` とバンドル JS の生成 / §18 の未確認事項が解消 or 文書化 | 小 |

**実装順序の根拠**
- **純粋関数が最初**（P1〜P5）: 外部環境・実機に一切依存せず、沙箱内で完結。要件の受け入れ基準 2（単体テスト）と 7（`tsc`/`npm test`）を最速で満たす。
- **Mock が次**（P6）: 以降の hooks/UI を実センサーなしで動かせる。FR-10 の「Mock で PC 再現」を先に成立させる。
- **アダプタは後**（P7〜P8）: 外部 API の確認が必要な部分を後ろに回し、ブロッカーを局所化。P8 で `expo-location` の実 API に初めて触れるため、§0.2 の確定事項だけで書ける。
- **hooks → UI → 地図**（P9〜P12）: 状態が固まってから表示を作る（手戻り削減）。地図は最後（実機/キー依存のため）。
- **P13 で全体検証**: 受け入れ基準（要件 §8）を 1 つずつ確認する。

**tasks.md への記載依頼**
- 各タスクに「目的 / 変更ファイル / 受け入れ基準 / 単体テスト内容 / 依存 / 完了条件（コマンド） / 参照する本設計の節」を明記。
- タスクは**1 回の作業で完結する粒度**（目安: P2/P4/P10/P11 を 2〜3 分割、P1/P3/P5 は 1 タスク）。
- 「実機でしか確認できない項目」（P12 の目視、NFR-07 の連続 30 分、FR-03 の実測）は**別タスク**として分離し、D-04 解消後に行う。
- 実装時の禁止事項（依存追加禁止・`process` 禁止・`any` 禁止・タイマー不使用テスト）をタスク共通の注意として記載。

---

## 18. 未確認事項・実装前/実装時の検証チェックリスト

| # | 未確認事項 | 影響する設計箇所 | 確認方法 | 確認タイミング | 確認できない場合の代替 |
|---|---|---|---|---|---|
| 1 | **`react-native-svg` 15.16.0 の API**（`Svg` / `Path` / `Circle` の props） | 鳥の描画（§9.3） | 公式ドキュメント（`react-native-svg`）を確認。※本設計時点では未調査 | P10 開始時 | `View` + `borderRadius` 等で代替（見た目は劣化、要件は満たす） |
| 2 | `Animated` の `interpolate` の範囲外挙動（線形外挿） | 回転アニメーション（§9.3） | 目視＋数値確認（`361deg` が連続するか） | P10 | `reduceContinuousAngle` で ±720° に収め `inputRange: [-720, 720]`。それでも不可なら `useNativeDriver:false` |
| 3 | RN の `rotate` の正方向 | 鳥の左右（§9.3） | 目視（`+90` で右を向くか） | P10 | 符号反転（`rotate: -deg`）で調整 |
| 4 | **`performance.now()` の RN 上での有無** | `SystemClock`（§5.4） | 実機 or 起動時ログ（機能検出は実装済みの想定） | P8 | `Date.now()` + `max()` の単調補正（実装済みフォールバック） |
| 5 | Expo Go（Android）で前景位置取得・方位取得が制限なく動くか | 実機動作（§8.5） | 実機で `getCurrentPositionAsync` / `watchPositionAsync` / `watchHeadingAsync` を実行 | D-04 解消後 | Mock で継続。開発は Mock 前提 |
| 6 | `watchPositionAsync` の実機での更新間隔（`timeInterval` の最小値） | 更新頻度（§5.1） | 実機でログ計測 | D-04 解消後 | 既定値のまま。鮮度表示でカバー |
| 7 | iOS での更新頻度（`timeInterval` が無効） | 将来の iOS 対応 | iOS 実機 | iOS 対応時 | Android 先行（D-02） |
| 8 | 設定アプリへの遷移 API（`Linking.openSettings` 等） | 権限拒否時の誘導（§11.2） | 一次情報で確認できた場合のみ採用 | P10 | **文言のみで誘導**（本設計の既定） |
| 9 | `AppState` の API 形（`addEventListener` の戻り値） | 書込フラッシュ（§10.4） | RN 公式で確認 | P7（採用する場合） | デバウンスのみで運用（失われても最大 5 秒） |
| 10 | `jest-expo` が `expo-location` 同梱モックを自動適用するか | — | 本設計は**依存しない**ため不要 | — | 依存しない（§8.1） |
| 11 | `MapScreen` の Web 解決（`MapScreen.web.tsx` が優先されるか） | 地図のフォールバック（§9.6） | `expo export --platform web` は**依存不足で実行不可**。Metro の標準解決に依存（`MapView.web.ts` の存在から妥当） | P12 | `Platform.OS === 'web'` の明示分岐に切り替え（`MapScreen.tsx` 内で判定） |
| 12 | `react-native-maps` の `Region` の厳密な型（`LatLng` との関係） | `mapRegion.ts`（§9.6） | 型定義ファイルを精読 | P12 | 自前型（`{latitude, longitude, latitudeDelta, longitudeDelta}`）を使い、`MapView` へは構造的に渡す |
| 13 | `expo-location` の `Accuracy` の Web 挙動 | Web フォールバック（§8.5） | Web 依存追加後 | 任意 | Web では Mock のみ（位置も Mock 可） |
| 14 | **Web プレビュー用依存 3 点の追加可否** | FR-10 の「全画面」目視 | Lead/ユーザー判断 | **実装前（要承認）** | Jest のみで検証（ロジック） |
| 15 | 実機の方位精度・応答（実測） | チューニング（D-08/D-09） | 実機で 30 分計測 | D-04 後 | 暫定閾値のまま |
| 16 | Android の `minSdkVersion` 実値（D-10） | なし（記録のみ） | prebuild 後の `build.gradle` | ネイティブビルド時 | 記録だけ行う |

---

## 付録 A. 依存追加・要件変更の要承認事項

| # | 内容 | 目的 | 追加される依存 | 代替（本設計の既定） | 判断者 |
|---|---|---|---|---|---|
| A-1 | Web プレビュー用の依存追加 | Expo web で全画面を目視（FR-10 / 8-3） | `react-dom` 19.3.0 / `react-native-web` ~0.21.4 / `@expo/metro-runtime` ~58.0.15（いずれも SDK 58 の `bundledNativeModules` に記載） | **追加しない**。Jest でロジック検証、目視は実機（D-04） | Lead / ユーザー |
| A-2 | スライダー UI | 手動 Mock の操作性 | `@react-native-community/slider` 5.2.1 | **数値入力 + 増減ボタン**（`TextInput` / `Pressable`） | Lead |
| A-3 | `react-native-reanimated` | 滑らかなアニメーション | `react-native-reanimated` 4.7.1（+ worklets） | **`Animated`（RN コア）** を採用 | Lead |
| A-4 | Google Maps API キー注入（`app.config.ts`） | カスタムビルドで地図を有効化 | `@types/node`（`process` の型）／`app.config.ts` | **現時点では実装しない**。Expo Go（キー不要）で地図確認 | Lead / ユーザー |
| A-5 | UI コンポーネントテスト | 画面の回帰テスト | `@testing-library/react-native` v14 | **追加しない**。domain / reducer / labels のテストで代替 | Lead |
| A-6 | expo-sqlite（kv-store） | 記録件数の増加・集計性能 | `expo-sqlite` ~58.0.14 | **AsyncStorage 2.2.0**（リング 300 件で十分） | Lead（将来判断） |

> いずれも**本設計の既定は「追加しない」**。追加する場合は `npm install --ignore-scripts`（沙箱では必須）で行い、`transformIgnorePatterns` の更新が必要かを確認する。

---

## 付録 B. 確定バージョン（`mobile/package.json` の実物）

| パッケージ | バージョン | 用途 |
|---|---|---|
| `expo` | `~58.0.21` | SDK |
| `react` | `19.3.0` | — |
| `react-native` | `0.88.1` | — |
| `expo-location` | `~58.0.20` | GPS・コンパス |
| `react-native-maps` | `1.29.11` | 地図（オプション） |
| `react-native-svg` | `15.16.0` | 鳥の描画 |
| `@react-native-async-storage/async-storage` | `2.2.0` | 永続化（**3.x にしない**） |
| `expo-status-bar` | `~58.0.4` | ステータスバー |
| `jest-expo` | `~58.0.13` | Jest preset |
| `jest` | `~30.5.2` | テストランナー |
| `@types/jest` | `30.0.0` | 型 |
| `typescript` | `~6.0.3` | 型検査 |
| `@types/react` | `~19.3.0` | 型 |

**追加依存: なし**。`react-native-reanimated` / `react-native-safe-area-context` / `react-navigation` / `@testing-library/react-native` / `expo-sqlite` / `react-dom` / `react-native-web` は**入れない**（付録A）。

---

## 付録 C. 実装時の共通注意（tasks.md に転記すること）

1. **コマンドは沙箱対応版を使う**: `npm test`（=`jest --runInBand`）、`npm run typecheck`、依存追加時は `npm install --ignore-scripts`、バンドル確認は `npx expo export --platform android --max-workers 1 --no-bytecode`。`npx expo install` / `create-expo-app` / `expo config` は**使わない**（EPERM / ハング）。
2. **`process` / `require` を書かない**（`@types/node` が無い）。`__mocks__` は `.js`。`any` 禁止・`unknown` + 型ガード。
3. **domain に外部 import を書かない**（React Native も含む）。domain は Node でも評価できる純粋関数だけにする。
4. **`noUncheckedIndexedAccess`** のため配列アクセスは `undefined` を考慮する（`arr[0]!` のような非 null 断言は禁止。`slice` / 分割代入 / ガードを使う）。
5. **時刻**: 鮮度は `Clock.nowMonotonicMs()` の差分のみ。`Date.now()` を直接使わない（ログ用の `nowEpochMs()` は可）。
6. **`-0` / `NaN` / `Infinity`** をデータモデルに入れない。計算関数は `null` を返す（throw しない）。
7. **文言は `ui/labels.ts`** にだけ書く。domain は区分コードのみ返す。
8. 各タスク完了時に `npm run verify`（typecheck + test）を通し、**使用した外部 API の出典節**（library-api-notes の節番号）を PR/コミットメッセージに記載する（NFR-06）。

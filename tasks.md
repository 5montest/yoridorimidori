# tasks.md — 寄鳥美鳥地（よりどりみどり）実装タスク分解

- 版: v0.1
- 最終更新: 2026-10-30
- ステータス: **実装開始可能**（タスク間の依存に循環なし。各タスク終了時に `npm run verify` が緑になるよう設計）
- 位置づけ: [architecture.md](architecture.md) **§17 実装順序の提案**を、**1 回の作業で完結する粒度**に分解した実装計画。設計（型・アルゴリズム・配置）は architecture を正とし、本書は「作業順・完了条件・テスト範囲」を追加する。
- 入力文書:
  [requirements.md](requirements.md)（FR-01〜FR-12 / NFR-01〜NFR-10 / E-01〜E-15 / 受け入れ基準 §8 / D-01〜D-13）、
  [architecture.md](architecture.md)（§3 型 / §4 ポート / §5 アダプタ / §6 ドメイン / §7 hooks / §8 Mock / §9 UI / §10 永続化 / §11 エラー / §12 テスト戦略 / §14 ディレクトリ / §17 実装順序 / §18 未確認事項 / 付録C）、
  [docs/research/library-api-notes.md](docs/research/library-api-notes.md)（確定 API と出典節。以下 **notes §n.m**）、
  [docs/research/pc-build-verification.md](docs/research/pc-build-verification.md)（サンドボックス実測。以下 **pc §n-n**）、
  [docs/environment-report.md](docs/environment-report.md)（環境事実。以下 **env §n**）

---

## 0. この文書の使い方

### 0.1 前提（決定済み・タスク内で変更しない）

| # | 前提 | 根拠 |
|---|---|---|
| 0-1 | **実機は接続済み**: Pixel 4a（`12231JEC206116`）/ Android 13 / Expo Go **58.0.5** を `adb install` 済み。`adb reverse tcp:8081 tcp:8081` + `npx expo start` + `exp://127.0.0.1:8081` で起動成功。**D-04 は解決済み** ＝ 実機タスク D1〜D7 は実施可能 | env §5.4 |
| 0-2 | **依存追加はしない**。`react-native-svg` 15.16.0 / `react-native-maps` 1.29.11 / AsyncStorage 2.2.0 / expo-location 58.0.20 / jest-expo 58.0.13 / TS 6.0.3 は `mobile/package.json` に導入済み（実測で `node_modules` に一致するバージョンが存在） | architecture 付録A・付録B、`mobile/package.json` |
| 0-3 | **Expo web は使わない**（`react-dom` / `react-native-web` / `@expo/metro-runtime` 未導入・追加禁止）。FR-10 の「PC 上で再現」は **Jest + 自前 Mock** で担保する（受け入れ基準 3 の「Expo web または Jest」を Jest で充足） | architecture §8.5、付録A-1、§18-14 |
| 0-4 | **サンドボックス制約**: パイプ付き子プロセス生成が一律 EPERM。`npm test` は `jest --runInBand`、依存追加が必要な場合のみ `npm install --ignore-scripts`、`npx expo install` / `create-expo-app` / `npx expo config` は**使わない**。生の `npx jest` も使わない | env §3.2、pc §12-3 |
| 0-5 | **境界値の解釈は確定済み**: requirements.md は architecture §15.2 の提案を反映済み（E-07 は `[0,360)` と `(-180,180]` の 2 値併記、E-10 は「30 秒**超**」、E-13 は `999.6 → '1000 m'`）。**テストはこの値で固定**する（§15.2 の「要確認」は解消済み） | requirements §6、architecture §15.2 |
| 0-6 | 実装前の `mobile/` は雛形のみ（テンプレート `App.tsx` と `index.ts`、`src/` なし）。`npm run typecheck` は exit 0、`npm test` は「No tests found」で exit 0 → **T01 で最低 1 本のテストを入れて以降の回帰検出を可能にする** | 実測、architecture §17 P0 |
| 0-7 | 端末時計は PC より約 46 分ずれている。**鮮度計算は端末内の単調時計（`Clock.nowMonotonicMs()` の差分）で行う**ため影響しない。ログの epoch 時刻比較にのみ注意 | env §5.4 |

### 0.2 タスクのテンプレート（全タスク共通の見出し）

各実装タスク（T01〜T28）は次の順で記述する。

1. **目的**（1〜2 文）
2. **変更・追加ファイル**（`mobile/src/...` の具体パス。architecture §14 のツリーと完全一致）
3. **実装内容の要点**（参照する architecture の節番号を必ず明記）
4. **受け入れ基準**（チェックボックス）
5. **単体テスト**（テストファイルパス＋ケース列挙。E-xx と対応付け）
6. **依存タスク**
7. **完了条件**（コマンド。`npm run typecheck` / `npm test` が緑 等）
8. **使用する外部 API と出典節**（NFR-06。使わないタスクは「なし（純粋関数）」）
9. **§18 確認ポイント**（該当する場合のみ）

- 規模: **小** = 1 ファイル＋テスト / **中** = 2〜4 ファイル＋テスト / **大** = 画面・フックの統合（レビュー含む）
- 「完了条件」は**コマンドの成否**で判定する。目視でしか確認できない項目（鳥の向き・権限ダイアログ・実測）は **D タスクへ分離**し、実装タスクの完了条件には含めない。

### 0.3 architecture §17 からの変更点（理由つき）

| # | §17 の記載 | 本書 | 変更理由 |
|---|---|---|---|
| 1 | P0 に `__mocks__/`（空でよい）を含む | **T15 で実体作成**（`async-storage.js`） | 空ディレクトリは git 管理されないため。ファイル作成は公式モックを使う T15 が自然 |
| 2 | `ports/mockSensor.ts` は P0 の `src/` に含む | **T11 で作成**（`ports/index.ts` の再 export も T11 で追記） | §4.7 が `ScenarioId`（`domain/scenario.ts`）を import する。P0 では scenario.ts 未作成で typecheck 不能 |
| 3 | `validation.ts` は P5 | **T03 として P2（距離・方位）より前へ前倒し** | §17 の P2 依存は P1 のみだが、`haversineDistanceM` / `initialBearingDeg` は `isValidGeoPoint()`（validation.ts）を使う。§17 の依存記載の矛盾を解消 |
| 4 | P2 / P4 / P10 / P11 | §17 の指示どおり 2 分割（P2→**T04 / T05**、P4→**T07 / T08**、P10→**T21 / T22**、P11→**T23 / T24**） | 1 回の作業で完結する粒度 |
| 5 | P5 / P6 / P7 / P8 / P9 / P12 は 1 タスク（P9 のみ大） | 分割: P5→**T09 / T10**、P6→**T11 / T12 / T13**、P7→**T14 / T15**、P8→**T16 / T17 / T18**、P9→**T19 / T20**、P12→**T26 / T27** | 各タスクを 1 セッションで実装・テスト可能にする（§17 の「1 回の作業で完結する粒度」を全 P に適用） |
| 6 | P10 に `App.tsx`（コンポジションルート）を含む | **T25**（P11 の画面が揃った後）へ移動。`ScreenId` に `'map'` を入れるのは T27 | `App.tsx` は全画面を import するため、画面より先に作ると手戻り。設計内容（§2.4 / §7.5）は変えない |
| 7 | `summarizeSamples(entries)`（§9.7） | **`summarizeSamples(entries, thresholds)`** | 古いサンプル率の閾値（`staleMaxMs`）が `Thresholds` に一元管理されているため（§6.1 / D-09） |
| 8 | `decideHeadingAvailability` は §5.3 の一覧では `sensorMapping.ts` に見える | **`adapters/expo/headingStrategy.ts`**（純粋）に置く | §5.2 本文と §14 のディレクトリ構成が明示。§14 を正とする |
| 9 | 実機でしか確認できない項目は別タスク | **D1〜D7**（別 ID 体系） | 指示どおり。D-04 解決済みのため実施可能（0-1） |

> 依存関係は §1 の表と各タスクの「依存タスク」で二重に示す。**循環なし**（すべて T01 方向へ遡る）。

### 0.4 実装の進め方（1 タスク = 1 コミット）

1. 依存タスクが完了していることを確認する（本書の「依存タスク」）。
2. 実装＋単体テストを書く（テストファイルの場所は architecture §12.2 に固定）。
3. `cd mobile; npm run verify`（`typecheck` + `test`）を通す。
4. 使用した外部 API の**出典節**（notes §n.m）をコミットメッセージ（または PR 本文）に書く（NFR-06）。
5. 次のタスクへ進む。**赤いまま次へ進まない**。

---

## 1. タスク一覧

### 1.1 実装タスク（T01〜T28）

> **architecture §17 の P との対応**: P0→T01 / P1→T02 / P2→T04・T05 / P3→T06 / P4→T07・T08 / P5→T03（前倒し）・T09・T10 / P6→T11・T12・T13 / P7→T14・T15 / P8→T16・T17・T18 / P9→T19・T20 / P10→T21・T22（＋T25 の App 部分） / P11→T23・T24 / P12→T26・T27 / P13→T28。

| ID | 名称 | 依存 | 規模 | 完了条件（要約） | 対応要件 |
|---|---|---|---|---|---|
| T01 | 基盤セットアップ（types / constants / ports） | — | 中 | `typecheck` 0。constants テスト PASS | §3.2, §4, §6.1 / FR-12 / NFR-05 |
| T02 | 角度正規化 | T01 | 小 | E-07 系・プロパティテスト PASS | FR-05 / E-07 |
| T03 | 座標・目的地入力の検証 | T01 | 小 | E-12・名前検証テスト PASS | FR-01 / E-12 |
| T04 | haversine 距離 | T02, T03 | 小 | 距離の E-01〜E-05 / E-12 PASS | FR-07 / E-01〜E-05, E-12 |
| T05 | 大円方位・相対方位 | T02, T03, T04 | 中 | E-01, E-03〜E-07 PASS | FR-04, FR-05 / E-06, E-07 |
| T06 | 鮮度・精度区分 | T01 | 小 | 鮮度 9 点・GPS 6 点・方位変換 PASS | FR-08 / E-09, E-10, E-11 |
| T07 | ナビ状態合成（NavState / 警告） | T03, T04, T05, T06 | 中 | E-01, E-08〜E-12, E-15・到着境界 PASS | FR-06, FR-08 / NFR-04 |
| T08 | 最短経路の回転角 | T02 | 小 | E-14・reduce のテスト PASS | FR-06 / E-14 |
| T09 | 表示整形（距離・経過・方位） | T01, T02 | 小 | E-13・フォーマット表 PASS | FR-07 / E-13 |
| T10 | リングバッファ・サンプル集計 | T01 | 小 | FR-09 上限・集計テスト PASS | FR-09 / NFR-04 |
| T11 | シナリオ・プリセット定義（＋Mock 制御ポート） | T01, T03, T04 | 中 | 全シナリオのフレーム検証 PASS | FR-10 / NFR-10 |
| T12 | FakeClock・Mock センサー制御 | T01, T11 | 中 | advance / 時間加速 / 通知抑制 PASS | FR-10 / NFR-10 |
| T13 | Mock 位置・方位プロバイダ | T12 | 小〜中 | 購読・解除・変換のテスト PASS | FR-10, FR-12 / NFR-10 |
| T14 | codec・キー・InMemory リポジトリ | T01, T03, T10 | 中 | 破損読み飛ばし・CRUD テスト PASS | FR-01, FR-09 |
| T15 | AsyncStorage リポジトリ・公式 Jest モック | T14 | 中 | 永続化・デバウンス・退避 PASS | FR-01, FR-09 / NFR-09 |
| T16 | センサー値 → ドメイン型マッピング | T01, T02 | 小 | E-08・E-12 PASS | FR-03 / E-08, E-12 |
| T17 | SystemClock・方位可用性判定 | T01 | 小 | 単調性・platform 判定 PASS | NFR-03 / §18-4 |
| T18 | Expo 位置・方位アダプタ | T16, T17 | 中 | expo-location モックで PASS | FR-02, FR-03 / NFR-06 |
| T19 | 状態・リデューサ・セレクタ・ティッカー | T06, T07, T10 | 中 | 全アクション・選択解除 PASS | FR-01, FR-08 / NFR-05 |
| T20 | useNavApp（起動・購読・永続化の統合） | T13, T15, T17, T18, T19 | 大 | typecheck 0＋レビュー観点チェック | FR-02, FR-10, FR-12 / NFR-07 |
| T21 | 文言（labels）・テーマ | T01 | 小 | 全区分に非空文言 PASS | FR-08 / NFR-08, D-12 |
| T22 | メイン画面（鳥・ステータス・ErrorBoundary） | T07, T08, T09, T21 | 大 | typecheck 0（目視は D2） | FR-06, FR-07, FR-08 |
| T23 | 目的地一覧・追加画面 | T03, T20, T21 | 中 | typecheck 0（CRUD 目視は D1） | FR-01 |
| T24 | 開発用画面（記録・Mock 操作） | T10, T12, T13, T20, T21 | 中 | typecheck 0（表示は D4） | FR-09, FR-10 |
| T25 | App（コンポジションルート）・画面切替・権限案内 | T13, T15, T17, T18, T20, T22, T23, T24 | 中 | typecheck 0（起動は D1） | FR-02, FR-12 / NFR-03 |
| T26 | 地図 Region 計算 | T01 | 小 | `regionForPoints` テスト PASS | FR-11 / §18-12 |
| T27 | 地図画面（native / web フォールバック） | T25, T26 | 中 | typecheck 0（表示は D6） | FR-11 / §18-11 |
| T28 | 仕上げ（verify・バンドル・§18 消化） | T01〜T27 | 小 | `verify` / export / grep / §18 完了 | 受け入れ基準 6, 7 |

### 1.2 実機専用タスク（D1〜D7・別 ID 体系）

実装タスクとは分離する。前提はすべて 0-1（実機接続済み）と、依存する実装タスクの完了。**記録は `docs/research/device-verification.md`（新規）に追記**する。

| ID | 名称 | 前提（依存） | 確認内容 | 対応要件 |
|---|---|---|---|---|
| D1 | 実機接続と起動疎通 | T25 | Metro 起動 → アプリ描画 → 再起動で目的地・記録が復元 | 受け入れ基準 5 / FR-01, FR-09 |
| D2 | 鳥の向き・回転の目視確認 | D1, T08, T22 | 鳥が目的地方向（**±5°**）／+90=右・−90=左／359→1 で逆回転しない | 受け入れ基準 1 / FR-06, E-14 |
| D3 | 権限フローと拒否時挙動 | D1, T18, T20, T25 | 初回ダイアログ／拒否時の案内・再要求／Mock で試す／クラッシュなし | FR-02 / §11.2 |
| D4 | 実機センサー実測と D-08/D-09 調整提案 | D1, T24 | 方位精度分布・更新間隔・真北/磁北の発生率・鮮度遷移 | FR-03, FR-08 / NFR-07 / §18-5,6,15 |
| D5 | 連続 30 分動作 | D1, T25 | 発熱・フリーズ・メモリ増加・アプリ継続動作 | NFR-07 |
| D6 | 地図表示とフォールバック | D1, T27 | Expo Go（キーなし）で地図＋マーカー2 点／キー無し注記／Web はフォールバック | FR-11 / 受け入れ基準 8 / §18-11 |
| D7 | オフライン・外部通信の実機確認 | D1, T25, T27 | 機内モードで鳥・距離・方位が動く／外部送信コードなし | NFR-01, NFR-02, NFR-09 |

---

## 2. マイルストーン

| M | 範囲 | 完了判定（Definition of Done） | 対応する受け入れ基準（requirements §8） |
|---|---|---|---|
| **M1: 純粋関数（P0〜P5）** | T01〜T10 | `npm run verify` 緑。E-01〜E-15 の**数値系**（E-01〜E-15 のうち T01〜T10 に割当済みの全ケース）が PASS。`domain/` に外部 import が無い（レビュー/grep） | **2**（単体テスト全 PASS）／**7**（tsc・npm test エラー 0） |
| **M2: Mock・永続化・アダプタ（P6〜P8）** | T11〜T18 | `npm run verify` 緑。Mock シナリオ・リポジトリ・マッピング・アダプタのテスト PASS。`__mocks__` 経由で AsyncStorage 実装がテストできる | 3（Jest での再現）／4・5 のロジック部分／FR-10・FR-12 |
| **M3: UI・実機動作（P9〜P11）** | T19〜T25 ＋ **D1, D2, D3** | `npm run verify` 緑。実機で鳥が目的地方向（±5°）、権限フローが破綻しない、再起動で復元 | **1**（鳥の向き）／**4**（精度・鮮度表示と記録）／**5**（再起動復元）／3（Mock で PC 再現） |
| **M4: 地図・仕上げ（P12〜P13）** | T26〜T28 ＋ **D4, D5, D6, D7** | `npm run verify` 緑。`expo export` の成果物生成、通信 grep 0 件、実測記録と閾値調整提案、地図表示／フォールバック確認 | **6**（外部通信なし）／**8**（キー未設定でも地図以外が動く）／NFR-07 実測 |

> M1 完了時点で「純粋関数の品質」は受け入れ基準 2・7 を満たす。M2 は実機なしで Mock により PC/Jest 上で完結する。M3 から実機（D タスク）を開始する。M4 の D4 の結果で D-08 / D-09 の閾値を調整する場合は **`domain/constants.ts` の `DEFAULT_THRESHOLDS` のみ**を変更し、T06 のテスト期待値を同時に更新する。

---

## 3. 共通ルール（全タスク必須・architecture 付録C の転記＋具体化）

### 3.1 コマンド（サンドボックス対応版）

```powershell
cd mobile

npm run typecheck     # tsc --noEmit。エラー 0 が完了条件
npm test              # = jest --runInBand（--runInBand は必須。生の npx jest は使わない）
npm run verify        # typecheck + test（各タスクの最終確認はこれ 1 本）

# テストのカバレッジ確認（T28 で実施。domain は 100% 目標）
npx jest --runInBand --coverage

# 本番バンドルの検証（T28 のみ）
npx expo export --platform android --max-workers 1 --no-bytecode
# ※ CLI が終了しない場合は background job で実行し、dist/metadata.json と
#   dist/_expo/static/js/android/*.js の生成で判定してジョブを停止する
```

| 禁止するコマンド | 理由 |
|---|---|
| `npx jest`（オプションなし） | ワーカー fork が EPERM（env §3.2 / pc §5-5） |
| `npx expo install` | 子プロセス spawn が EPERM（env §3.2）。依存追加自体が禁止（付録A） |
| `npx create-expo-app` | EPERM / 内部エラー（pc §2-1） |
| `npx expo config` | 無応答ハング（pc §7） |
| `npm install <pkg>`（`--ignore-scripts` なし） | ライフサイクルスクリプトが EPERM。**そもそも依存追加はしない** |
| `npx expo start --web` | web 依存 3 点が未導入のため不可（0-3） |

- 環境変数が必要な場合のみ: `$env:npm_config_cache="<workspace>\.cache\npm"`、`$env:CI="1"`、`$env:EXPO_NO_TELEMETRY="1"`（env §3.1、実機タスクでは加えて `$env:USERPROFILE` / `$env:HOME`）。
- 実機タスク（D1〜D7）の Metro 起動は **background job** で行い、出力をパイプで取り込まない（`expo start` は spawn 制約の影響を受けるため）。起動成功は Metro ログの `Android Bundled ... index.ts` と端末の描画で判定する（env §5.4）。

### 3.2 コーディング禁止事項（レビューで確認）

| # | ルール | 根拠 |
|---|---|---|
| 1 | **`process` / `require` を `.ts` / `.tsx` に書かない**（`@types/node` が無い）。`mobile/__mocks__/**/*.js` のみ `module.exports = require(...)` 可（`.js` は `tsc` 対象外） | architecture 付録C-2、§12.4 |
| 2 | **`any` 禁止**。`unknown` + 型ガード / 構造的部分型を使う | NFR-05 |
| 3 | **`domain/` に外部 import を書かない**（`react-native` / `expo-location` / AsyncStorage も不可）。純粋関数のみ | §2.2、付録C-3 |
| 4 | **`ui/` は `adapters/` を import しない**。`hooks/` も `adapters/` を import しない（ポート型だけ受ける） | §2.2、FR-12 |
| 5 | `ui/` で方位・距離・鮮度を**再計算しない**（domain の結果を表示するだけ） | §2.2 |
| 6 | `react-native-maps` の import は **`ui/screens/MapScreen.tsx` のみ**。`MapScreen.web.tsx` は import しない | §2.2、§9.6 |
| 7 | **`Date.now()` を鮮度計算に使わない**。鮮度は `Clock.nowMonotonicMs()` の差分のみ（`nowEpochMs()` はログ用に可） | 付録C-5、requirements §10 |
| 8 | **`throw` でエラーを通知しない**（計算関数は `null`、取得系は `ProviderError`）。例外は「保存失敗」など回復可能なものに限定 | 付録C-6、§11.1 |
| 9 | **`-0` / `NaN` / `Infinity` をデータモデルに入れない**（`-0` は `0` に正規化） | §3.2、§6.2 |
| 10 | **追加依存を入れない**（`react-native-reanimated` / `react-navigation` / `react-native-safe-area-context` / `@testing-library/react-native` / `expo-sqlite` / `react-dom` / `react-native-web` は禁止） | 付録A、付録B |
| 11 | **文言は `ui/labels.ts` にだけ書く**。domain / adapters は区分コード・`errorKey` のみ返す | 付録C-7、§6.11、D-12 |
| 12 | **`jest.useFakeTimers()` を使わない**。時間は `FakeClock` と `MockSensorController.advance()` で進める | §8.2、§12.4 |
| 13 | `noUncheckedIndexedAccess` のため、`arr[0]!` のような非 null 断言を書かない（`slice` / 分割代入 / ガードを使う） | 付録C-4、§6.12 |

### 3.3 テスト規約

- 場所とファイル名は architecture **§12.2** に固定。命名は **`*.test.ts`**（`__tests__/` 配下）。
- `domain/__tests__/` は **React Native を import しない**（jest-expo の環境に依存させない）。
- テストは**ネットワーク・実センサー・実タイマーに依存しない**（`FakeClock` を使う）。
- モックの置き場所は §12.4 のとおり: Mock センサーは自前実装、`expo-location` は**テストファイル内のインライン `jest.mock` のみ**（T18）、AsyncStorage は `mobile/__mocks__/.../async-storage.js`（T15）。
- E-01〜E-15 は §12.3 のマトリクスを正とする。本書の各タスクのテスト欄と §6.3（後述）で対応を二重化する。
- カバレッジ目標: `src/domain/**` は statements/branches 100%、`adapters/mock/**`・`hooks/navReducer.ts` は 90% 以上（T28 で確認）。

### 3.4 各タスク完了時のチェック（Definition of Done）

- [ ] `cd mobile; npm run verify` が緑（`typecheck` 0 / 全テスト PASS）
- [ ] 追加・変更したファイルが architecture §14 のパスと一致している
- [ ] `domain/` への外部 import 追加なし・`ui/`→`adapters/` import なし（該当タスクのみ）
- [ ] 使用した外部 API の出典節（notes §n.m）をコミットメッセージに記載（NFR-06）
- [ ] テストが「実時間・実センサー」に依存していない

---

## 4. 実装タスク詳細（T01〜T28）

### T01 基盤セットアップ（P0 / 中）

**目的**: 以降の全タスクが載る最小骨格（データモデル・閾値定数・ポート契約）を作り、`typecheck` / `test` が緑の出発点を固定する。

**変更・追加ファイル**
- `mobile/src/domain/types.ts`（新規）— §3.2 の型をそのまま（`GeoPoint` / `HeadingReference` / `HeadingAccuracyLevel` / `SensorSource` / `SensorFix` / `HeadingFix` / `DestinationOrigin` / `Destination` / `DestinationInput` / `DestinationPatch` / `SampleLogEntry` / `Freshness` / `GpsAccuracyClass` / `HeadingAccuracyClass` / `NavStatus` / `WarningCode` / `NavState`）
- `mobile/src/domain/constants.ts`（新規）— §6.1 の全定数（`EARTH_RADIUS_M` / `DEG2RAD` / `RAD2DEG` / `SAME_POINT_EPS_M` / `POLE_EPS_DEG` / `ARRIVAL_RADIUS_M` / `LOCATION_UPDATE_INTERVAL_MS` / `HEADING_DISPATCH_MIN_INTERVAL_MS` / `TICK_INTERVAL_MS` / `SAMPLE_LOG_CAPACITY` / `Thresholds` / `DEFAULT_THRESHOLDS` / `AccuracyProfile` / `SETTINGS_DEFAULT`）
- `mobile/src/ports/common.ts` / `location.ts` / `heading.ts` / `clock.ts` / `destinationRepository.ts` / `sampleLogRepository.ts` / `index.ts`（新規）— §4.1〜4.6 の契約をそのまま
- `mobile/src/domain/__tests__/constants.test.ts`（新規）
- `mobile/__mocks__/@react-native-async-storage/async-storage.js` は **T15** で作成（0.3-1）

**実装内容の要点**
- §3.2 の `readonly` を落とさない。配列は `readonly T[]`。`Date` / `Map` / `Set` / クラスインスタンスを保存型に使わない（§3.2 不変条件）
- §6.1 の数値は**一字も変えない**（後続タスクのテスト期待値の基準）。`Thresholds` はテストで差し替えるため `as const` にせず型注釈で定義
- ports は interface / type のみ。実装・既定値・分岐を書かない（§4）
- `ports/index.ts` は T01 時点で `./mockSensor` を再 export **しない**（`ScenarioId` が未作成のため。T11 で追記）
- `domain/` から外部 import をしない（§2.2）。`-0` / `NaN` を定数に入れない

**受け入れ基準**
- [ ] architecture §14 のツリーのうち `mobile/src/domain/` と `mobile/src/ports/` が存在し、ファイル名が一致
- [ ] `domain/types.ts` に §3.2 の全型が相違なく定義されている（`readonly` 含む）
- [ ] `domain/constants.ts` に §6.1 の全定数が含まれる
- [ ] ports 7 ファイルが §4 のシグネチャと一致（`Unsubscribe` / `ProviderErrorCode` / `PermissionOutcome` を含む）
- [ ] `any` 不使用・`domain/` に外部 import なし

**単体テスト**: `mobile/src/domain/__tests__/constants.test.ts`
- `DEFAULT_THRESHOLDS.freshness` = `3_000 / 10_000 / 30_000`（E-10 の前提を固定）
- `DEFAULT_THRESHOLDS.gpsAccuracy` = `10 / 30`、`arrivalRadiusM === 10`、`sampleLogCapacity === 300`
- `EARTH_RADIUS_M === 6_371_008.8`、`SAME_POINT_EPS_M === 0.01`、`POLE_EPS_DEG === 1e-9`
- `LOCATION_UPDATE_INTERVAL_MS === 1_000`、`HEADING_DISPATCH_MIN_INTERVAL_MS === 100`、`TICK_INTERVAL_MS === 1_000`
- `SETTINGS_DEFAULT.accuracyProfile === 'navigation'`
- E-xx: 直接対応なし（E-10 と FR-08 の境界値の基準を固定）

**依存タスク**: なし
**完了条件**: `cd mobile; npm run typecheck` → 0 エラー、`npm test` → **1 suite 以上 PASS**（現状は「No tests found」で exit 0 のため、T01 からテストが存在する状態にする）
**使用する外部 API と出典節**: なし（型・定数のみ）。`Location.Accuracy` の数値（4/6）はアダプタ（T18）に閉じ込めるため本タスクでは扱わない（notes §2.5 は T18 で参照）
**§18 確認ポイント**: なし

---

### T02 角度正規化（P1 / 小）

**目的**: 方位計算の土台となる度単位の正規化 2 種類を、`-0` / `NaN` / 360 境界の扱いまで固定して実装する。

**変更・追加ファイル**
- `mobile/src/domain/normalize.ts`（新規）— `toRadians` / `toDegrees` / `normalizeDegrees360` / `normalizeSignedDegrees`
- `mobile/src/domain/__tests__/normalize.test.ts`（新規）

**実装内容の要点**（§6.2）
- `normalizeDegrees360`: `[0, 360)`。非有限は `NaN`。`-0` は `0`。浮動小数誤差で 360 になるケースを `>= 360` で潰す
- `normalizeSignedDegrees`: `(-180, 180]`。`r <= -180` を `+360` して `-180 → 180`（一意性規則）。`-0` は `0`
- 丸め・クランプを途中で行わない（式の直前に 1 回だけ変換する方針＝§6.3 の浮動小数点注意と整合）
- `-0` を返さない（`return r === 0 ? 0 : r`）

**受け入れ基準**
- [ ] §6.2 の参照実装と等価な結果になる
- [ ] `-0` / `NaN` / `Infinity` の扱いがテストで固定されている
- [ ] `domain/` 内のみ import（実質 import なし）

**単体テスト**: `mobile/src/domain/__tests__/normalize.test.ts`
- E-07（`[0,360)`）: `-0 → 0` かつ `Object.is(v, -0) === false` / `0 → 0` / `-180 → 180` / `180 → 180` / `359.999 → 359.999` / `360 → 0` / `540 → 180` / `720 → 0` / `-1 → 359` / `NaN, Infinity, -Infinity → NaN`
- E-07（`(-180,180]`）: `-0 → 0` / `0 → 0` / `-180 → 180` / `180 → 180` / `359.999 → -0.001`（`toBeCloseTo`）/ `360 → 0` / `540 → 180` / `720 → 0` / `-1 → -1` / 非有限 → `NaN`
- E-07 プロパティ: 決定的に生成した乱数 10,000 件（自前 LCG。`Math.random` は使わない）で結果が `(-180,180]` に入る・2 回適用と 1 回適用が一致
- `toRadians(180) === Math.PI`、`toDegrees(Math.PI) === 180`（`toBeCloseTo`）

**依存タスク**: T01
**完了条件**: `npm run verify` 緑（`normalize.test.ts` 全 PASS）
**使用する外部 API と出典節**: なし（純粋関数）
**§18 確認ポイント**: なし

---

### T03 座標・目的地入力の検証（P5 から前倒し / 小）

**目的**: 距離・方位・ナビ合成・保存・UI が共通で使う「座標が有効か」「目的地入力が妥当か」の判定を 1 箇所に実装する（二重実装の禁止＝§6.11）。

**変更・追加ファイル**
- `mobile/src/domain/validation.ts`（新規）— `isValidLatitude` / `isValidLongitude` / `isValidGeoPoint` / `ValidationResult<T>` / `validateDestinationInput`
- `mobile/src/domain/__tests__/validation.test.ts`（新規）

**実装内容の要点**（§6.11）
- 緯度: `Number.isFinite && -90 <= lat <= 90`。経度: `-180 <= lon <= 180`
- 名前: `trim()` 後 **1〜50 文字**。空白のみは `name-required`
- `errorKey` の判定順を固定: `name-required` → `name-too-long` → `latitude-invalid` → `longitude-invalid`（両方不正なら `latitude-invalid`。`point-invalid` は point が `null` / 非オブジェクト等の型不正時のみ）
- `ok: true` のとき `value` は **trim 済み name と point**。`origin`（`DestinationOrigin`）は**呼び出し側が付与**する（§6.11 の注記を優先。戻り値の型は `ValidationResult<{ name: string; point: GeoPoint }>` とする＝呼び出し側で `origin` を足して `DestinationInput` を作る）
- 例外を投げない。NaN / `Infinity` / 範囲外は必ず `ok: false`

**受け入れ基準**
- [ ] E-12 の全入力で `false` / `null` 系の安全な結果を返す
- [ ] 名前の trim と長さ境界（50 / 51）が固定
- [ ] UI（T23）と保存前（T14/T15）が同じ関数を使える形になっている

**単体テスト**: `mobile/src/domain/__tests__/validation.test.ts`
- E-12: `NaN` / `Infinity` / `-Infinity` / `91` / `-90.0001` / `181` / `-180.0001` → `false`。`90` / `-90` / `180` / `-180` → `true`
- `isValidGeoPoint({latitude: NaN, longitude: 0}) → false`、`isValidGeoPoint({latitude: 90, longitude: 180}) → true`
- 名前: `'  東京駅  '` → `ok` かつ `value.name === '東京駅'` / `''` と `'   '` → `name-required` / 50 文字 OK / 51 文字 `name-too-long`
- 座標: 緯度 91 → `latitude-invalid`、経度 -181 → `longitude-invalid`、両方不正 → `latitude-invalid`（順序の固定）
- `ok` 時 `value` に `origin` が**含まれない**（呼び出し側付与の確認）

**依存タスク**: T01
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（純粋関数）
**§18 確認ポイント**: なし

---

### T04 haversine 距離（P2a / 小）

**目的**: 2 点間の大円距離を、対蹠点・日付変更線・極点・不正入力でも破綻せずに返す純粋関数を実装する。

**変更・追加ファイル**
- `mobile/src/domain/distance.ts`（新規）— `haversineDistanceM`
- `mobile/src/domain/__tests__/distance.test.ts`（新規）

**実装内容の要点**（§6.4）
- 式は §6.4 のとおり。`a` を `[0, 1]` に**クランプ**して `√(1−a)` の NaN を防ぐ（E-02 対蹠点）
- 入力 2 点のどちらかが `isValidGeoPoint()` を満たさなければ `null`（E-12）
- 戻り値は常に有限・`>= 0`。同一地点は `0`
- 度→ラジアン変換は 1 度だけ行う（§6.3 の浮動小数点注意）

**受け入れ基準**
- [ ] 既知値（赤道 1°・対蹠点・日付変更線）が許容誤差内
- [ ] 対蹠点で `NaN` を返さない
- [ ] 不正入力で `null`（throw しない）

**単体テスト**: `mobile/src/domain/__tests__/distance.test.ts`
- E-01: `haversineDistanceM(p, p) === 0`
- E-02: `(0,0)`↔`(0,180)` ≈ `π·EARTH_RADIUS_M` = `20_015_086.6 m`（±1 m）・`Number.isFinite`
- E-03: `(0,179.9)`↔`(0,-179.9)` ≈ `22_239.02 m`（±5 m）
- E-04: `(89.9,0)`↔`(89.9,10)` 有限値
- E-05: `(90,0)`↔`(0,0)` 有限値（距離は定義できる）
- E-12: 緯度 `NaN` / `Infinity` / `91` / 経度 `-181` を含む入力 → `null`
- 赤道 1° = `111_195.08 m`（±1 m）
- 既知距離の範囲検証: 東京駅 `(35.681236,139.767125)` ↔ 新宿駅 `(35.689592,139.700413)` が `6.1 km ± 0.3 km`（§10.6 の概値のため範囲検証）
- 可換性: `d(a,b)` と `d(b,a)` が `toBeCloseTo` で一致

**依存タスク**: T02（`toRadians` 等）, T03（`isValidGeoPoint`）
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（純粋関数）。定数は §6.1
**§18 確認ポイント**: なし

---

### T05 大円方位・相対方位（P2b / 中）

**目的**: 現在地→目的地の初期方位と、目標方位−端末方位の相対方位を、境界（同一地点・極点・日付変更線・正規化）まで固定して実装する。

**変更・追加ファイル**
- `mobile/src/domain/bearing.ts`（新規）— `initialBearingDeg` / `relativeBearingDeg`
- `mobile/src/domain/__tests__/bearing.test.ts`（新規）

**実装内容の要点**（§6.3 / §6.5）
- `initialBearingDeg(from, to)`: §6.3 の式。`null` 条件の**優先順位**は (1) `isValidGeoPoint` 不成立（E-12）→ (2) 緯度が極点（`|lat|` が 90° に `POLE_EPS_DEG` 以内、E-05）→ (3) 距離が `SAME_POINT_EPS_M` 未満（E-01、内部で `haversineDistanceM` を呼ぶ）
- 経度差は必ず `normalizeSignedDegrees(lon2 - lon1)` を経由させる（E-03）。最終正規化は `normalizeDegrees360()` を使う（`%` を直書きしない）
- `null`（方位なし）と `0`（真北）を混同しない。比較は `=== null`
- `relativeBearingDeg(target, heading)`: `normalizeSignedDegrees(normalizeDegrees360(target) - normalizeDegrees360(heading))`。どちらかが非有限なら `null`。`-180` は `180` に寄る（E-07）
- 検証の注意: E-06（真北/南/東/西）は**赤道上の点**で厳密に検証する。中緯度の「同緯度を東へ」は初期方位が 90° ちょうどにならない（地球が球のため）ので `90° ± 1°` で検証する（§6.3 の引き継ぎ事項）

**受け入れ基準**
- [ ] E-06 が赤道基準で厳密（±1e-9）に通る
- [ ] 日付変更線で東西を取り違えない
- [ ] 極点・同一地点・不正入力で `null`（throw しない）
- [ ] 相対方位の出力が常に `(-180, 180]`

**単体テスト**: `mobile/src/domain/__tests__/bearing.test.ts`
- E-06: `(0,0)→(1,0) = 0` / `→(0,1) = 90` / `→(-1,0) = 180` / `→(0,-1) = 270`（±1e-9）
- E-03: `(0,179.9)→(0,-179.9) ≈ 90°`（`toBeCloseTo(90, 6)`）
- 中緯度: `(35.68,139.76)→(35.68,139.77)` が `90 ± 1°`
- E-01: `initialBearingDeg(p, p)` → `null`
- E-05: `(90,0)→(0,0)` と `(0,0)→(90,0)` → `null`
- E-04: `(89.9,0)→(89.9,10)` 有限かつ `0 <= θ < 360`
- E-02: 対蹠点 `(0,0)→(0,180)` 有限かつ `0 <= θ < 360`
- E-12: `NaN` / `Infinity` / 範囲外座標 → `null`
- E-07: `relativeBearingDeg(0,180)=180` / `(0,-180)=180` / `(359,1)=2` / `(1,359)=-2` / target `540` → `180` / 非有限 → `null`
- E-07 プロパティ: 乱数 10,000 件で `(-180,180]` に収まる。`initialBearingDeg` は乱数 1,000 件で `0 <= θ < 360`

**依存タスク**: T02, T03, T04
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（純粋関数）
**§18 確認ポイント**: なし

---

### T06 鮮度・精度区分（P3 / 小）

**目的**: 経過時間から鮮度区分、GPS 精度・コンパス精度から精度区分を返す純粋関数を、境界の包含規則を固定して実装する（FR-08 / D-08 / D-09）。

**変更・追加ファイル**
- `mobile/src/domain/freshness.ts`（新規）— `elapsedMs` / `classifyFreshness`
- `mobile/src/domain/accuracy.ts`（新規）— `classifyGpsAccuracy` / `classifyHeadingAccuracy`
- `mobile/src/domain/__tests__/freshness.test.ts`（新規）
- `mobile/src/domain/__tests__/accuracy.test.ts`（新規）

**実装内容の要点**（§6.6 / §6.7）
- `elapsedMs(now, updated)`: `Math.max(0, now - updated)`。`NaN` が混じったら `0`（E-11 の防御）
- `classifyFreshness`: `null → null` / `0 <= e <= 3_000 → 'fresh'` / `<= 10_000 → 'aging'` / `<= 30_000 → 'stale'` / `> 30_000 → 'lost'`。閾値は `Thresholds` 引数（既定 `DEFAULT_THRESHOLDS`）
- `classifyGpsAccuracy`: `null` / 非有限 / **`<= 0` → 'unknown'**（ADR-01）/ `0 < a <= 10 → 'good'` / `<= 30 → 'fair'` / `> 30 → 'poor'`
- `classifyHeadingAccuracy`: `3 → 'good'` / `2 → 'fair'` / `1 → 'poor'` / `0 → 'uncalibrated'` / `null → 'unknown'`。**0 と null を区別**（E-09）

**受け入れ基準**
- [ ] 鮮度 9 点の境界テストが PASS（`2_999〜30_001`）
- [ ] GPS 精度 6 点の境界テストが PASS
- [ ] 方位精度 `0` が `uncalibrated`、`null` が `unknown` に分かれる
- [ ] `Date.now()` を使っていない（引数のみ）

**単体テスト**
- `mobile/src/domain/__tests__/freshness.test.ts`
  - 9 点: `2_999 → fresh` / `3_000 → fresh` / `3_001 → aging` / `9_999 → aging` / `10_000 → aging` / `10_001 → stale` / `29_999 → stale` / `30_000 → stale` / `30_001 → lost`（E-10: 30 秒ちょうどは stale、requirements §6 の更新済み文言に一致）
  - `null → null`、カスタム `Thresholds` で境界が動く
  - E-11: `elapsedMs(1_000, 2_000) === 0`、`elapsedMs(NaN, 100) === 0`、結果が負にならない
- `mobile/src/domain/__tests__/accuracy.test.ts`
  - E-09: 方位 `0→uncalibrated` / `1→poor` / `2→fair` / `3→good` / `null→unknown` / `4, -1, 1.5, NaN, Infinity → unknown`
  - GPS: `null→unknown` / `0→unknown` / `10→good` / `10.001→fair` / `30→fair` / `30.001→poor` / `-1→unknown` / `NaN→unknown`
  - カスタム `Thresholds` で GPS 境界が動く

**依存タスク**: T01
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（純粋関数）。notes §2.6 の精度 0〜3 の意味はコメントに引用（実装は数値のみ）
**§18 確認ポイント**: なし

---

### T07 ナビ状態合成（P4a / 中）

**目的**: 目的地・位置・方位・現在時刻から `NavState`（status・距離・目標方位・相対方位・鮮度・精度区分・警告）を合成する、要件の中心となる純粋セレクタを実装する。

**変更・追加ファイル**
- `mobile/src/domain/nav.ts`（新規）— `NavStateInput` / `computeNavState`
- `mobile/src/domain/__tests__/nav.test.ts`（新規）

**実装内容の要点**（§6.8 / ADR-02 / §9.5）
- 評価順序を §6.8 の表どおり固定: (1) 目的地なし → `no-destination`（鮮度・精度は計算して返す）→ (2) 位置なし → `locating` → (3) 距離・目標方位を計算（`distance` が `null` なら `locating`）→ (4) `distance < arrivalRadiusM`（**strict**）→ `arrived`（`relativeBearingDeg = null`）→ (5) `locationFreshness === 'lost'` → `position-lost`（鳥ニュートラル = `relativeBearingDeg = null`、ADR-02）→ (6) 方位なし → `heading-unknown` → (7) それ以外 → `navigating`
- 警告の合成は §6.8 の表のとおり。`warnings` は**表示優先度順**（位置系 → 方位系 → 精度系 → 基準系）に整列して返す
- E-09（方位精度 0/1）でも `relativeBearingDeg` は**計算して返す**（回転する）が警告を付ける
- `headingUnavailable`（プロバイダ自体が利用不可）のとき `heading-unavailable` を付ける
- `thresholds` は既定 `DEFAULT_THRESHOLDS`、引数で差し替え可能。副作用なし・throw なし

**受け入れ基準**
- [ ] status の優先順位が §6.8 の表と一致する
- [ ] 警告コードの合成と整列順が固定されている
- [ ] 到着判定が `distance < 10` の strict（`9.999 → arrived` / `10.0 → navigating`）
- [ ] 位置 `lost` で鳥ニュートラル（`relativeBearingDeg = null`）
- [ ] E-09 で相対方位は非 null かつ警告が付く

**単体テスト**: `mobile/src/domain/__tests__/nav.test.ts`
- E-15: `destination: null` → `status='no-destination'`、`distanceM` / `targetBearingDeg` / `relativeBearingDeg` が `null`（鮮度・精度は計算される）
- 位置なし → `locating`、`distanceM=null`
- E-01: 目的地 = 現在地 → `arrived`、`distanceM=0`、`targetBearingDeg=null`、`relativeBearingDeg=null`
- 到着境界: 距離 `9.999 → arrived` / `10.0 → navigating`
- E-08: `heading: null` → `heading-unknown`、`relativeBearingDeg=null`。`headingUnavailable: true` も同時に → `heading-unavailable` 警告
- E-09: `heading.accuracy = 0`（有効方位）→ `relativeBearingDeg` 非 null、`warnings` に `heading-uncalibrated`。`accuracy = 1` → `heading-low-accuracy`
- E-10: `now - received > 30_000` → `position-lost`、`relativeBearingDeg=null`、`warnings` に `location-lost`
- 位置 `stale`（25 秒）→ `navigating` のまま `location-stale` 警告のみ
- E-11: `received > now`（タイムスタンプ逆転）→ `locationFreshness='fresh'`、落ちない
- E-12: 目的地座標が `NaN` でも throw せず `status='locating'`
- 磁北: `heading.reference='magnetic-north'` → `magnetic-reference` 警告
- GPS 不良: `accuracy 50` → `gps-low-accuracy` 警告
- 警告の並び順: 複数条件で「位置系 → 方位系 → 精度系 → 基準系」の順になる
- `thresholds` 注入: カスタム `arrivalRadiusM` で到着境界が変わる

**依存タスク**: T03, T04, T05, T06
**完了条件**: `npm run verify` 緑（`nav.test.ts` 全 PASS）
**使用する外部 API と出典節**: なし（純粋関数）
**§18 確認ポイント**: なし

---

### T08 最短経路の回転角（P4b / 小）

**目的**: 鳥の回転を「累積角度」で持ち、目標方位へ最短経路で補間するための純粋関数を実装する（FR-06 / E-14）。

**変更・追加ファイル**
- `mobile/src/domain/rotation.ts`（新規）— `nextContinuousAngleDeg` / `reduceContinuousAngle`
- `mobile/src/domain/__tests__/rotation.test.ts`（新規）

**実装内容の要点**（§6.9）
- `nextContinuousAngleDeg(prev, target)`: `base = normalizeDegrees360(prev)`、`delta = normalizeSignedDegrees(target - base)`、`return prev + delta`。非有限は `prev` を返す（防御）
- `reduceContinuousAngle(cont, maxAbs = 720)`: 360 の倍数だけ巻き戻す。非有限は `0`
- ニュートラル（`relativeBearingDeg === null`）と到着時の目標角度を `0°` にするのは**呼び出し側（T22）の責務**（ADR-03）。本関数は角度変換のみ

**受け入れ基準**
- [ ] 359°→1° が `+2°`（`361`）で、`-358°` の逆回転をしない
- [ ] `-180` は `180` に寄る（一意性規則）
- [ ] 累積値が `±720°` を超えない（`reduceContinuousAngle`）

**単体テスト**: `mobile/src/domain/__tests__/rotation.test.ts`
- E-14: `nextContinuousAngleDeg(359, 1) === 361` / `(1, 359) === -1` / `(0, 180) === 180` / `(0, -180) === 180`
- 見た目の一致: 乱数 1,000 件で `normalizeDegrees360(結果) === normalizeDegrees360(target)` かつ `|結果 − prev| <= 180`
- `reduceContinuousAngle(1080) <= 720` かつ `1080 % 360` と見た目が一致 / `(-1080) >= -720`
- 非有限入力: `nextContinuousAngleDeg(NaN, 10) === NaN` を返さず `prev`（`NaN`）を返す仕様を明示（`Number.isNaN` で確認）／`reduceContinuousAngle(NaN) === 0`
- `reduceContinuousAngle(700)` は変化なし（`±720` 以内）

**依存タスク**: T02
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（純粋関数）
**§18 確認ポイント**: なし（`Animated` の外挿確認は T22 / D2）

---

### T09 表示整形（P5a / 小）

**目的**: 距離・経過時間・方位の表示文字列を domain の純粋関数として実装し、UI から計算ロジックを排除する（FR-07 / E-13）。

**変更・追加ファイル**
- `mobile/src/domain/format.ts`（新規）— `formatDistanceM` / `formatAgeMs` / `formatBearingDeg`
- `mobile/src/domain/__tests__/format.test.ts`（新規）

**実装内容の要点**（§6.10）
- `formatDistanceM`: `null` / 負値 / 非有限 → `'—'`。生値が `1_000` 未満は `m` 表記（`Math.round` で整数）、`1_000` 以上は `km`（小数 2 桁）。**閾値判定は丸め前の生値**（`999.6 → '1000 m'`、E-13 の確定解釈）
- `formatAgeMs`: `null` / 非有限 / 負値 → `'—'`。それ以外は `Math.round(ms/1000)` + `' 秒'`
- `formatBearingDeg`: `null` / 非有限 → `'—'`。`normalizeDegrees360` → 整数丸め → 丸め後 360 なら `0`（`359.6 → '0°'`）
- 表示専用であり内部値は丸めない

**受け入れ基準**
- [ ] E-13 の表（`999.6 / 1_000 / 999.4 / null`）が固定
- [ ] 負値・非有限で `'—'`（throw しない）
- [ ] 方位 `359.6` が `'0°'` になる

**単体テスト**: `mobile/src/domain/__tests__/format.test.ts`
- E-13: `null → '—'` / `0 → '0 m'` / `999.4 → '999 m'` / `999.5 → '1000 m'`（生値 <1000 の m 表記で四捨五入）/ `999.6 → '1000 m'` / `1_000 → '1.00 km'` / `1_500 → '1.50 km'` / `1_234.567 → '1.23 km'`
- `-1` / `NaN` / `Infinity` → `'—'`
- `formatAgeMs`: `null → '—'` / `0 → '0 秒'` / `12_000 → '12 秒'` / `-1 → '—'`
- `formatBearingDeg`: `null → '—'` / `0 → '0°'` / `123.4 → '123°'` / `359.6 → '0°'` / `360 → '0°'` / `-1 → '359°'` / `NaN → '—'`

**依存タスク**: T01（＋T02 の `normalizeDegrees360`）
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（純粋関数）
**§18 確認ポイント**: なし

---

### T10 リングバッファ・サンプル集計（P5b / 小）

**目的**: FR-09 のサンプル記録を支えるリングバッファ操作と、開発用画面の簡易集計を純粋関数として実装する。

**変更・追加ファイル**
- `mobile/src/domain/ringBuffer.ts`（新規）— `ringPush` / `ringTrim`
- `mobile/src/domain/summarize.ts`（新規）— `summarizeSamples`
- `mobile/src/domain/__tests__/ringBuffer.test.ts`（新規）
- `mobile/src/domain/__tests__/summarize.test.ts`（新規・§12.3「追加の必須テスト」）

**実装内容の要点**（§6.12 / §9.7 / 0.3-7）
- `ringPush(buffer, item, capacity)`: 末尾追加、容量超過で先頭（最古）から捨てる。元配列を変更しない（`readonly`）。`capacity < 1` は `[]`、非整数は `Math.floor`
- `ringTrim(buffer, capacity)`: 古いものを捨てて容量に収める（新しい方を残す）
- `noUncheckedIndexedAccess` 対応: `buffer[0]` を直接使わず `slice` / スプレッドで実装
- `summarizeSamples(entries, thresholds)`: 平均 GPS 精度（`null` を除外し、件数も返す）／方位精度 0〜3 の分布／古いサンプル率（`locationAgeMs > thresholds.freshness.staleMaxMs` の割合）。空配列では平均 `null`・率 `null`

**受け入れ基準**
- [ ] 300 件で満杯 → 301 件目で先頭が落ちる
- [ ] `capacity = 1` / `capacity = 0` / 小数容量で破綻しない
- [ ] 元配列が不変（`Object.is` / 参照比較で確認）
- [ ] 集計の平均・分布・古い率が計算できる（空配列でも落ちない）

**単体テスト**
- `mobile/src/domain/__tests__/ringBuffer.test.ts`
  - 300 件 push → length 300。301 件目 → length 300・先頭が 2 件目・末尾が新要素（FR-09 上限）
  - `capacity = 1` → 最新 1 件のみ / `capacity = 0` / `-1` → `[]` / `capacity = 0.5` → `[]`（floor）
  - 空配列への push / 空配列の trim
  - 入力配列が変更されていない（スプレッド前後で比較）
- `mobile/src/domain/__tests__/summarize.test.ts`
  - 空配列: 平均 `null`・分布 `[0,0,0,0]`・古い率 `null`
  - GPS 精度が `null` 混在: 平均は非 null のみで計算し、件数が正しい
  - 方位精度の分布（0/1/2/3/null の混在）
  - 古い率: `staleMaxMs` を超える `locationAgeMs` の割合が正しい（カスタム `Thresholds` で境界が動く）

**依存タスク**: T01 のみ（角度正規化は使わない）
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（純粋関数）
**§18 確認ポイント**: なし

---

### T11 シナリオ・プリセット定義（P6a / 中）

**目的**: Mock センサーが再生するシナリオ（データ）とデモ用プリセット目的地を定義し、Mock 制御ポートを確定させる。シナリオのサンプリングは純粋関数にする（§8.4）。

**変更・追加ファイル**
- `mobile/src/domain/scenario.ts`（新規）— `ScenarioId` / `ScenarioKeyframe` / `Scenario` / `sampleScenario` / `scenarioPhaseMs` / `SCENARIOS` / `DEMO_SCENARIO_ID`
- `mobile/src/domain/presets.ts`（新規）— `DEMO_PRESETS`（§10.6 の 3 件）
- `mobile/src/ports/mockSensor.ts`（新規・0.3-2 により P0 から移動）— §4.7 の `MockMode` / `MockSensorSnapshot` / `MockSensorController`
- `mobile/src/ports/index.ts`（追記）— `export * from './mockSensor'`
- `mobile/src/domain/__tests__/scenario.test.ts`（新規）

**実装内容の要点**（§8.4 / §10.6）
- シナリオは**データ**として定義: `static` / `straight` / `rotate` / `gps-dropout` / `heading-unknown` / `stale-data`（`low-accuracy` は任意＝余力があれば追加、完了条件には含めない）。座標は東京駅周辺のダミー値でよい
- `sampleScenario(scenario, elapsedMs)`: **step-hold**（直前のキーフレームを保持）
- `scenarioPhaseMs(scenario, elapsedMs)`: `repeat` なら折り返し、`repeat: false` なら `durationMs` でクランプ
- `stallAfterMs` はデータとして保持し、「以降サンプルを出さない」判定は T12 のコントローラが行う（本タスクはデータと純粋サンプリングのみ）
- `DEMO_PRESETS`: 東京駅 / 新宿駅 / 東京タワーの 3 件、`origin: 'preset'`。座標は §10.6 の概値のまま
- `ports/mockSensor.ts` は §4.7 の契約をそのまま（実装・既定値なし）

**受け入れ基準**
- [ ] `SCENARIOS` の各シナリオが §8.4 の一覧（長さ・内容・期待 UI 状態）を満たす
- [ ] キーフレームが昇順で、先頭が `atMs = 0`（データ不変条件）
- [ ] `gps-dropout` に `location: null` の区間、`heading-unknown` に `headingDeg: null`、`stale-data` に `stallAfterMs` がある
- [ ] `DEMO_PRESETS` が 2〜3 件で有効座標

**単体テスト**: `mobile/src/domain/__tests__/scenario.test.ts`
- 各シナリオで `for (let t = 0; t <= duration; t += 100)` の全フレームを再現し、`location` / `heading` の有無が期待どおり（`static` は常にあり、`gps-dropout` は 5〜15 秒で `location === null`、`heading-unknown` は常に `headingDeg === null`）
- `sampleScenario` の step-hold（キーフレーム間の値が直前と一致）／範囲外時刻はクランプ
- `scenarioPhaseMs`: `repeat: true` で折り返す（60 秒シナリオの 65 秒 → 5 秒）／`repeat: false` で `durationMs` にクランプ
- データ不変条件: `keyframes` が昇順・先頭 `atMs === 0`・`labelJa` が非空・`id` が一意（E-xx なし。FR-10 / NFR-10 の再現性）
- `DEMO_PRESETS`: 件数 2〜3、`id` 一意、`name` 非空、全点が `isValidGeoPoint`、`origin === 'preset'`。東京駅↔新宿駅が `6.1 km ± 0.3 km`（範囲検証。§10.6 の概値のため）

**依存タスク**: T01, T03, T04
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（データ定義・純粋関数）。シナリオの内容は architecture §8.4、プリセット座標は §10.6
**§18 確認ポイント**: なし

---

### T12 FakeClock・Mock センサー制御（P6b / 中）

**目的**: テスト・シナリオ再生の時間軸を決定的にする `FakeClock` と、手動値・シナリオ・時間加速を一元管理する `MockSensorControllerImpl` を実装する。

**変更・追加ファイル**
- `mobile/src/adapters/clock/FakeClock.ts`（新規）— `advance(ms)` / `setEpoch(ms)` を持つ `Clock` 実装。**タイマーを使わない**
- `mobile/src/adapters/mock/MockSensorControllerImpl.ts`（新規）— §4.7 の `MockSensorController` 実装
- `mobile/src/adapters/__tests__/mockSensor.test.ts`（新規）

**実装内容の要点**（§8.2 / §4.7）
- `advance(byMs)` が「時計を進める唯一の入口」。Jest ではテストが明示的に呼ぶ（`jest.useFakeTimers()` は使わない）
- 購読者には **snapshot が変化したときだけ**通知する（不変条件）。`Math.random()` を使わない（決定論）
- シナリオ再生: `scenarioPhaseMs` / `sampleScenario`（T11）を使い、`scenarioElapsedMs = 経過 × timeScale`。`stallAfterMs` 以降は `locationPresent` / `headingPresent` を `false` にする
- 手動モード: 緯度経度・精度・方位・方位精度・方位基準を保持。`setTimeScale` は `1 | 2 | 5 | 10`
- `reset()` でモード・手動値・シナリオ経過を初期化

**受け入れ基準**
- [ ] 同一操作列で常に同一 snapshot（決定論）
- [ ] 値が変わらない `set*` で通知が発生しない
- [ ] シナリオの `locationPresent` / `headingPresent` が §8.4 の期待どおり
- [ ] `advance()` を呼ばない限り時間が進まない

**単体テスト**: `mobile/src/adapters/__tests__/mockSensor.test.ts`
- 初期 snapshot（`mode: 'manual'`、値は `null`、`timeScale: 1`、`scenarioId: null`）
- `setManualLocation` / `setManualHeading` で snapshot が更新され、購読者に 1 回通知。同じ値の再設定では通知なし
- `selectScenario('rotate')` + `advance(1_000)` → `scenarioElapsedMs === 1_000`。`setTimeScale(10)` + `advance(100)` → `1_000`（時間加速）
- `gps-dropout`: 6 秒時点で `locationPresent === false`、16 秒時点で `true`
- `heading-unknown`: `headingPresent === false`
- `stale-data`: `stallAfterMs` 以降に `locationPresent === false` かつ `headingPresent === false`
- `reset()` で初期状態に戻る／`advance(-100)` は状態を変えない（防御）
- E-xx: 直接の E 番号なし（FR-10 / NFR-10 の再現性）

**依存タスク**: T01（`Clock` ポート）, T11（`scenario` / `ports/mockSensor`）
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（メモリ内実装。`Clock` は §4.4 の自前ポート）
**§18 確認ポイント**: なし（自前 Mock は `expo-location` に依存しない＝§8.1、§18-10 の確認は不要）

---

### T13 Mock 位置・方位プロバイダ（P6c / 小〜中）

**目的**: `MockSensorController` の snapshot を `LocationProvider` / `HeadingProvider` の契約に変換する Mock 実装を提供し、`expo-location` なしで hooks/UI を動かせるようにする（FR-10 / FR-12 / NFR-10）。

**変更・追加ファイル**
- `mobile/src/adapters/mock/MockLocationProvider.ts`（新規）
- `mobile/src/adapters/mock/MockHeadingProvider.ts`（新規）
- `mobile/src/adapters/mock/mockTicker.ts`（新規）— 実アプリ駆動用 `setInterval` ラッパー（テスト対象外）
- `mobile/src/adapters/__tests__/mockProviders.test.ts`（新規）

**実装内容の要点**（§4.2 / §4.3 / §8.2）
- `MockLocationProvider`: 権限系は Mock（`granted` / `canAskAgain: true`）。`start()` で controller を購読し、snapshot に位置があるとき `SensorFix`（`source: 'mock'`、受信時刻は注入された `Clock`）を `onFix` に渡す。`getLastKnown()` は直近の fix または `null`。`unsubscribe` は**冪等**で、解除後はコールバックしない
- `MockHeadingProvider`: `isAvailable() → true`。snapshot の方位値から `HeadingFix`（`headingDeg: null` のとき `reference: 'unknown'`）を生成。`start` / `unsubscribe` の契約は同じ
- `mockTicker.ts`: `startMockTicker(controller, intervalMs)` が `stop()` を返す薄いラッパー。**テスト対象外**（`setInterval` はテストで使わない＝§12.4）で、T25 の App からのみ使う
- `Math.random` / 実時間への依存なし。二重購読・解除漏れを起こさない

**受け入れ基準**
- [ ] 両プロバイダが §4.2 / §4.3 の契約を満たす（`start` は throw しない）
- [ ] `source === 'mock'` が付与される
- [ ] `unsubscribe` 冪等・解除後にイベントが来ない
- [ ] `expo-location` を import していない

**単体テスト**: `mobile/src/adapters/__tests__/mockProviders.test.ts`
- `MockLocationProvider`: `start` 後に controller の位置を変更 → `onFix` に `SensorFix`（`source: 'mock'`、`receivedAtMonotonicMs` が `FakeClock` の値）
- `getLastKnown()` が直近 fix を返す／未取得なら `null`
- `unsubscribe` 後に `onFix` が呼ばれない／`unsubscribe` を 2 回呼んでも例外なし
- `MockHeadingProvider`: 手動方位 `0` → `headingDeg: 0`。`null` → `headingDeg: null`, `reference: 'unknown'`。`isAvailable() === true`
- 方位精度 `0〜3` がそのまま `accuracy` に入る
- `mockTicker`: テストなし（コードレビューのみ。§12.4 の「テストを書かない範囲」に準ずる）

**依存タスク**: T12
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（自前実装）。`LocationProvider` / `HeadingProvider` の契約は §4.2 / §4.3
**§18 確認ポイント**: なし

---

### T14 ストレージ codec・キー・InMemory リポジトリ（P7a / 中）

**目的**: 永続化の JSON 形式と破損データの扱いを純粋関数（codec）に隔離し、テスト用・開発用の InMemory 実装で `DestinationRepository` / `SampleLogRepository` を満たす（§10.1〜§10.3）。

**変更・追加ファイル**
- `mobile/src/adapters/storage/storageKeys.ts`（新規）— §10.1 のキー文字列（`yoridorimidori/destinations/v1` / `yoridorimidori/samples/v1` / quarantine キーのプレフィックス）
- `mobile/src/adapters/storage/codec.ts`（新規・純粋）— `encodeDestinations` / `decodeDestinations` / `encodeSamples` / `decodeSamples` / `trimSamplesToCharBudget`
- `mobile/src/adapters/memory/InMemoryDestinationRepository.ts`（新規）
- `mobile/src/adapters/memory/InMemorySampleLogRepository.ts`（新規）
- `mobile/src/adapters/__tests__/storageCodec.test.ts`（新規）
- `mobile/src/adapters/__tests__/memoryRepositories.test.ts`（新規）

**実装内容の要点**（§10.1〜§10.3 / §10.5）
- 保存形式: `{ schemaVersion: 1, items, selectedId }`（目的地）と `{ schemaVersion: 1, items }`（サンプル）
- `decode*` は**例外を投げず判別可能な結果**を返す: `{ ok: true; value; droppedCount }` または `{ ok: false; reason: 'parse' | 'shape' | 'future-version'; raw }`
- 要素単位の検証: 型不正・座標範囲外は**その要素だけ読み飛ばす**（`droppedCount`）。重複 `id` は先勝ち。`selectedId` が `items` に無ければ `null`。未知フィールドは無視。`schemaVersion` 未知（`> 1`）は `future-version`、欠落は v1 として読む
- `decodeSamples` は容量超過分を `ringTrim`（T10）で「新しい方から容量分」に切り詰める
- `trimSamplesToCharBudget(entries, maxChars)`: §10.5 のサイズ防御（200,000 文字超過時に最新 150 件へ）を**純粋関数**として切り出し、テスト可能にする
- InMemory 実装: ポート §4.5 / §4.6 を満たす。ID と作成時刻は**注入した `Clock` と `idFactory`** から決める（決定論・テスト容易性のための実装詳細。ADR には含めない）

**受け入れ基準**
- [ ] codec が破損 JSON・型不正要素・未知 schemaVersion で落ちない
- [ ] 要素単位の読み飛ばしと `droppedCount` が正しい
- [ ] `selectedId` の補正・重複 id の先勝ちが固定
- [ ] InMemory が `DestinationRepository` / `SampleLogRepository` の全メソッドを満たす

**単体テスト**
- `mobile/src/adapters/__tests__/storageCodec.test.ts`
  - encode→decode のラウンドトリップ（目的地・サンプル）
  - 不正 JSON → `ok: false, reason: 'parse'`（throw しない）
  - `items` が配列でない → `reason: 'shape'`
  - 要素の型不正（`latitude` が文字列）と範囲外座標 → その要素だけ読み飛ばし・他は救済・`droppedCount` 一致
  - `selectedId` が存在しない id → `null` に補正／重複 id → 先勝ち
  - 未知フィールドは無視／`schemaVersion: 2` → `future-version`／`schemaVersion` 欠落 → v1 として読む
  - サンプル容量超過（301 件保存）→ 新しい 300 件だけ残る
  - `trimSamplesToCharBudget`: 小さな `maxChars` で最新側が残り、件数上限（150 相当）をテスト用に縮めて検証
- `mobile/src/adapters/__tests__/memoryRepositories.test.ts`
  - `add` → `list` が作成順／`update` は存在しない id で `null`／`remove` で選択中なら `readSelection()` が `null`
  - `writeSelection` は存在しない id を保存しない（`readSelection()` が `null`）
  - `clear()`／サンプルの `append` → `list` の順序・容量
  - ID が一意で作成時刻が注入 `Clock` に従う

**依存タスク**: T01, T03（`isValidGeoPoint`）, T10（`ringTrim`）
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（純粋 codec とメモリ内実装）。保存形式は §10.1〜§10.3、サイズ制約の数値は notes §6.1（AsyncStorage 公式 Limits）
**§18 確認ポイント**: なし

---

### T15 AsyncStorage リポジトリ・公式 Jest モック（P7b / 中）

**目的**: `DestinationRepository` / `SampleLogRepository` の実機・開発用実装を AsyncStorage 上に作り、CRUD・破損時退避・書込戦略・サイズ防御までを公式 Jest モックで検証する（FR-01 / FR-09 / §10）。

**変更・追加ファイル**
- `mobile/__mocks__/@react-native-async-storage/async-storage.js`（新規）— 公式モックの再 export（`module.exports = require('@react-native-async-storage/async-storage/jest/async-storage-mock')`）
- `mobile/src/adapters/storage/AsyncStorageDestinationRepository.ts`（新規）
- `mobile/src/adapters/storage/AsyncStorageSampleLogRepository.ts`（新規）
- `mobile/src/adapters/__tests__/asyncStorageRepositories.test.ts`（新規）

**実装内容の要点**（§10.4 / §10.5 / §12.4 / §11.3 #11,#12）
- 目的地系: 操作ごとに read-modify-write。**同一インスタンス内で Promise チェーンにより直列化**（`this.queue = this.queue.then(...)`）
- サンプル: メモリ上のリングに追加し、**5 秒または 20 件**のいずれかでまとめて `setItem`。`flush()` は保留分を即時書き込み。5 秒判定は注入 `Clock` の epoch 比較で行い、**`setTimeout` を使わない**（決定論・§12.4 のタイマー不使用に適合）
- 破損時: `decode*` の `ok: false` → 生文字列を `yoridorimidori/quarantine/<key>/<epochMs>` に 1 件退避してから初期化。要素読み飛ばしは件数を警告へ
- 警告チャネル: コンストラクタ注入の `onWarning(message)` で通知（ポートを汚さないための実装詳細。hooks は T20 で `storage/warning` に変換）
- サイズ防御: `setItem` 前に文字列長を確認し 200,000 文字超なら `trimSamplesToCharBudget`（T14）で最新 150 件に縮めて再試行。失敗時は `onWarning` + アプリ継続
- 文字列のみ保存（`JSON.stringify` / `JSON.parse`）。外部送信なし・暗号化前提なし（NFR-09）

**受け入れ基準**
- [ ] CRUD・選択復元が実装され、新規インスタンスで読み直せる（永続化の証明）
- [ ] 破損 JSON でクラッシュせず、退避キーが書かれる
- [ ] サンプルの書込が「5 秒 or 20 件」でまとまる／`flush()` で確定する
- [ ] 保存失敗でアプリが落ちない（`onWarning` + 呼び出し側で継続）

**単体テスト**: `mobile/src/adapters/__tests__/asyncStorageRepositories.test.ts`
- `add` → 新しいインスタンスの `list()` に反映（永続化）／`update`・`remove`・`clear`／`readSelection` / `writeSelection`
- 破損 JSON を直接 `setItem` → `list()` が `[]` を返し、quarantine キーに退避され、`onWarning` が呼ばれる
- 要素の型不正混在 → 有効要素のみ返り、`onWarning` に件数が出る
- `selectedId` が壊れている → `null` 補正
- サンプル: `append` 5 件 + `flush()` → `setItem` が 1 回だけ呼ばれる（`jest.spyOn`）／20 件で自動書込／容量 300 を超えると先頭が落ちる／保存済み 301 件を `load()` すると新しい 300 件に切り詰められる
- 保存失敗（`setItem` を reject に差し替え）→ `append` が reject し、`onWarning` が呼ばれ、アプリは例外を外へ漏らさない
- E-xx: 直接の E 番号なし（FR-01 / FR-09、§11.3 #11, #12）

**依存タスク**: T14
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: AsyncStorage **2.2.0** の `getItem` / `setItem` / `removeItem` / `getAllKeys` / `multiGet` / `multiSet` / `clear`（notes §6.1）。公式 Jest モック `@react-native-async-storage/async-storage/jest/async-storage-mock`（notes §6.1、§4.3）。`__mocks__` は **`.js`** に置き `tsc` 対象外にする（§12.4）
**§18 確認ポイント**: §18-9（`AppState` によるフラッシュは**採用しない**。デバウンス + アンマウント時 `flush()` で運用し、失われても最大 5 秒分と割り切る）

---

### T16 センサー値 → ドメイン型マッピング（P8a / 小）

**目的**: `expo-location` の生データを、ライブラリ型を import しない**構造的部分型**で受けてドメイン型へ変換する純粋関数を実装する（§5.3 / D-05）。

**変更・追加ファイル**
- `mobile/src/domain/sensorMapping.ts`（新規）— `LocationReadingLike` / `HeadingReadingLike` / `mapLocationReading` / `mapHeadingReading` / `toHeadingAccuracyLevel`
- `mobile/src/domain/__tests__/sensorMapping.test.ts`（新規）
- ※ `decideHeadingAvailability` は **T17 の `adapters/expo/headingStrategy.ts`** に置く（0.3-8）

**実装内容の要点**（§5.3 / §5.2 / §6.7）
- ライブラリの型を import しない（domain の外部依存ゼロを守る）。構造的部分型で受ける
- `mapLocationReading`: 緯度・経度が有限かつ範囲内でなければ `null`（呼び出し側が `invalid-data` にする）。`accuracy` は有限かつ `>= 0` のときのみ採用、他は `null`。`timestamp` は有限なら `capturedAtEpochMs` に採用、他は `null`。`receivedAt*` と `source` は引数
- `mapHeadingReading`（D-05）: `accuracy` を `toHeadingAccuracyLevel` で 0〜3 / null に正規化 → `trueHeading` が有限かつ `0 <= x <= 360` なら `normalizeDegrees360` + `'true-north'` → だめなら `magHeading` が有効なら `'magnetic-north'` へフォールバック → どちらも不可なら `headingDeg: null, reference: 'unknown'`。**`coords.heading` は参照しない**
- `toHeadingAccuracyLevel`: 整数の 0〜3 のみ採用、他（`4`, `-1`, `1.5`, `NaN`, `Infinity`）は `null`
- throw しない

**受け入れ基準**
- [ ] E-08 の磁北フォールバックが仕様どおり
- [ ] `-1` を含む全不正値が `null` / `'unknown'` に落ちる
- [ ] `expo-location` の型を import していない

**単体テスト**: `mobile/src/domain/__tests__/sensorMapping.test.ts`
- E-08: `{ trueHeading: -1, magHeading: 123.4, accuracy: 2 }` → `headingDeg = 123.4`, `reference = 'magnetic-north'`, `accuracy = 2`
- E-08: `trueHeading = -1` かつ `magHeading = -1` → `headingDeg: null`, `reference: 'unknown'`
- `trueHeading = 0` → `0`, `'true-north'`／`trueHeading = 360` → `0`, `'true-north'`（正規化）／`trueHeading = 359.9` → `359.9`
- E-12: `latitude: NaN` / `longitude: Infinity` / 範囲外 → `mapLocationReading` が `null`
- `accuracy: NaN` / `-1` → `null`／`accuracy: 0` → `0`（マッピングは値をそのまま渡す。区分は T06）
- `timestamp: NaN` → `capturedAtEpochMs: null`
- `toHeadingAccuracyLevel`: `0,1,2,3` はそのまま／`4, -1, 1.5, NaN, Infinity` は `null`
- プロパティ: 乱数 1,000 件の heading reading で `headingDeg` は `null` か `[0,360)` のいずれか

**依存タスク**: T01, T02
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: なし（純粋関数。ライブラリ型は import しない）。変換仕様の根拠は notes §2.4（`LocationObject`）・§2.6（`LocationHeadingObject` と `-1`）、D-05
**§18 確認ポイント**: なし

---

### T17 SystemClock・方位可用性判定（P8b / 小）

**目的**: 鮮度計算の基準となる単調時計の実装と、`Platform.OS` 依存の方位可用性判定を**純粋関数に切り出して**提供する（§5.4 / NFR-03）。

**変更・追加ファイル**
- `mobile/src/adapters/clock/SystemClock.ts`（新規）
- `mobile/src/adapters/expo/headingStrategy.ts`（新規・純粋）
- `mobile/src/adapters/__tests__/systemClock.test.ts`（新規）
- `mobile/src/adapters/__tests__/headingStrategy.test.ts`（新規）

**実装内容の要点**（§5.4 / §5.2）
- `SystemClock.nowMonotonicMs()`: `performance.now()` が関数として存在すれば使用（`globalThis` を `unknown` 経由で型ガード。`any` 禁止）。無ければ `Date.now()` を使い、**内部保持の前回値との `max()`** で単調性を保証
- `nowEpochMs()`: `Date.now()`
- テスト容易性のためコンストラクタで `perfNow` / `epochNow` を注入可能にする（省略時は実環境。実装詳細）
- `headingStrategy.decideHeadingAvailability({ platform, hasWatchHeading })`: `'available' | 'unsupported-platform' | 'missing-api'` を返す純粋関数。`Platform.OS` の参照は**アダプタ（T18）1 箇所のみ**（§5.2）

**受け入れ基準**
- [ ] `nowMonotonicMs` が巻き戻らない（壁時計が戻っても単調）
- [ ] `performance` 不在時のフォールバックが動作する
- [ ] `Platform` 分岐が純粋関数に閉じている（このファイルは `react-native` を import しない）

**単体テスト**
- `mobile/src/adapters/__tests__/systemClock.test.ts`
  - 注入した `perfNow` の値がそのまま返る／`perfNow` が戻っても `max()` で単調
  - `perfNow: null` のとき `epochNow` が使われ、`epochNow` が戻っても単調
  - `nowEpochMs` が注入 `epochNow` を返す
- `mobile/src/adapters/__tests__/headingStrategy.test.ts`
  - `{ platform: 'android', hasWatchHeading: true }` → `'available'`
  - `{ platform: 'ios', hasWatchHeading: true }` → `'available'`
  - `{ platform: 'web', hasWatchHeading: true }` → `'unsupported-platform'`
  - `{ platform: 'android', hasWatchHeading: false }` → `'missing-api'`

**依存タスク**: T01
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: `performance.now()` は **⚠️ 未確認**（RN 上の有無。§18-4）。`Date.now()` は JS 標準。`Platform.OS` は【RN コア】（§0.2）。`watchHeadingAsync` のプラットフォーム制約は notes §2.6
**§18 確認ポイント**: **§18-4**（`performance.now()` の有無）。機能検出を実装し、無い場合は `Date.now()` + `max()` に必ず倒す。実機での確認は D4 で行う

---

### T18 Expo 位置・方位アダプタ（P8c / 中）

**目的**: `expo-location` を購読して `LocationProvider` / `HeadingProvider` を実装し、権限・サービス状態・エラー・不正値を `ProviderError` に変換する薄い境界層を作る（§5.1 / §5.2）。

**変更・追加ファイル**
- `mobile/src/adapters/expo/ExpoLocationProvider.ts`（新規）
- `mobile/src/adapters/expo/ExpoHeadingProvider.ts`（新規）
- `mobile/src/adapters/__tests__/expoAdapters.test.ts`（新規。`expo-location` は**テストファイル内でインライン `jest.mock`**＝§12.4）

**実装内容の要点**（§5.1 / §5.2）
- 位置: `watchPositionAsync` のオプションは `accuracy: Location.Accuracy.BestForNavigation`（=6。`balanced` プロファイルでは `High`=4）と `timeInterval: 1_000`。**`distanceInterval` は指定しない**（未確認のため）。数値（4/6）はアダプタ内のマップ表に閉じ込め、domain に出さない
- 権限: `requestForegroundPermissionsAsync` / `getForegroundPermissionsAsync` → `PermissionOutcome`（`status` / `canAskAgain` / `androidAccuracy`）。`denied` で `start()` されたら `permission-denied` を `onError` して**watch を張らない**
- サービス OFF: `hasServicesEnabledAsync() === false` → `services-disabled`
- 変換: 受信時に `Clock` で `receivedAt*` を付け、T16 の `mapLocationReading` を使う。`null` は `invalid-data` を `onError` して**サンプルを捨てる**
- `getLastKnown()`: `getLastKnownPositionAsync({ maxAge: 30_000 })` → 同じ変換。無ければ `null`
- `start()` は**絶対に throw しない**（`Promise<Unsubscribe>`）。`watch` の `errorHandler(reason: string)` → `runtime-error`
- 方位: `isAvailable()` は T17 の `decideHeadingAvailability` に `Platform.OS` を渡す（注入可能にしてテストする）。`start()` で不可なら `unsupported-platform` を `onError` して購読しない。`watchHeadingAsync` のコールバック → `mapHeadingReading`（T16）。**`coords.heading` を参照しない**（コードレビューで確認）

**受け入れ基準**
- [ ] 権限・サービス状態・エラー・不正値の全経路が `ProviderError` に落ちる（throw しない）
- [ ] watch のオプションが §5.1 の設計値どおり
- [ ] `unsubscribe` が `subscription.remove()` を呼び、冪等
- [ ] `coords.heading` を使用していない

**単体テスト**: `mobile/src/adapters/__tests__/expoAdapters.test.ts`（インライン `jest.mock('expo-location', ...)`）
- `watchPositionAsync` が `{ accuracy: 6, timeInterval: 1000 }` で呼ばれ、`distanceInterval` キーが無い（`balanced` プロファイルでは `4`）
- 有効な `LocationObject` を流す → `onFix` に `SensorFix`（`source: 'device'`、`FakeClock` の受信時刻）
- `latitude: NaN` の `LocationObject` → `onError('invalid-data')`、`onFix` は呼ばれない
- `errorHandler('reason')` → `onError('runtime-error')`
- 権限 `denied` → `start()` で `permission-denied`、`watchPositionAsync` 未呼び出し
- `hasServicesEnabledAsync() === false` → `services-disabled`、watch 未呼び出し
- `getLastKnownPositionAsync` が `null` → `null`
- `unsubscribe()` で `subscription.remove()` が呼ばれる（2 回呼んでも 1 回）
- 方位: `{ trueHeading: -1, magHeading: 123.4, accuracy: 2 }` → `onFix` が `123.4` / `magnetic-north`（E-08）
- 方位: `platform: 'web'`（注入）→ `unsupported-platform`、`watchHeadingAsync` 未呼び出し
- 方位: `errorHandler` → `runtime-error`
- E-xx: E-08 / E-12（マッピング経由）

**依存タスク**: T16, T17
**完了条件**: `npm run verify` 緑
**使用する外部 API と出典節**: `Location.watchPositionAsync(options, callback, errorHandler?)` / `getLastKnownPositionAsync` / `requestForegroundPermissionsAsync` / `getForegroundPermissionsAsync` / `hasServicesEnabledAsync`（notes **§2.3**）、`LocationObject` / `LocationObjectCoords` / `LocationPermissionResponse`（notes **§2.4**）、`Location.Accuracy.BestForNavigation = 6` / `High = 4`（notes **§2.5**）、`watchHeadingAsync` / `LocationHeadingObject` / `trueHeading === -1`（notes **§2.6**）、Expo Go の制約（notes **§2.7**）。`Platform` は【RN コア】
**§18 確認ポイント**: **§18-5 / §18-6**（実機での前景取得・更新間隔は D4 で確認）、**§18-10**（`jest-expo` の同梱モックには依存しない。テストは自前インライン `jest.mock`）

---

### T19 状態・リデューサ・セレクタ・ティッカー（P9a / 中）

**目的**: アプリ全体の状態型・純粋リデューサ・純粋セレクタを実装し、UI が `NavState` を表示するだけになる土台を作る（§7.1〜§7.3）。

**変更・追加ファイル**
- `mobile/src/hooks/navState.ts`（新規）— `NavAppState` / `createInitialNavAppState`
- `mobile/src/hooks/navReducer.ts`（新規）— `NavAction` / `navReducer`
- `mobile/src/hooks/selectors.ts`（新規）— `selectSelectedDestination` / `selectNavState` / `selectLatestError`
- `mobile/src/hooks/useTicker.ts`（新規）— 1 秒 tick の薄いフック（`setInterval`。テスト対象外）
- `mobile/src/hooks/__tests__/navReducer.test.ts`（新規。セレクタのテストも同ファイルに置く＝§12.2 のファイル一覧に合わせる）

**実装内容の要点**（§7.1 / §7.2 / §7.3 / §7.4）
- `navReducer` は**純粋**（`Date.now()` / `Math.random()` / ストレージ呼び出し禁止）。§7.2 のアクションをすべて実装
- `sensor/location`: `nowMonotonicMs = Math.max(state.nowMonotonicMs, fix.receivedAtMonotonicMs)`
- `destination/removed`: 削除対象が選択中なら `selectedDestinationId = null`
- `mock/toggled`: `sensor/reset` 相当も同時に行う
- `errors`: 最大 10 件・同一 `code` が連続する場合は置き換え
- `samples/appended`: リングバッファ（`state.thresholds.sampleLogCapacity`、T10 の `ringPush`）
- `selectNavState` は `computeNavState()` に**そのまま委譲**（二重実装禁止）。`thresholds` 省略時は `state.thresholds`
- `useTicker`: `setInterval(TICK_INTERVAL_MS)` を開始し、アンマウントで `clearInterval`。テスト対象外（§12.6）

**受け入れ基準**
- [ ] 全アクションで新 state を返し、元 state を変更しない
- [ ] 選択中目的地の削除で選択が解除される
- [ ] サンプルが容量でリングになる
- [ ] エラーが最大 10 件・同一 code 連続で置換される
- [ ] `selectNavState` の結果が `computeNavState` と一致（二重実装がない）

**単体テスト**: `mobile/src/hooks/__tests__/navReducer.test.ts`
- `createInitialNavAppState`: `booted=false`、目的地・位置・方位が空/null、`thresholds` が注入値
- `boot/completed` / `permission/changed` / `sensor/location`（`Math.max` 規則）/ `sensor/heading` / `sensor/reset` / `heading/unavailable` / `tick` / `mock/toggled`（センサーリセット同時）/ `storage/warning` / `errors/cleared`
- `provider/error`: 10 件上限・同一 code 連続の置換
- 目的地: `destination/selected` / `added`（`select` フラグ）/ `updated` / `removed`（選択解除）/ `destinations/replaced`
- `samples/loaded` / `samples/appended`（容量 300 で先頭が落ちる）
- セレクタ: `selectSelectedDestination` が見つかる/見つからない/`null`／`selectNavState` が `computeNavState` の結果と deep equal（同一入力）／`selectLatestError`
- E-xx: 直接の E 番号なし（§12.3「リデューサ」の必須テスト）

**依存タスク**: T06, T07, T10
**完了条件**: `npm run verify` 緑（`navReducer.test.ts` 全 PASS）
**使用する外部 API と出典節**: React の `useReducer` / `useEffect` / `useRef`（React 標準・【RN コア】相当）、`setInterval`（JS 標準）。外部ライブラリなし
**§18 確認ポイント**: なし

---

### T20 useNavApp（起動・購読・永続化の統合）（P9b / 大）

**目的**: 起動ロード・権限フロー・購読ライフサイクル・ティッカー・サンプル記録・目的地操作・Mock 切替を 1 本のフックに集約し、`App.tsx` からポート実装を注入できるようにする（§7.4 / §2.4 / §11.5）。

**変更・追加ファイル**
- `mobile/src/hooks/useNavApp.ts`（新規）— `NavAppDeps` / `NavApp` / `useNavApp`
- テストファイルは**作らない**（§12.6: `useNavApp` のテストは RNTL 追加が必要なため対象外）

**実装内容の要点**（§7.4 / §2.4 / §11.5）
- `deps` は**ポート型のみ**（`adapters` を import しない＝FR-12）。`App.tsx` が実体を渡す
- 起動: `destinations.list()` / `readSelection()` / `sampleLog.load()` を並列 → `boot/completed` / `samples/loaded`。空ならプリセット投入（T11、D-07）
- 権限: 起動時に `getPermissionState()` → 必要なら `requestPermission()` → `permission/changed`。`granted` のときだけ `getLastKnown()` → `start()`。**再要求はユーザー操作起点のみ**（自動ループ禁止）
- 購読: `useEffect` で `start()`。アンマウント/依存変化で `unsubscribe()`。**解決前アンマウントの race ガード**（`disposed` フラグ + 解決直後の解除）を §11.5 の形で実装
- dispatch 間引き: 位置は即時、**方位は 100ms に 1 回**（`useRef` の最終 dispatch 時刻。`HEADING_DISPATCH_MIN_INTERVAL_MS`）
- ティッカー: `useTicker`（T19）で `tick` を dispatch
- サンプル記録: 位置フィックス時のみ 1 件 `append`（`locationAgeMs` / `headingAgeMs` は記録時点で確定）。失敗は `storage/warning`
- 目的地操作: `validateDestinationInput` → `add` / `update` / `remove` → dispatch → `writeSelection` も永続化
- 「現在地を目的地に」: 位置 `null` または `lost` なら `false` を返す
- Mock 切替: 旧購読を解除 → `sensor/reset` → 新プロバイダで再購読（OFF なら実プロバイダへ戻す）
- クリーンアップ: 位置・方位の `unsubscribe`、ティッカー停止、`sampleLog.flush()`

**受け入れ基準（レビュー観点チェックリスト）**
- [ ] `hooks/` から `adapters/` を import していない（grep レビュー）
- [ ] race ガード（`disposed`）が実装され、二重購読しない
- [ ] 方位 dispatch が 100ms 間引きになっている（`useRef`）
- [ ] ティッカーと購読がアンマウントで確実に解除される
- [ ] Mock 切替で旧購読が解除され、`sensor/reset` が dispatch される
- [ ] `useNavApp` は `MockSensorController` を知らない（コントローラは `App.tsx` → 開発画面へ直接渡す）

**単体テスト**: **なし**（§12.6 の明示範囲）。担保方法:
- リデューサ・セレクタ（T19）、Mock プロバイダ（T13）、永続化（T15）、アダプタ（T18）のテストで契約を固める
- 購読ライフサイクルはコードレビュー（上記チェックリスト）と D1〜D3 の実機確認で担保

**依存タスク**: T13, T15, T17, T18, T19
**完了条件**: `npm run verify` 緑（既存テスト全 PASS・typecheck 0）＋上記レビュー観点のチェック完了
**使用する外部 API と出典節**: React hooks（`useReducer` / `useEffect` / `useRef` / `useMemo` / `useState`）、`setInterval`（JS 標準）。外部ライブラリなし
**§18 確認ポイント**: **§18-9**（`AppState` を使う場合のみ API 形を先に確認。既定は使わない）。**§18-8**（設定アプリ遷移はしない。`showSettingsHint()` は文言表示のみ）

---

### T21 文言（labels）・テーマ（P10a / 小）

**目的**: 画面に出す日本語文言を純粋関数として 1 箇所に集約し、色だけに依存しない表示（NFR-08 / D-12）の土台を作る。

**変更・追加ファイル**
- `mobile/src/ui/labels.ts`（新規）— `navStatusLabel` / `freshnessLabel` / `gpsAccuracyLabel` / `headingAccuracyLabel` / `headingReferenceLabel` / `warningLabel` / `validationErrorLabel`
- `mobile/src/ui/theme.ts`（新規）— 色（`good` / `fair` / `poor` / `unknown`）、余白、文字サイズ
- `mobile/src/ui/__tests__/labels.test.ts`（新規）

**実装内容の要点**（§9.4 / §9.8 / §6.11 / D-12）
- 文言は §9.4 の一覧（`目的地を選んでください` / `測位中` / `方位不明` / `データが古い` / `ナビゲーション中` / `到着`、`最新` / `やや古い` / `古い` / `途絶`、`良好` / `普通` / `不良` / `不明`、`真北基準` / `磁北基準`、警告文）に沿う
- `uncalibrated`（要校正）と `unknown`（不明）で**文言を分ける**（§6.7）。磁北は「磁北基準」を含む
- `validationErrorLabel(errorKey)`: §6.11 の `errorKey`（`name-required` / `name-too-long` / `latitude-invalid` / `longitude-invalid` / `point-invalid`）を日本語化（architecture に一覧が無いための追加。§6.11 の「UI 文言キー」を実装するもの）
- `theme.ts` は区分色を定義するが、**文字ラベルを必ず併記**する前提（色だけに依存しない）
- 純粋関数のみ（`react-native` を import しない。`labels.ts` はテスト可能な純粋関数に保つ）

**受け入れ基準**
- [ ] 全 `NavStatus` / `Freshness`（`null` 含む）/ `GpsAccuracyClass` / `HeadingAccuracyClass` / `HeadingReference` / `WarningCode` に非空文言がある
- [ ] `uncalibrated` と `unknown` の文言が異なる
- [ ] 空文字を返す分岐がない

**単体テスト**: `mobile/src/ui/__tests__/labels.test.ts`
- `navStatusLabel`: `NavStatus` 全 6 値が非空文字列・相互に一意
- `freshnessLabel`: `fresh / aging / stale / lost / null` が非空
- `gpsAccuracyLabel`: `good / fair / poor / unknown` が非空
- `headingAccuracyLabel`: `uncalibrated` と `unknown` が**異なる**文言・非空
- `headingReferenceLabel`: `'magnetic-north'` の文言に「磁北」を含む
- `warningLabel`: `WarningCode` 全 9 値が非空
- `validationErrorLabel`: `errorKey` 全 5 値が非空
- E-xx: 直接の E 番号なし（NFR-08 / D-12）

**依存タスク**: T01（型のみ）
**完了条件**: `npm run verify` 緑（`labels.test.ts` 全 PASS）
**使用する外部 API と出典節**: なし（純粋関数）
**§18 確認ポイント**: なし

---

### T22 メイン画面（鳥・ステータス・ErrorBoundary）（P10b / 大）

**目的**: 鳥が目的地の方向を向くメイン画面と、精度・鮮度・警告を数値＋文言で表示するステータスパネル、描画例外を隔離する ErrorBoundary を実装する（FR-06 / FR-07 / FR-08 / §9.2〜§9.5 / §11.4）。

**変更・追加ファイル**
- `mobile/src/ui/components/Bird.tsx`（新規）
- `mobile/src/ui/components/NavStatusPanel.tsx`（新規）
- `mobile/src/ui/components/ErrorBoundary.tsx`（新規）
- `mobile/src/ui/screens/MainScreen.tsx`（新規）

**実装内容の要点**
- **着手前に `react-native-svg` 15.16.0 の公式 API を確認する**（§18-1。未確認のため）。使う要素は `Svg` / `Path` / `Circle` 程度に最小化。**確認できない場合は `View` の組み合わせで代替**してよい（要件は満たす）
- 鳥の回転は **`Animated.View` の `transform: [{ rotate }]`**（RN コア）。SVG 要素の `transform` は使わない（§9.3、§18-1）
  - `Animated.Value` に累積回転（度）を持つ。目標値は `nextContinuousAngleDeg`（T08）、ニュートラル（`relativeBearingDeg === null`）と到着（`arrived`）は目標 `0°`（ADR-03）
  - `Animated.timing(value, { toValue, duration: 250, easing, useNativeDriver: true })`
  - **`interpolate` の範囲外挙動は未確認（§18-2）** のため、`reduceContinuousAngle` で `±720°` に収め `inputRange: [-720, 720]` を使う安全側の実装を基本とする。初回マウントはアニメーションせず即時設定（ちらつき防止）
  - `+` が時計回り（`+90` = 右）として扱う。目視確認は D2（§18-3）
- `NavStatusPanel`: §9.4 の表の全項目（GPS 精度 生値＋区分 / GPS 鮮度＋経過秒 / 方位精度 / 方位鮮度＋経過秒 / 方位基準 / 総合状態 / 警告）。**数値と文言を併記**（色は補助）。`ui/labels.ts`（T21）以外に文言を書かない
- `MainScreen`: §9.2 のレイアウト（目的地名 or「目的地を選んでください」/ 鳥 / 距離（`formatDistanceM`）/ 相対方位の数値 / 状態 / 警告 / 画面切替ボタン群）。到着時は距離実値・鳥上向き・「到着」を大きく・相対方位は `—`（§9.5）。**表示専用**（props で `NavState` と目的地名・コールバックを受け取り、`hooks` / `adapters` を import しない）
- `ErrorBoundary`: クラスコンポーネント（`getDerivedStateFromError` / `componentDidCatch`）。フォールバックは「表示中にエラーが発生しました」＋「目的地・記録は消えていません」＋`[メインに戻る]`。`componentDidCatch` は `console.error` のみ（§11.4）
- アクセシビリティ: 鳥のコンテナに `accessibilityLabel`（例「目的地は右方向」）と `accessibilityRole="image"`（§9.4、NFR-08）

**受け入れ基準（レビュー観点）**
- [ ] `ui/` が `hooks/` / `adapters/` を import していない（§2.2）
- [ ] 方位・距離・鮮度を再計算していない（domain の値を表示するだけ）
- [ ] 文言が `labels.ts` 経由になっている
- [ ] 数値＋文言で表示され、色だけに依存していない
- [ ] 鳥の回転が `Animated.View` で、SVG の transform を使っていない
- [ ] 初回マウントでアニメーションせず即時表示

**単体テスト**: **なし**（UI レンダリングテストは §12.6 で対象外。RNTL は追加依存のため不可）。目視確認は **D2**（鳥の向き ±5°・最短経路）で行う
**依存タスク**: T07, T08, T09, T21
**完了条件**: `npm run verify` 緑（typecheck 0・既存テスト PASS）＋レビュー観点チェック完了
**使用する外部 API と出典節**: `react-native-svg` 15.16.0 は **⚠️ 未確認**（§18-1・notes に記載なし。実装冒頭に公式ドキュメントで `Svg` / `Path` / `Circle` の props を確認）。`Animated` / `Easing` / `View` / `Text` / `Pressable` / `StyleSheet` は【RN コア】
**§18 確認ポイント**: **§18-1**（SVG API → 確認できなければ `View` 代替）、**§18-2**（`interpolate` の外挿 → `[-720,720]` 安全側）、**§18-3**（`rotate` の正方向 → D2 で目視）

---

### T23 目的地一覧・追加画面（P11a / 中）

**目的**: 目的地の一覧・選択・削除と、名前・緯度・経度による新規登録（「現在地を使う」含む）の画面を実装する（FR-01 / §9.1）。

**変更・追加ファイル**
- `mobile/src/ui/screens/DestinationListScreen.tsx`（新規）
- `mobile/src/ui/screens/DestinationAddScreen.tsx`（新規）
- テストファイルは作らない（§12.6）

**実装内容の要点**（§9.1 / §6.11 / FR-01）
- 一覧: 登録済み目的地を表示し、タップで選択、削除ボタンで削除。選択中が削除されたときの解除はリデューサ（T19）が担う
- 追加: 名前・緯度・経度の `TextInput`、「現在地を使う」ボタン（位置 `null` / `lost` のときは**無効＋理由表示**）、保存ボタン
- 検証は **domain の `validateDestinationInput`（T03）** を使う（UI で再実装しない）。エラー文言は `validationErrorLabel`（T21）
- 入力された緯度経度の文字列→数値変換は UI 側で行うが、**範囲・NaN の判定は domain** に委ねる
- データは props（`destinations` / `selectedId` / `currentPoint`）で受け、操作はコールバック（`onSelect` / `onDelete` / `onAdd` / `onUseCurrentLocation`）で返す。`hooks` / `adapters` を import しない
- `ScrollView` / `TextInput` / `Pressable` は RN コア。スライダー等の追加依存は使わない（付録A-2）

**受け入れ基準（レビュー観点）**
- [ ] 検証ロジックが domain の 1 関数に集約されている（二重実装なし）
- [ ] 位置が `lost` のとき「現在地を使う」が無効で理由が出る
- [ ] `ui/` から `hooks/` / `adapters/` を import していない
- [ ] 追加成功・失敗がコールバックの戻り値で判定できる

**単体テスト**: **なし**（UI）。FR-01 の受け入れ基準のうち「不正な緯度経度は登録できない」は T03 のテストで担保し、CRUD と再起動復元は **D1** で確認する
**依存タスク**: T03, T20, T21
**完了条件**: `npm run verify` 緑（typecheck 0・既存テスト PASS）＋レビュー観点チェック
**使用する外部 API と出典節**: `TextInput` / `Pressable` / `ScrollView` / `View` / `Text` / `StyleSheet` は【RN コア】。外部ライブラリなし
**§18 確認ポイント**: なし

---

### T24 開発用画面（記録・Mock 操作）（P11b / 中）

**目的**: FR-09 のサンプル一覧・簡易集計と、FR-10 の Mock 手動入力・シナリオ選択・時間加速を開発ビルドで操作できる画面を実装する（§9.7）。

**変更・追加ファイル**
- `mobile/src/ui/screens/DevLogScreen.tsx`（新規）
- `mobile/src/ui/components/MockControlPanel.tsx`（新規）
- テストファイルは作らない（§12.6）

**実装内容の要点**（§9.7 / §8.3 / ADR-08）
- サンプル一覧: 直近 20 件を表形式で表示（時刻 HH:MM:SS、緯度、経度、GPS 精度、方位、方位精度、位置経過、方位経過）
- 簡易集計: `summarizeSamples`（T10）の結果（平均 GPS 精度＋件数、方位精度の分布、古いサンプル率）を表示
- `MockControlPanel`: 手動入力（緯度・経度・GPS 精度・方位・方位精度・方位基準、**`TextInput` + 増減ボタン**。スライダーは追加依存のため使わない＝ADR-08/付録A-2）、シナリオ選択（ラジオボタン風のボタン群）、`Mock ON/OFF`、時間加速 `×1/×2/×5/×10`
- `MockSensorController` は **props で受け取る**（`useNavApp` は Mock コントローラを知らない＝§7.4）。操作は `setMode` / `setManualLocation` / `setManualHeading` / `selectScenario` / `setTimeScale`
- 表示は `devToolsVisible`（T25 の `App.tsx` が `__DEV__` から決定）のときのみ。リリースビルドでは操作 UI を出さない（コードは同梱）
- 保存警告・直近エラー（`storageWarnings` / `errors`）も表示する（§11.3 #11, #12）

**受け入れ基準（レビュー観点）**
- [ ] `__DEV__` / `devToolsVisible` で表示が制御されている
- [ ] Mock 操作が controller の公開 API のみで行われている
- [ ] サンプル表示件数が 20 件・集計値が T10 の関数経由
- [ ] 追加依存（スライダー等）を使っていない

**単体テスト**: **なし**（UI）。集計ロジックは T10 のテストで担保。表示・操作の確認は **D4**（実測のついでにシナリオ切替・手動値を確認）
**依存タスク**: T10, T12, T13, T20, T21
**完了条件**: `npm run verify` 緑（typecheck 0・既存テスト PASS）＋レビュー観点チェック
**使用する外部 API と出典節**: `TextInput` / `Pressable` / `ScrollView` / `View` / `Text` / `StyleSheet` は【RN コア】。外部ライブラリなし
**§18 確認ポイント**: なし

---

### T25 App（コンポジションルート）・画面切替・権限案内（P10c / 中）

**目的**: 具体実装（Clock・リポジトリ・実/Mock プロバイダ）を生成して `useNavApp` に注入する唯一の場所を作り、画面切替と権限拒否時の案内を接続する（§2.4 / §7.5 / §11.2）。

**変更・追加ファイル**
- `mobile/App.tsx`（**全面置換**。§14 の「★コンポジションルート」）
- `mobile/src/ui/components/ScreenSwitcher.tsx`（新規）
- `mobile/src/ui/components/PermissionNotice.tsx`（新規）
- `mobile/index.ts` は変更しない

**実装内容の要点**（§2.4 / §7.5 / §11.2 / §14）
- `App.tsx` の責務は**生成と注入のみ**（ロジック・計算・分岐を書かない）:
  - `SystemClock`（T17）、`AsyncStorageDestinationRepository` / `AsyncStorageSampleLogRepository`（T15）、`ExpoLocationProvider` / `ExpoHeadingProvider`（T18）を生成
  - `MockSensorControllerImpl`（T12）と `MockLocationProvider` / `MockHeadingProvider`（T13）を生成し、`mockMode` に応じて注入する provider を切り替える（`useMemo`）
  - `DEFAULT_THRESHOLDS`、`devToolsVisible = __DEV__` を決める
  - `const { state, nav, actions } = useNavApp(deps)` → 画面へ props 渡し
- 画面遷移は `useState<ScreenId>`（ADR-07。`react-navigation` は使わない）。`ScreenId = 'main' | 'destinations' | 'add' | 'dev'`。**`'map'` は T27 で追加**（0.3-6）
- `ScreenSwitcher`: 表示専用（`screen` とコールバック、children を受け取る）
- `PermissionNotice`: §11.2 の拒否画面（理由＋対処＋`[再要求]`＋`[Mock で試す]`。`canAskAgain === false` のときは「設定アプリで位置情報を許可してください」の**文言のみ**。`Linking.openSettings` 等は使わない＝§18-8）。メイン画面のステータス領域に常設（別画面に飛ばさない）
- `ErrorBoundary`（T22）で `MainScreen` を包む
- `devToolsVisible` のときだけ開発画面への導線を出す（§9.7）
- `StatusBar` は既存雛形どおり `expo-status-bar`（付録B）を使う

**受け入れ基準（レビュー観点）**
- [ ] `App.tsx` に計算・判定・表示ロジックが無い（生成と注入のみ）
- [ ] `hooks` / `ui` に実装（`adapters`）が漏れていない（App だけが具体型を知る）
- [ ] Mock 切替で provider が差し替わり、旧購読が解除される（`useNavApp` の依存配列に provider を含める）
- [ ] 権限拒否時もクラッシュせず、メイン画面のステータス領域に案内が出る
- [ ] `process` / `require` を書いていない／追加依存なし

**単体テスト**: **なし**（UI 統合。§12.6）。起動・権限フロー・復元は **D1 / D3** で確認
**依存タスク**: T13, T15, T17, T18, T20, T22, T23, T24
**完了条件**: `npm run verify` 緑（typecheck 0・既存テスト PASS）＋レビュー観点チェック完了
**使用する外部 API と出典節**: `expo-status-bar`（既存雛形で使用済み・付録B）、`__DEV__`（【RN コア】）、React hooks。設定アプリ遷移 API は**使わない**（§18-8）
**§18 確認ポイント**: **§18-8**（`Linking.openSettings` 等は未確認のため不使用・文言のみ）、**§18-14**（Web 依存は追加しない）

---

### T26 地図 Region 計算（P12a / 小）

**目的**: 現在地と目的地を 1 画面に収める地図表示領域の計算を、`react-native-maps` に依存しない純粋関数として実装する（§9.6）。

**変更・追加ファイル**
- `mobile/src/ui/mapRegion.ts`（新規）— 自前型 `MapRegion`（`{ latitude, longitude, latitudeDelta, longitudeDelta }`）と `regionForPoints`
- `mobile/src/ui/__tests__/mapRegion.test.ts`（新規）

**実装内容の要点**（§9.6 / §18-12）
- `regionForPoints(a, b): MapRegion | null`。中心は 2 点の中点。既定の倍率 `2.5`、最小ズーム `0.005`（`latitudeDelta = max(|Δlat| * 2.5, 0.005)`、`longitudeDelta = max(|Δlon| * 2.5, 0.005)`）
- 不正座標（NaN/範囲外）は `null`（E-12 と整合）。throw しない
- `react-native-maps` の型を import しない（自前型を使う。§18-12 の `Region` の厳密な型は未確認のため、T27 で構造的に渡す）
- 日付変更線をまたぐ 2 点は**本フェーズでは非対応**（`|Δlon|` をそのまま使う）。その旨をコメントで明記

**受け入れ基準**
- [ ] 同一地点でも最小ズーム（`0.005`）が保証される
- [ ] 2 点の中点が中心になる
- [ ] 不正座標で `null`

**単体テスト**: `mobile/src/ui/__tests__/mapRegion.test.ts`
- 同一地点: 中心がその点、`latitudeDelta` / `longitudeDelta` が `>= 0.005`
- 2 点: 中心が中点（`toBeCloseTo`）、`latitudeDelta >= |Δlat| * 2.5` かつ `>= 0.005`
- 不正: `latitude: NaN` / 範囲外 → `null`
- E-xx: E-12（不正座標）と整合

**依存タスク**: T01
**完了条件**: `npm run verify` 緑（`mapRegion.test.ts` 全 PASS）
**使用する外部 API と出典節**: なし（純粋関数）。`Region` の型は **⚠️ 未確認**（§18-12・notes §3.3 の README 使用例のみ）のため自前型を使う
**§18 確認ポイント**: **§18-12**（`Region` の厳密型 → 自前型＋構造渡しで回避）

---

### T27 地図画面（native / web フォールバック）（P12b / 中）

**目的**: `react-native-maps` による地図画面（現在地・目的地・進行方向のマーカー）と、Web 用フォールバックを画面として実装する（FR-11 / D-03 / §9.6 / ADR-10）。

**変更・追加ファイル**
- `mobile/src/ui/screens/MapScreen.tsx`（新規・native。`react-native-maps` を import する唯一のファイル）
- `mobile/src/ui/screens/MapScreen.web.tsx`（新規・web フォールバック。`react-native-maps` を import **しない**）
- `mobile/src/ui/components/ScreenSwitcher.tsx`（追記）— `ScreenId` に `'map'` を追加、メイン画面の地図ボタンから遷移
- テストファイルは作らない（`mapRegion` は T26 でテスト済み。§12.6）

**実装内容の要点**（§9.6 / ADR-10 / §18-11 / §18-12）
- `MapView`: `initialRegion={regionForPoints(current, destination)}`（マウント時のみ）、`showsCompass`、`showsMyLocationButton`、`liteMode`（任意・Android のみ）。**`showsUserLocation` は使わない**（権限なしで無言で失敗する【確定】）
- 現在地は**自前の `Marker`**（`SensorFix` の座標）。目的地も `Marker`（`coordinate` / `title` / `identifier`）
- Google Maps API キー: **Expo Go では不要**（notes §3.5）。キー無しで空白になる可能性に備え、**「地図が表示されない場合は API キー未設定です」注記を常設**し、`[方位表示に戻る]` を置く（アプリは壊れない）
- `location === null` のときは地図を描画せず、フォールバック文言を出す（§9.6）
- `MapScreen.web.tsx`: `react-native-maps` を import せず「Web では地図を表示できません」＋方位サマリ＋戻るボタン
- `MapScreen` は `ErrorBoundary`（T22）で包む（地図の例外がメインを巻き込まない＝§11.4）
- 実装時に万が一 `MapScreen.web.tsx` が解決されない場合（§18-11）は、`Platform.OS === 'web'` の明示分岐に切り替えてよい（1 ファイル内で判定）

**受け入れ基準（レビュー観点）**
- [ ] `react-native-maps` の import が `MapScreen.tsx` のみ（grep レビュー）
- [ ] `MapScreen.web.tsx` が地図ライブラリを import していない
- [ ] `showsUserLocation` を使っていない
- [ ] 現在地 `null` でクラッシュしない・フォールバック文言が出る
- [ ] キー未設定注記と戻る導線がある

**単体テスト**: **なし**（地図描画は §12.6 の対象外）。`MapScreen.web` のフォールバック文言はコードレビューで確認、地図・マーカー・キーなし挙動は **D6** で確認
**依存タスク**: T25, T26
**完了条件**: `npm run verify` 緑（typecheck 0・既存テスト PASS）＋レビュー観点チェック
**使用する外部 API と出典節**: `MapView` の `initialRegion` / `showsCompass` / `showsMyLocationButton` / `liteMode`、`Marker` の `coordinate` / `title` / `identifier`（notes **§3.3 / §3.4**）。Google Maps API キーは Expo Go では不要・カスタムビルドで必須（notes **§3.5**）。Web 非対応（`MapView.web.ts` が `UnimplementedView`、notes **§3.6**）。`Region` の厳密型は **⚠️ 未確認**（§18-12）
**§18 確認ポイント**: **§18-11**（`MapScreen.web.tsx` の Metro 解決）、**§18-12**（`Region` 型 → 自前型を構造的に渡す）、**§18-5**（Expo Go での地図表示は D6）

---

### T28 仕上げ（verify・バンドル・§18 消化）（P13 / 小）

**目的**: 受け入れ基準（requirements §8-1〜8-8）を最終確認し、バンドル生成・禁止事項の grep・§18 の未確認事項の解消状況を確定させる。

**変更・追加ファイル**
- 原則コード変更なし（不足テストがあれば該当タスクへ戻って追加）
- `tasks.md`（本書）§7 のチェック表に結果を記入（ファイルは本書のみ）
- `README.md` のステータス更新は**任意**（Lead 判断。本書のタスクと整合させる場合のみ）

**実装内容の要点**
1. `cd mobile; npm run verify` → typecheck 0・全テスト PASS
2. `npx jest --runInBand --coverage` → `src/domain/**` statements/branches 100%、`adapters/mock/**`・`hooks/navReducer.ts` 90% 以上を確認（不足はテスト追加）
3. バンドル: `npx expo export --platform android --max-workers 1 --no-bytecode` を **background job** で実行し、`dist/metadata.json` と `dist/_expo/static/js/android/*.js` の生成で判定（CLI が終了しない場合はジョブを停止）
4. 禁止事項の grep（`mobile/src` と `mobile/App.tsx` 対象）:
   - 外部通信: `fetch(` / `axios` / `XMLHttpRequest` / `WebSocket` → **0 件**（NFR-02）
   - `process.` / `require(`（`.ts` / `.tsx`）→ 0 件
   - `from 'react-native'` 系が `mobile/src/domain/` → 0 件
   - `adapters` の import が `mobile/src/ui/` / `mobile/src/hooks/` → 0 件
   - `react-native-maps` の import が `MapScreen.tsx` 以外 → 0 件
   - `Date.now()` が `mobile/src/domain/` → 0 件（鮮度は Clock 経由）
5. §7 の §18 チェック表を「解消 / 代替で回避 / D タスクへ移動」で埋める
6. 受け入れ基準 §8-1〜8-8 の最終確認表（§6.4）を D タスク結果で埋める

**受け入れ基準**
- [ ] `npm run verify` が緑
- [ ] バンドル成果物（`dist/metadata.json` と Android バンドル JS）が生成された
- [ ] 上記 grep がすべて 0 件（または合意済みの例外のみ）
- [ ] カバレッジ目標を満たす
- [ ] §18 の全項目に「解消 / 回避 / D タスク」のいずれかが記録されている

**単体テスト**: 既存テスト全 PASS の確認（新規テストは追加しない。カバレッジ不足時は該当タスクへ戻る）
**依存タスク**: T27（これにより T01〜T27 の全タスクが前提となる）
**完了条件**: 上記 1〜6 の完了。`npm run verify` 緑・export 成果物あり・grep 0 件
**使用する外部 API と出典節**: アプリ外部 API はなし（CLI のみ）。`expo export --max-workers 1 --no-bytecode` は env §3.2 / pc §6-2 の実測手順
**§18 確認ポイント**: §18-1〜§18-16 の全体（§7 の表を参照）

---

## 5. 実機専用タスク詳細（D1〜D7）

実機専用タスクは**実装タスクと分離**する（§17 の指示）。実装の完了条件には含めず、**D-04 解決済み**（0-1）の前提で実施する。記録先は **`docs/research/device-verification.md`（新規）** とし、各 D タスクは「日時・端末・Expo Go 版・実施者・結果・スクリーンショット」を残す。D タスクのテンプレートは **目的 / 前提・手順 / 確認項目（受け入れ）/ 記録 / 単体テスト（なし＝手動）/ 依存タスク / 完了条件 / 関連要件・根拠** で統一する。

### D1 実機接続と起動疎通

**目的**: 実機（Pixel 4a）でアプリを起動し、以降の D タスクの土台（Metro・Expo Go・`adb reverse`）と FR-01 / FR-09 の永続化を確認する。

**前提・手順**
```powershell
$ws = "C:\Users\MaedaNatsuki\Documents\deepseek-harness\default-workspace"
$env:npm_config_cache = "$ws\.cache\npm"
$env:USERPROFILE = "$ws\home"; $env:HOME = "$ws\home"
$env:CI = "1"; $env:EXPO_NO_TELEMETRY = "1"

adb devices                                  # Pixel 4a (12231JEC206116) が device で出る
adb reverse tcp:8081 tcp:8081
cd "$ws\mobile"
npx expo start --max-workers 1 --port 8081   # ★ background job で起動し、出力をパイプで取り込まない
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"
```
- Metro ログに `Android Bundled ... index.ts` が出ることを確認（env §5.4 と同じ手順）
- Expo Go は **SDK 58 版 58.0.5**（`expo.dev/go` 配布 APK）を使用。未導入なら `adb install -r` で導入

**確認項目（受け入れ）**
- [ ] アプリが起動し、メイン画面（鳥・目的地名・距離・ステータス）が描画される
- [ ] 目的地一覧 → 追加 → 選択 → 削除が動作する
- [ ] 目的地を登録して **アプリを再起動**（Expo Go の Reload / アプリ終了→再起動）→ 選択状態と座標が復元される（受け入れ基準 5）
- [ ] サンプル記録（開発用画面）が再起動後も残っている（FR-09）
- [ ] クラッシュ・白画面・無言失敗がない

**記録**: 端末情報・Expo Go 版・Metro ログ・画面キャプチャ・端末時計と PC 時計のずれ（env §5.4 の約 46 分を再確認）
**単体テスト**: なし（手動確認）。復元ロジックの自動テストは T15 / T19 で担保する
**依存タスク**: T25
**完了条件**: 上記チェックがすべて通り、`device-verification.md` に記録済み
**関連要件・根拠**: 受け入れ基準 5 / FR-01, FR-09 / env §5.4・§8.5 / §18-5（Expo Go での前景取得は未確認だが、起動・描画は実測済み）

---

### D2 鳥の向き・回転の目視確認（±5° / 最短経路）

**目的**: 受け入れ基準 1（実機で鳥が目的地の方向を向く・目視 ±5°）と FR-06 / E-14 を実機で確認する。

**前提・手順**
- Mock ON（開発画面）→ 手動モード。現在地を東京駅 `(35.681236, 139.767125)`、目的地を東京タワー `(35.658581, 139.745433)` などに設定
- 端末方位を **0° / 90° / 180° / 270°** に順に設定し、鳥の向きと相対方位の数値表示を比較する
- `rotate` シナリオ（30° 刻みで 1 周）を再生し、**359° → 1° で逆回転しない**ことを観察する
- 方位不明（`headingDeg: null`）と目的地未設定の状態で、鳥が上向き（ニュートラル）になることを確認
- 目的地まで 10 m 未満にして「到着」表示・鳥上向き・相対方位 `—` を確認

**確認項目（受け入れ）**
- [ ] 相対方位 `0°` で鳥が上向き
- [ ] `+90°` で右、`-90°` で左を向く（符号の向きが直感と一致）
- [ ] 任意の 3 方位以上で、**数値表示と鳥の向きの差が ±5° 以内**（目視。角度が読める程度に端末を固定して比較）
- [ ] 359° → 1° の変化で逆回転（−358°）しない（最短経路）
- [ ] ニュートラル・到着時に上向き固定
- [ ] 回転アニメーションが滑らかで、ちらつき・初回マウント時の不自然な回転がない

**記録**: ケース / 設定方位 / 期待 / 実測 / 判定 の表＋スクリーンショット
**単体テスト**: なし（目視確認）。回転の最短経路は T08、角度変換は T02 で担保する
**依存タスク**: D1, T08, T22
**完了条件**: 上記チェックがすべて通り、`device-verification.md` に記録済み
**関連要件・根拠**: 受け入れ基準 1 / FR-06 / E-14 / §18-2（`interpolate` の外挿）, §18-3（`rotate` の正方向）

---

### D3 権限フローと拒否時の挙動

**目的**: 位置情報権限の要求・拒否・再要求の全経路でアプリが落ちず、案内が画面に出ることを確認する（FR-02 / §11.2 / §11.3）。

**前提・手順**
- 事前に OS 設定で Expo Go の位置情報権限をリセット（または「許可しない」に設定）
- (a) **初回**: 起動 → 権限ダイアログが表示される → 許可 → 位置取得が始まる
- (b) **拒否**: ダイアログで拒否 → メイン画面のステータス領域に理由＋対処＋`[再要求]`＋`[Mock で試す]` が出る。`[再要求]` でダイアログが再表示される（自動ループしない）
- (c) **`canAskAgain = false`**（「今後表示しない」等）: 「設定アプリで位置情報を許可してください」の**文言のみ**が出る（設定画面への遷移は出ない＝§18-8）
- (d) 位置情報サービス OFF（可能なら）: 「位置情報サービスが OFF です」相当の案内
- (e) 権限拒否のまま **Mock モード**に切り替え、鳥・距離・ステータスが動く

**確認項目（受け入れ）**
- [ ] 全経路でクラッシュ・白画面がない
- [ ] 拒否時も目的地の選択・登録は可能なまま
- [ ] 再要求がユーザー操作起点でのみ行われる
- [ ] Mock モードが権限と独立に動く
- [ ] Android の付与精度（`fine` / `coarse`）を記録する

**記録**: 経路ごとの結果・スクリーンショット・Android の付与精度
**単体テスト**: なし（手動確認）。権限→`PermissionOutcome` 変換は T18 で担保する
**依存タスク**: D1, T18, T20, T25
**完了条件**: 上記チェックがすべて通り、`device-verification.md` に記録済み
**関連要件・根拠**: FR-02 / §11.2・§11.3 / §18-8（設定アプリ遷移は使わない）

---

### D4 実機センサー実測と D-08 / D-09 の調整提案

**目的**: 実機の位置・方位の精度と更新挙動を実測し、暫定閾値（D-08 / D-09）の妥当性を判断する（FR-03 / FR-08 / NFR-07）。

**前提・手順**
- 屋外または窓際で、D1 の起動状態から開発用画面（記録）を開く
- 静止 2 分 → 歩行 5 分 → 静止 3 分の順で観測し、以下を記録する
  - 位置の更新間隔（受信時刻の差分。`timeInterval: 1000` の実効値＝§18-6）
  - 方位の更新レートと、アプリの 100ms 間引き後の UI 更新
  - 方位精度（0〜3）の分布、`trueHeading === -1`（磁北フォールバック）の発生率（D-05）
  - GPS 精度（m）の分布と good / fair / poor の割合
  - 鮮度表示が 3 秒 / 10 秒 / 30 秒の境界で期待どおり切り替わるか（E-10 の確定解釈: 30 秒ちょうどは `stale`）
- 結果から D-08（10 / 30 m）・D-09（3 / 10 / 30 s）の調整要否をまとめる

**確認項目（受け入れ）**
- [ ] 上記 5 項目の実測値が表になっている
- [ ] 更新間隔・方位応答がプロトタイプとして実用的か判定されている
- [ ] 磁北フォールバックの発生率と UI 注記の妥当性が判定されている
- [ ] 閾値調整の要否と、調整する場合の変更箇所（`domain/constants.ts` の `DEFAULT_THRESHOLDS` のみ＋T06 テスト更新）が明記されている

**記録**: `device-verification.md` に計測表と調整提案。閾値を変更する場合は T06 / T01 のフォローアップを別タスクとして起票（本書 §8）
**単体テスト**: なし（実測）。閾値の境界テストは T06 で担保する
**依存タスク**: D1, T24
**完了条件**: 上記チェックがすべて通り、`device-verification.md` に記録済み
**関連要件・根拠**: FR-03, FR-08 / NFR-07 / D-08, D-09 / §18-5・§18-6・§18-15

---

### D5 連続 30 分動作

**目的**: NFR-07（連続 30 分動作で発熱・フリーズなし）を実機で確認する。

**前提・手順**
- 機内モード ON（D7 と同時実施でもよい）でアプリを起動し、メイン画面を表示したまま **30 分連続**で動作させる
- 10 分ごとに目的地の変更・画面遷移・Mock 切替を 1 回ずつ行う
- 記録: 端末の発熱（手触り・体感）、フリーズ/ANR の有無、メモリ（`adb shell dumpsys meminfo` の Expo Go プロセス）、バッテリー（`adb shell dumpsys batterystats` の差分）、アプリが落ちないこと、鳥のアニメーションと鮮度更新が継続していること

**確認項目（受け入れ）**
- [ ] 30 分間クラッシュ・ANR・フリーズがない
- [ ] 鮮度表示・鳥の回転が止まらない
- [ ] 発熱が「触れる範囲」に収まる（明らかな異常発熱がない）
- [ ] メモリが単調増加し続けない（リークの兆候がない）

**記録**: `device-verification.md` に 10 分ごとの観測表
**単体テスト**: なし（手動確認・実測）。省電力設計のうち自動検証できる部分は T15 / T19 / T20 で担保する
**依存タスク**: D1, T25
**完了条件**: 上記チェックがすべて通り、`device-verification.md` に記録済み
**関連要件・根拠**: NFR-07 / §18-15（実機の応答実測）

---

### D6 地図表示とフォールバック

**目的**: FR-11 の地図画面が Expo Go（Google Maps API キーなし）で表示され、キー未設定・Web でもアプリが壊れないことを確認する（受け入れ基準 8）。

**前提・手順**
- 地図画面へ遷移し、`MapView`・現在地マーカー（自前）・目的地マーカー・コンパス・現在地ボタン・戻るボタンを確認
- 地図が空白/グレーの場合でも、注記（「地図が表示されない場合は API キー未設定です」）と `[方位表示に戻る]` が出て、メイン画面が壊れないことを確認
- ネットワーク OFF（機内モード）では地図タイルが出ないが、**アプリ自体は動く**ことを確認（D7 と併せて）
- Web フォールバック（`MapScreen.web.tsx`）は Web 実行環境が無いため、**コードレビュー**で「`react-native-maps` を import していない」「文言と戻る導線がある」ことを確認する（§18-11）

**確認項目（受け入れ）**
- [ ] Expo Go（キーなし）で地図が表示される（または空白でもフォールバック表示になる）
- [ ] 現在地・目的地の 2 マーカーが正しい位置に出る
- [ ] 地図画面の例外がメイン画面を巻き込まない（ErrorBoundary）
- [ ] キー未設定注記と戻る導線が常設されている
- [ ] 現在地が `null` のときクラッシュしない
- [ ] Web フォールバックのソースレビュー完了

**記録**: `device-verification.md` に画面キャプチャと結果
**単体テスト**: なし（目視・ソースレビュー）。`regionForPoints` は T26 で担保する
**依存タスク**: D1, T27
**完了条件**: 上記チェックがすべて通り、`device-verification.md` に記録済み
**関連要件・根拠**: FR-11 / 受け入れ基準 8 / D-03, ADR-10 / notes §3.3〜§3.6 / §18-11・§18-12

---

### D7 オフライン・外部通信の実機確認

**目的**: NFR-01 / NFR-02 / NFR-09 を実機で確認する（通信ゼロでもコア機能が動く・外部送信がない）。

**前提・手順**
- 端末を**機内モード**（Wi-Fi・モバイルデータ OFF）にし、USB + `adb reverse` のみで Metro に接続する（Metro は USB 経由の localhost。インターネット不要＝env §5.4）
- 目的地を設定し、鳥・距離・方位・鮮度・精度が動作することを確認する（GPS は衛星測位のため通信不要）
- 地図画面ではタイルが出ないが、アプリがクラッシュしないことを確認する
- コードレビュー: 保存キーが `yoridorimidori/destinations/v1` と `yoridorimidori/samples/v1` のみ（＋退避キー）で、外部送信コードがないことを確認（T28 の grep と併用）

**確認項目（受け入れ）**
- [ ] 機内モードでコア機能（鳥・距離・方位・精度・鮮度）が動作する
- [ ] 通信できない状態でもクラッシュ・無言失敗がない
- [ ] 外部通信コードが 0 件（T28 の grep 結果と一致）
- [ ] 保存される情報が目的地の座標・名前とセンサー数値ログのみ（機微情報なし）

**記録**: `device-verification.md` に結果とスクリーンショット
**単体テスト**: なし（手動確認）。外部通信の grep 検査は T28 で実施する
**依存タスク**: D1, T25, T27
**完了条件**: 上記チェックがすべて通り、`device-verification.md` に記録済み
**関連要件・根拠**: NFR-01, NFR-02, NFR-09 / §10.5 / §13 / env §5.4

---

## 6. トレーサビリティ

### 6.1 機能要件（FR-01〜FR-12）→ タスク

| 要件 | 内容（要約） | 主タスク | 検証方法 |
|---|---|---|---|
| FR-01 | 目的地の登録・選択・「現在地を目的地に」・再起動後の復元 | T03, T14, T15, T19, T20, T23 | T14/T15/T19 のテスト＋D1（再起動復元） |
| FR-02 | 現在地の継続取得・権限フロー・鮮度表示 | T18, T19, T20, T22, T24 | T18/T19 のテスト＋D3 |
| FR-03 | 端末方位の取得・`trueHeading` 優先・磁北フォールバック | T16, T17, T18, T19, T22 | T16/T17/T18 のテスト＋D4 |
| FR-04 | 目標方位（大円 initial bearing）の計算 | T04, T05 | T04/T05 のテスト（E-01〜E-06） |
| FR-05 | 相対方位の計算（`(-180,180]`） | T02, T05, T07 | T02/T05 のテスト（E-07） |
| FR-06 | 鳥の向き・最短経路の回転・到着判定 | T07, T08, T22 | T07/T08 のテスト＋D2（±5°・逆回転なし） |
| FR-07 | 距離表示（m / km） | T04, T09, T22 | T04/T09 のテスト（E-13） |
| FR-08 | 精度・鮮度の表示（数値＋文言＋区分） | T06, T07, T19, T21, T22, T24 | T06/T07/T21 のテスト＋D4 |
| FR-09 | 精度・鮮度サンプルの記録（リング 300）と一覧 | T10, T14, T15, T19, T24 | T10/T14/T15/T19 のテスト＋D1/D4 |
| FR-10 | Mock センサー（手動・シナリオ・PC 再現） | T11, T12, T13, T20, T24 | T11/T12/T13 のテスト（Jest で再現）＋D2/D4 |
| FR-11 | 地図表示（オプション・キー未設定でも壊れない・Web フォールバック） | T26, T27 | T26 のテスト＋D6 |
| FR-12 | BLE 拡張点（ポート契約・実装 2 つ以上・UI は取得元に非依存） | T01, T13, T18, T20, T22 | import レビュー（`ui`/`hooks` が `adapters` を import しない）＋T13/T18 の 2 実装 |

### 6.2 非機能要件（NFR-01〜NFR-10）→ タスク

| 要件 | 実現・検証タスク |
|---|---|
| NFR-01 オフライン動作 | T27（地図はオプション）＋D7（機内モードでコア動作） |
| NFR-02 バックエンドなし | 全タスクの共通ルール 3.2-1 ＋T28 の grep（`fetch`/`axios`/`XMLHttpRequest`/`WebSocket` 0 件）＋D7 |
| NFR-03 Android 先行・iOS 展開可能 | T17（`headingStrategy` に純粋化）, T18（`Platform` 参照を 1 箇所に）, T27（Web 分離）, T28（grep） |
| NFR-04 テスト | T01〜T28 の各テスト＋T28 のカバレッジ確認 |
| NFR-05 型安全 | 各タスクの `npm run typecheck`＋T28（`any` なし・strict 維持） |
| NFR-06 未確認 API 禁止 | 各タスクの「外部 API と出典節」＋T18/T22/T26/T27 の §18 確認＋§7 の表 |
| NFR-07 省電力・応答性 | T15（書込デバウンス）, T19（tick 1 秒）, T20（方位 100ms 間引き・購読解除）, T22（アニメ 250ms・`useNativeDriver`）＋D4/D5 |
| NFR-08 アクセシビリティ | T21（文言の純粋関数・全区分に非空文言）, T22（数値＋文言・`accessibilityLabel`） |
| NFR-09 プライバシー | T15（保存キーは座標・ログのみ・外部送信なし）, T28（grep）, D7 |
| NFR-10 再現性 | T11〜T13（Mock・シナリオ・決定論）, T19（純粋リデューサ）, 全テストで `FakeClock` |

### 6.3 境界条件（E-01〜E-15）→ テストファイル・タスク

| # | ケース（要約） | テストファイル | タスク | 主な期待 |
|---|---|---|---|---|
| E-01 | 現在地 == 目的地 | `distance.test.ts` / `bearing.test.ts` / `nav.test.ts` | T04, T05, T07 | 距離 `0`・方位 `null`・`arrived` |
| E-02 | 対蹠点 | `distance.test.ts` / `bearing.test.ts` | T04, T05 | 距離 `≈ πR`・NaN なし・方位は有限値 |
| E-03 | 日付変更線 | `distance.test.ts` / `bearing.test.ts` | T04, T05 | 距離 `≈ 22,239 m`・方位 `≈ 90°` |
| E-04 | 高緯度 ±89.9° | `distance.test.ts` / `bearing.test.ts` | T04, T05 | 有限値・NaN なし |
| E-05 | 極点 ±90° | `distance.test.ts` / `bearing.test.ts` | T04, T05 | 距離は有限・**方位は `null`**（ADR-05） |
| E-06 | 真北/南/東/西 | `bearing.test.ts` | T05 | 赤道基準で `0 / 180 / 90 / 270`（±1e-9） |
| E-07 | 相対方位の正規化 | `normalize.test.ts` / `bearing.test.ts` | T02, T05 | 2 関数に分けて検証（`359.999` は `[0,360)` でそのまま／`(-180,180]` で `-0.001`） |
| E-08 | 方位不明（`trueHeading=-1`） | `sensorMapping.test.ts` / `nav.test.ts` | T16, T07 | 磁北フォールバック／両方 `-1` なら `null`・`heading-unknown` |
| E-09 | 方位精度が最低値（`0/1`） | `accuracy.test.ts` / `nav.test.ts` | T06, T07 | `uncalibrated` / `poor`。鳥は回転するが警告 |
| E-10 | 位置が古い（**30 秒超**） | `freshness.test.ts` / `nav.test.ts` | T06, T07 | 30 秒ちょうど `stale`・30,001 で `lost`・`position-lost` |
| E-11 | タイムスタンプ逆転 | `freshness.test.ts` / `nav.test.ts` | T06, T07 | 経過 `0`・`fresh`・落ちない |
| E-12 | NaN / 範囲外座標 | `validation.test.ts` / `distance.test.ts` / `bearing.test.ts` / `sensorMapping.test.ts` | T03, T04, T05, T16 | `false` / `null`・クラッシュしない |
| E-13 | 距離の丸め | `format.test.ts` | T09 | `999.6 → '1000 m'` / `1000 → '1.00 km'` / `999.4 → '999 m'` |
| E-14 | 回転の最短経路 | `rotation.test.ts` | T08（目視は D2） | `359→1 = +2`（`-358` でない） |
| E-15 | 目的地未設定 | `nav.test.ts` | T07（UI は T22・D2） | `no-destination`・全 bearing/distance `null` |

### 6.4 受け入れ基準（requirements §8）→ タスク

| # | 受け入れ基準 | 主タスク・D タスク | 判定方法 |
|---|---|---|---|
| 1 | 実機で鳥が目的地の方向を向く（目視 ±5°） | T08, T22 ＋ **D2** | D2 の目視記録 |
| 2 | 方位計算・距離・正規化・鮮度/精度区分の単体テストが全 PASS | T02〜T10（E-01〜E-15）＋ T28 | `npm test` |
| 3 | Mock モードで PC 上に同じ挙動を再現（Expo web **または** Jest） | T11, T12, T13, T19, T21 ＋ T28 | Jest テスト（0-3。Web 依存の追加要否は §8-1） |
| 4 | GPS 精度・方位精度・鮮度（経過秒）が表示され、記録が残る | T21, T22, T15, T24 ＋ **D4** | T21/T15 のテスト＋D4 |
| 5 | アプリ再起動後も目的地と記録が復元される | T15, T19, T20 ＋ **D1** | T15 のテスト＋D1 の目視 |
| 6 | 外部通信が存在しない | 全タスク共通ルール 3.2-1 ＋ T28 ＋ **D7** | grep 0 件＋機内モード動作 |
| 7 | `tsc --noEmit` と `npm test` がエラー 0 | 全タスクの完了条件 ＋ T28 | `npm run verify` |
| 8 | API キー未設定でも地図以外の全機能が動く | T27（フォールバック・注記）＋ **D6** | D6 の確認 |

### 6.5 テストファイル一覧（§12.2 ＋ 本書で追加するもの）

| テストファイル | タスク | 区分 |
|---|---|---|
| `mobile/src/domain/__tests__/normalize.test.ts` | T02 | §12.2 |
| `mobile/src/domain/__tests__/bearing.test.ts` | T05 | §12.2 |
| `mobile/src/domain/__tests__/distance.test.ts` | T04 | §12.2 |
| `mobile/src/domain/__tests__/freshness.test.ts` | T06 | §12.2 |
| `mobile/src/domain/__tests__/accuracy.test.ts` | T06 | §12.2 |
| `mobile/src/domain/__tests__/nav.test.ts` | T07 | §12.2 |
| `mobile/src/domain/__tests__/rotation.test.ts` | T08 | §12.2 |
| `mobile/src/domain/__tests__/format.test.ts` | T09 | §12.2 |
| `mobile/src/domain/__tests__/validation.test.ts` | T03 | §12.2 |
| `mobile/src/domain/__tests__/ringBuffer.test.ts` | T10 | §12.2 |
| `mobile/src/domain/__tests__/sensorMapping.test.ts` | T16 | §12.2 |
| `mobile/src/domain/__tests__/scenario.test.ts` | T11 | §12.2 |
| `mobile/src/adapters/__tests__/systemClock.test.ts` | T17 | §12.2 |
| `mobile/src/adapters/__tests__/asyncStorageRepositories.test.ts` | T15 | §12.2 |
| `mobile/src/adapters/__tests__/expoAdapters.test.ts` | T18 | §12.2 |
| `mobile/src/hooks/__tests__/navReducer.test.ts` | T19 | §12.2（セレクタのテストも同ファイル） |
| `mobile/src/ui/__tests__/labels.test.ts` | T21 | §12.2 |
| `mobile/src/domain/__tests__/constants.test.ts` | T01 | 追加（§12.3「追加の必須テスト」に準じるスモーク） |
| `mobile/src/domain/__tests__/summarize.test.ts` | T10 | 追加（§12.3「追加の必須テスト」） |
| `mobile/src/adapters/__tests__/storageCodec.test.ts` | T14 | 追加（§12.3「永続化の破損」） |
| `mobile/src/adapters/__tests__/memoryRepositories.test.ts` | T14 | 追加（FR-12 の 2 実装担保） |
| `mobile/src/adapters/__tests__/mockSensor.test.ts` | T12 | 追加（§17 P6 のテスト） |
| `mobile/src/adapters/__tests__/mockProviders.test.ts` | T13 | 追加（§17 P6 のテスト） |
| `mobile/src/adapters/__tests__/headingStrategy.test.ts` | T17 | 追加（§5.2 の純粋化） |
| `mobile/src/ui/__tests__/mapRegion.test.ts` | T26 | 追加（§9.6「テスト可能にする」） |

---

## 7. リスク・注意（未確認 API を使わないための確認ポイント）

### 7.1 architecture §18 未確認事項 × タスク

| §18 | 未確認事項 | 影響タスク | 確認タイミング・方法 | 確認できない場合の代替 |
|---|---|---|---|---|
| 1 | `react-native-svg` 15.16.0 の API（`Svg` / `Path` / `Circle`） | **T22, D2** | T22 着手時に公式ドキュメントで確認。使う要素を最小化 | `View` の組み合わせで代替（見た目は劣化、要件は満たす） |
| 2 | `Animated.interpolate` の範囲外挙動（線形外挿） | **T22, D2** | 目視＋数値（`361deg` が連続するか） | `reduceContinuousAngle` で `±720°` に収め `inputRange: [-720, 720]`。不可なら `useNativeDriver: false` |
| 3 | RN の `rotate` の正方向 | **T22, D2** | D2 で目視（`+90` で右か） | 符号反転（`rotate: -deg`）で調整 |
| 4 | `performance.now()` の RN 上での有無 | **T17, D4** | 機能検出を実装（`globalThis` を型ガード）＋起動時ログ | `Date.now()` + `max()` の単調補正（実装済みフォールバック） |
| 5 | Expo Go（Android）で前景位置・方位が制限なく動くか | **D1, D2, D3, D4** | 実機で `watchPositionAsync` / `watchHeadingAsync` を実行 | Mock で継続（開発は Mock 前提） |
| 6 | `watchPositionAsync` の実機での更新間隔（`timeInterval` の最小値） | **D4** | 実機で受信時刻の差分を計測 | 既定値のまま・鮮度表示でカバー |
| 7 | iOS の更新頻度（`timeInterval` が無効） | 対象外（iOS 対応時） | — | Android 先行（D-02） |
| 8 | 設定アプリへの遷移 API（`Linking.openSettings` 等） | **T25** | 一次情報で確認できた場合のみ採用 | **文言のみで誘導**（本書の既定。使わない） |
| 9 | `AppState` の API 形 | **T15** | 採用する場合のみ RN 公式で確認 | **採用しない**（デバウンス＋`flush()`。失われても最大 5 秒） |
| 10 | `jest-expo` が `expo-location` 同梱モックを自動適用するか | T12, T13, T18 | **依存しない**（自前 Mock / インライン `jest.mock`） | 依存しない（§8.1） |
| 11 | `MapScreen.web.tsx` の Metro 解決 | **T27, D6** | Metro の標準解決を確認。Web 実行は不可のためソースレビュー | `Platform.OS === 'web'` の明示分岐に切り替え |
| 12 | `react-native-maps` の `Region` の厳密な型 | **T26, T27** | 型定義ファイルを精読（T27 着手時） | 自前型（§9.6）を使い構造的に渡す（T26 で実装済み） |
| 13 | `expo-location` の `Accuracy` の Web 挙動 | 対象外（Web は Mock のみ） | — | Web プレビューはしない（0-3） |
| 14 | Web プレビュー用依存 3 点の追加可否 | **T28, §8-1** | Lead/ユーザー判断（**実装前**） | 既定は**追加しない**。Jest で検証 |
| 15 | 実機の方位精度・応答（実測） | **D4, D5** | 実機で 30 分計測（D4/D5） | 暫定閾値（D-08/D-09）のまま |
| 16 | Android の `minSdkVersion` 実値（D-10） | 対象外（ネイティブビルド時） | prebuild 後の `build.gradle` を確認 | 記録のみ（§8-8） |

> **原則（README 設計原則 7 / NFR-06）**: ⚠️ 未確認の API は「アダプタ 1 ファイル」または「オプション画面 1 ファイル」に隔離し、確認できるまで**想像で実装しない**。確認できない場合は上表の代替に切り替える。

### 7.2 その他のリスクと対策

| # | リスク | 影響 | 対策 | 検出タイミング |
|---|---|---|---|---|
| 1 | サンドボックスコマンドの誤用（`npx jest` / `expo install` 等） | テスト・依存追加が EPERM で失敗 | 3.1 のコマンドのみを使う。各タスクの完了条件は `npm run verify` | 各タスク完了時 |
| 2 | テスト未追加で「No tests found」（exit 0）のまま進む | 回帰を検出できない | T01 で最低 1 本のテストを追加。以降は各タスクでテスト追加 | T01 以降 |
| 3 | `process` / `require` の混入（`@types/node` が無い） | `typecheck` 失敗 | `.ts`/`.tsx` で書かない。`__mocks__` は `.js`（T15） | 各 typecheck／T28 grep |
| 4 | `domain/` への外部 import 混入 | 純粋性・テスト容易性の破壊 | T28 の grep（`react-native` 0 件）＋レビュー | 各タスク／T28 |
| 5 | `ui/`・`hooks/` から `adapters/` への import 混入 | FR-12（取得元非依存）の破壊 | T28 の grep＋レビュー | 各タスク／T28 |
| 6 | 依存追加の誘惑（スライダー・web・RNTL） | サンドボックスで失敗・設計逸脱 | 付録A の既定は**すべて「入れない」**。必要なら Lead 承認（§8-1） | 設計変更時 |
| 7 | ID 生成・時刻の非決定性でテストが不安定 | テストの flaky 化 | リポジトリは `Clock` / `idFactory` を注入（T14）。`Math.random` 禁止（T12） | T14 以降 |
| 8 | 購読 race（`start()` 解決前のアンマウント）・二重購読 | メモリリーク・値の混線 | §11.5 の race ガード（T20）＋ `unsubscribe` 保持 | T20 レビュー／D3 |
| 9 | 端末時計のずれ（約 46 分） | ログの epoch 比較がずれる | 鮮度は単調時計の差分のみ（0-7）。ログ比較時は注意書き | D1/D4 |
| 10 | 地図の API キー・ネットワーク依存 | 地図が空白 | Expo Go はキー不要。空白時も注記＋フォールバック（T27）。機内モードではタイルのみ欠落 | D6/D7 |
| 11 | 境界値の解釈揺れ（E-07 / E-10 / E-13） | テスト期待値の不一致 | 0-5 で確定済み。**テストはこの値で固定**し、実装時に解釈を変えない | 各テスト作成時 |
| 12 | カバレッジ不足（domain 100% 目標） | 品質目標未達 | T28 で `--coverage` を確認し、不足分は該当タスクへ戻って追加 | T28 |
| 13 | 実機の接続状態の変化（`adb devices` 空） | D タスクが開始できない | D1 の前提確認。未接続なら D タスクを保留し、実装タスク（M1/M2）を先行 | D1 開始時 |
| 14 | Expo Go の版ずれ（SDK 57/58 移行期） | 実機で起動できない | `expo.dev/go` の SDK 58 版（58.0.5）を使用（D1） | D1 |
| 15 | UI の目視確認が PC でできない（Web 依存なし） | 表示崩れの見逃し | UI はレンダリングテストの対象外と明示（§12.6）。目視は D タスク（D1/D2/D3/D6）で担保 | D タスク |

---

## 8. 未決事項・Lead への確認事項

いずれも**本書の既定値で実装を進められる**（ブロッカーではない）。実装開始前に Lead が判断できれば、該当タスクの記述を更新する。

| # | 確認事項 | 本書の既定 | 判断が必要な理由 |
|---|---|---|---|
| 1 | **Web プレビュー用依存 3 点**（`react-dom` / `react-native-web` / `@expo/metro-runtime`）を追加するか（§付録A-1 / §18-14 / 受け入れ基準 3） | **追加しない**。FR-10 の PC 再現は Jest（T11〜T13）で担保し、全画面の目視は実機 D タスクで行う | 追加するとサンドボックスでの `npm install --ignore-scripts` と Metro 設定の検証が増える。受け入れ基準 3 の「Expo web **または** Jest」の解釈を確定したい |
| 2 | requirements §6 の E-07 / E-10 / E-13 の文言（architecture §15.2 の提案反映済み）で確定してよいか | **確定**（`359.999` は 2 値併記、E-10 は 30 秒超、E-13 は `999.6 → '1000 m'`）。テストはこの値で固定 | §15.2 の「要確認」が requirements 側で更新済みか最終確認したい（実装中の手戻り防止） |
| 3 | `summarizeSamples(entries, thresholds)` の引数追加（0.3-7） | **採用**（古いサンプル率の閾値に `Thresholds` が必要） | §9.7 の表記（引数なし）との差を明示的に承認したい |
| 4 | `validateDestinationInput` の戻り値（`origin` を呼び出し側で付与。T03） | **採用**（§6.11 の注記を優先） | §6.11 のシグネチャ（`ValidationResult<DestinationInput>`）と `origin` の責務が矛盾して見えるため |
| 5 | リポジトリの実装詳細: `onWarning` コールバック / `idFactory` / `Clock` 注入 / 5 秒デバウンスを `setTimeout` でなく `Clock` 比較で実装（T14/T15） | **採用**（テスト決定論・§12.4 のタイマー不使用に適合） | ports の契約（§4.5 / §4.6）に現れない実装詳細のため、設計判断として承認したい |
| 6 | 実機タスクの記録先 **`docs/research/device-verification.md`（新規）** を起こす | **起こす**（D1〜D7 の証跡。env §5.4 の記録と並べる） | 実機結果の置き場所が未定のため |
| 7 | D4 の実測後に D-08 / D-09 の閾値を変更する場合の扱い | **チューニング**として `domain/constants.ts` の `DEFAULT_THRESHOLDS` のみ変更し、T06 のテスト期待値も同時更新（requirements の数値は「暫定」のまま） | 要件変更か実装パラメータ変更かの区分を確定したい |
| 8 | D-10（Android `minSdkVersion` の実値記録）を本フェーズの対象外のままにするか | **対象外**（ネイティブビルド時のみ。§18-16） | ネイティブビルドを行わないため記録機会がない |

---

## 付記: 本書と実装の関係

- 本書は**実装計画のみ**であり、コードを含まない。型・アルゴリズム・文言・配置の正は architecture.md（および requirements.md）とする。
- タスクの追加・順序変更が必要になった場合は、**依存関係（§1）と受け入れ基準（§6.4）を壊さないこと**を条件に、本書を更新してから実装する。
- 各タスクの「完了条件」を満たさないまま次のタスクへ進まない（0.4）。実機でしか確認できない項目は D タスクで担保する。


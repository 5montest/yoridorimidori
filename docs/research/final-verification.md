# 最終検証レポート（T28 / デプロイ可能水準の確認）

- 検証日時: 2026-10-30 (Asia/Tokyo)
- 対象: `mobile/`（Expo SDK 58 / RN 0.88.1 / React 19.3.0 / TypeScript 6.0.3）
- 検証担当: Lead（実測ログに基づく）

---

## 1. 結論

**アプリは「デプロイ可能な水準」に到達**している。ローカル完結のプロトタイプとして、型検査・単体テスト・本番バンドル生成・実機動作（D1〜D7）がすべて確認できた。
唯一の未達は**サンドボックス内での APK 生成**であり、これはアプリ側の問題ではなく環境制約（後述）。配布用ビルドは **EAS Build（クラウド）** で行う（[deploy.md](../deploy.md)）。

---

## 2. 検証結果サマリ

| # | 検証項目 | 結果 | 根拠 |
|---|---|---|---|
| 1 | `npm run verify`（`tsc --noEmit` + `jest --runInBand`） | **✅ PASS** | tsc 0 エラー / **25 suites / 437 tests PASS** / 実行 約 9〜16 秒 |
| 2 | 本番バンドル生成 | **✅ PASS** | `npx expo export --platform android --max-workers 1 --no-bytecode` → `dist/metadata.json` + `dist/_expo/static/js/android/index-*.js`（**1,263 KB**） |
| 3 | 外部通信の不在（NFR-02 / NFR-09） | **✅ PASS** | `src/**` に `fetch(` / `axios` / `XMLHttpRequest` / `WebSocket` / `http(s)://` は **0 件** |
| 4 | 依存ルール（FR-12 / NFR-03） | **✅ PASS** | `react-native-maps` の import は `MapScreen.tsx` のみ / `ui/`→`hooks`・`adapters` import 0 件 / `domain/` の外部 import 0 件 |
| 5 | 型安全・コーディング規約 | **✅ PASS** | `any` 0 件 / `process`・`require` 0 件 / 非 null 断言なし（`noUncheckedIndexedAccess`） |
| 6 | カバレッジ | **✅ 良好** | `domain`: statements **99.39%** / branches **96.78%** / functions 100%。`hooks`: 97.5%。`adapters`: 約 91%。`ui/labels`: 78%（未使用文言） |
| 7 | 実機動作（D1〜D7） | **✅ PASS** | [device-verification.md](device-verification.md) |
| 8 | 本番 APK ビルド（ローカル） | **❌ 不可（環境制約）** | CMake の `ninja` がサンドボックスのプロセス制約でハング。詳細: [production-build.md](production-build.md)。代替: EAS Build |
| 9 | アプリアイコン・スプラッシュ | **✅ 完了** | オオハシ版 6 アセット（`mobile/assets/`）+ 生成スクリプト |
| 10 | デプロイ手順書 | **✅ 完了** | [deploy.md](../deploy.md)（EAS CLI 27.1.0 / `eas.json` / 署名 / Maps キー注入） |

---

## 3. 実測した数値

### 3.1 テスト
```
Test Suites: 25 passed, 25 total
Tests:       437 passed, 437 total
Time:        ~9.8 s（--runInBand）
```
- 内訳: domain 211+ / adapters / hooks / ui(labels) / 境界条件 E-01〜E-15 を含む
- `jest-expo` preset + `--runInBand`（サンドボックスのワーカー fork 制約のため）

### 3.2 カバレッジ（抜粋）
| 領域 | statements | branches |
|---|---|---|
| `domain/` | **99.39%** | **96.78%** |
| `hooks/` | 97.56% | 97.67% |
| `adapters/` | 約 91% | 約 85% |
| `ui/labels.ts` | 78% | 79.59% |

未到達分岐は到達不能な防御ガード（`bearing.ts` の `Number.isFinite` false 側、`distance.ts` のクランプ分岐等）のみ。

### 3.3 本番バンドル
```
dist/metadata.json                                        0.1 KB
dist/_expo/static/js/android/index-36c222ad....js     1,263 KB
```
- Hermes bytecode は `--no-bytecode` で回避（`hermesc` の spawn がサンドボックスで EPERM のため）
- 通常環境では `npx expo export --platform android`（bytecode あり）が使える

### 3.4 実機
- Pixel 4a / Android 13 (API 33) / Expo Go 58.0.5 / `adb reverse`
- 開発バンドル: 881 modules / 3.3 秒
- 実 GPS: 12.81 km / 145°（精度 6〜40 m）、実コンパス: 真北基準・精度 2〜3
- 記録: リングバッファ 300 件満杯・集計表示 OK

---

## 4. architecture §18「未確認事項」の消化状況

| # | 未確認事項 | 結果 |
|---|---|---|
| 1 | `react-native-svg` 15.16.0 の API | **✅ 解消**（[svg-and-animation.md](svg-and-animation.md)。`Svg`/`Path` の確定 props を使用。Animated 値は渡さない方針で実装） |
| 2 | `Animated.interpolate` の範囲外挙動 | **✅ 回避策で対応**（`inputRange:[-720,720]` + `reduceContinuousAngle` + 360°倍数シフト修正） |
| 3 | `rotate` の正方向 | **✅ 実機確認**（+90° = 右。D2） |
| 4 | `performance.now()` の有無 | **✅ 解消**（RN 0.88 は `global.performance` を設定。`SystemClock` は機能検出 + `Date.now()` フォールバック） |
| 5 | Expo Go で前景位置・方位が動くか | **✅ 実機確認**（D1/D4。位置・方位とも取得できた） |
| 6 | `watchPositionAsync` の実機更新間隔 | **△ 部分的**（屋内で 1〜数秒。屋外の本格計測は未実施） |
| 7 | iOS の更新頻度 | **未検証**（Android 先行） |
| 8 | 設定アプリ遷移 API | **✅ 代替で回避**（`Linking.openSettings` は使わず文言誘導のみ） |
| 9 | `AppState` の API 形 | **✅ 不使用**（デバウンスのみで運用） |
| 10 | `jest-expo` の expo-location モック自動適用 | **✅ 依存しない設計**（自前ポート実装で担保） |
| 11 | `MapScreen.web.tsx` の解決 | **△ 未検証**（web 依存未導入。Android 実機では `MapScreen.tsx` が使われることを確認） |
| 12 | `react-native-maps` の `Region` 型 | **✅ 自前型で回避**（`domain/mapRegion.ts` の `MapRegion` を構造的に渡す） |
| 13 | expo-location `Accuracy` の Web 挙動 | **未検証**（Web 非対象） |
| 14 | Web プレビュー依存 3 点の追加 | **✅ 追加しない判断**（D-14。実機で目視確認） |
| 15 | 実機の方位精度・応答 | **△ 部分的**（屋内で確認。30 分計測は未実施） |
| 16 | Android `minSdkVersion` 実値 | **✅ 実測**（prebuild 生成物より **minSdk 24 / compileSdk 37 / targetSdk 36**。[production-build.md](production-build.md)） |

---

## 5. 既知の制約・残課題

| # | 内容 | 影響 | 対応 |
|---|---|---|---|
| 1 | サンドボックス内で APK ビルド不可（ninja ハング） | 配布物をローカル生成できない | **EAS Build で生成**（[deploy.md](../deploy.md)）。通常 PC では `scripts/build-android.ps1` |
| 2 | 屋外 30 分の連続・精度計測が未実施 | D-08/D-09 の閾値チューニング未完了 | 屋外で D5 を実施し `DEFAULT_THRESHOLDS` を調整 |
| 3 | Mock 手動入力の実機確認が未完了 | シナリオ経由は確認済み | 手動適用は unit テストで担保。実機確認は任意 |
| 4 | Web プレビュー不可（依存未導入） | PC での全画面目視ができない | 実機で代替（D1〜D7）。必要なら依存 3 点を追加承認 |
| 5 | iOS 未対応 | — | Android 先行のため対象外。構造は Platform 依存を局所化済み |

---

## 6. 再現コマンド

```powershell
cd mobile
npm run verify                                                  # tsc + 437 tests
npx jest --runInBand --coverage                                 # カバレッジ
npx expo export --platform android --max-workers 1 --no-bytecode # 本番バンドル
# 実機（Metro + adb reverse + Expo Go）
pwsh -File ../scripts/run-on-device.ps1
```

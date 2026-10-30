# 寄鳥美鳥地（よりどりみどり）

スマートフォンの画面にいる**オオハシが目的地の方向を向く**、方向特化型ナビゲーションのプロトタイプ。

地図を読まずに、鳥についていくだけで目的地へ近づける。GPS とコンパスだけを使い、**バックエンドなし・通常動作はオフライン**で動作する。

## 技術構成

| 領域 | 技術 |
|---|---|
| フレームワーク | React Native + Expo + TypeScript（Android 先行、将来 iOS） |
| GPS・コンパス | `expo-location` |
| 地図 | **OpenStreetMap のラスタータイル**（API キー不要・従量課金なし） |
| 永続化 | ローカル保存（AsyncStorage） |
| 共有 | `expo-share-intent`（Google マップ等の「共有」から目的地を受け取る） |
| テスト | Jest（`jest-expo`）による純粋関数の単体テスト |

## 設計原則

1. **GPS・コンパス取得とナビゲーション計算を分離**する（取得 = アダプタ、計算 = 純粋関数）
2. **Mock センサー**を実装し、PC 上で挙動を再現可能にする
3. 将来的な **BLE 連携**を想定してインターフェースを分離する
4. **方位計算と境界条件には必ず単体テスト**を用意する
5. **GPS・方位の精度と鮮度**を記録し、必要な情報は開発メニューから確認できる
6. 初期段階では**バックエンドを使用しない**
7. **未確認のライブラリ API を想像で実装しない**（公式一次情報で確認する）

## クイックスタート

```powershell
cd mobile
npm install
npm run verify        # tsc --noEmit + jest --runInBand
npx expo start        # Metro（Android 実機は adb reverse で接続）
```

## ドキュメント

| 文書 | 内容 |
|---|---|
| [requirements.md](requirements.md) | 要件定義（機能・非機能・境界条件・受け入れ基準） |
| [architecture.md](architecture.md) | アーキテクチャ設計（レイヤ・インターフェース・テスト戦略） |
| [tasks.md](tasks.md) | 実装タスク分解・実装メモ |
| [docs/ux-design.md](docs/ux-design.md) | UX 設計（画面 S1〜S7・文言・受け入れ基準） |
| [docs/deploy.md](docs/deploy.md) | デプロイ手順（EAS Build / ローカル APK） |
| [docs/environment-report.md](docs/environment-report.md) | 開発環境の検証結果・制約 |
| [docs/research/](docs/research/) | 一次情報調査・実機検証・本番ビルド可否検証 |

## リポジトリ構成

```
.
├── requirements.md          # 要件定義
├── architecture.md          # アーキテクチャ設計
├── tasks.md                 # 実装タスク・実装メモ
├── docs/
│   ├── ux-design.md         # UX 設計
│   ├── deploy.md            # デプロイ手順
│   ├── environment-report.md
│   ├── assets/              # 実機スクリーンショット・画像素材
│   └── research/            # 調査ノート・検証記録
├── mobile/                  # Expo アプリ本体（React Native + TypeScript）
│   ├── App.tsx              # コンポジションルート
│   ├── src/
│   │   ├── domain/          # 純粋関数（方位・距離・鮮度・共有リンク解析・地図投影）
│   │   ├── ports/           # インターフェース（センサー・保存・検索・クリップボード等）
│   │   ├── adapters/        # Expo / AsyncStorage / Mock / ネットワーク実装
│   │   ├── hooks/           # 状態管理（useReducer）
│   │   └── ui/              # 画面・コンポーネント（hooks/adapters を import しない）
│   └── assets/              # アプリアイコン・オオハシ画像
├── scripts/                 # 画像生成・実機起動・APK ビルド用スクリプト
└── .github/workflows/       # CI（型検査・単体テスト）
```

## 実機（Android）で動かす

```powershell
adb devices
adb reverse tcp:8081 tcp:8081
cd mobile; npx expo start
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"
```

- 端末側には **Expo Go（SDK 58 版）** が必要。
- 共有ターゲット（Google マップ →「共有」）と地図の一部機能は **APK / development build のみ**で動作する（Expo Go では無効・クラッシュしない）。

## デプロイ（Android 配布ビルド）

- **ローカル APK ビルド**（Windows）: `scripts/build-apk.ps1`（手順・落とし穴は [docs/research/production-build.md](docs/research/production-build.md)）
- **ストア配布**: EAS Build を推奨（`mobile/eas.json` に `preview` / `production` を定義済み）

```powershell
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

## 地図について

- 地図は **OpenStreetMap のラスタータイル**（`tile.openstreetmap.org`）を使用。**API キー・課金は不要**。
- 帰属表示（© OpenStreetMap contributors）を常時表示。
- タイル利用ポリシー（大量アクセス禁止）に留意。本番規模では自前タイルサーバ/商用プロバイダ（MapTiler 等）を検討。

## ステータス

- [x] フェーズ1: 環境確認・仕様策定（requirements / architecture / tasks）・雛形構築
- [x] M1〜M4: ドメイン層・アダプタ層・状態管理/UI・地図/仕上げ（T01〜T28）
- [x] 実機検証 D1〜D7（鳥の向き・権限フロー・再起動復元・オフライン・地図）
- [x] Phase 4: UX 刷新（座標直打ち廃止・オンボーディング・開発メニュー隔離・共有リンク）
- [x] **配布用 APK のローカルビルド成功**（実機インストール/起動確認済み）
- [x] **Google マップ共有 → 短縮リンク解決 → 目的地設定**（実機検証済み）
- [x] **地図**: OpenStreetMap タイル地図（キー不要・課金なし・ドラッグ/ピン/ズーム操作）
- [x] 品質: **628 tests PASS / `tsc` 0 エラー**
- [ ] ストア配布用の release ビルド（EAS Build 推奨。ローカル release は CMake ループで未解決）

## 検証レポート

- [実機検証](docs/research/device-verification.md) — D1〜D7・UX 刷新・地図・共有・APK 起動の検証記録（スクリーンショット付き）
- [最終検証](docs/research/final-verification.md) — テスト・カバレッジ・バンドル・依存ルール・未確認 API の消化状況

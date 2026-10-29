# 寄鳥美鳥地（よりどりみどり）

スマートフォンの画面にいる**鳥が目的地の方向を向く**、方向特化型ナビゲーションのプロトタイプ。

地図を読まずに、鳥についていくだけで目的地へ近づける。GPS とコンパスだけを使い、**バックエンドなし・オフライン**で動作する。

## 技術構成

| 領域 | 技術 |
|---|---|
| フレームワーク | React Native + Expo + TypeScript（Android 先行、将来 iOS） |
| GPS・コンパス | `expo-location` |
| 地図（オプション） | `react-native-maps` |
| 永続化 | ローカル保存（AsyncStorage） |
| テスト | Jest（`jest-expo`）による純粋関数の単体テスト |

## 設計原則

1. **GPS・コンパス取得とナビゲーション計算を分離**する（取得 = アダプタ、計算 = 純粋関数）
2. **Mock センサー**を実装し、PC 上で挙動を再現可能にする
3. 将来的な **BLE 連携**を想定してインターフェースを分離する
4. **方位計算と境界条件には必ず単体テスト**を用意する
5. **GPS・方位の精度と鮮度**を表示・記録できるようにする
6. 初期段階では**バックエンドを使用しない**
7. **未確認のライブラリ API を想像で実装しない**（公式一次情報で確認する）

## ドキュメント

| 文書 | 内容 |
|---|---|
| [環境検証レポート](docs/environment-report.md) | 実機環境で構築可能かの検証結果・制約・必要準備 |
| [requirements.md](requirements.md) | 要件定義（機能・非機能・境界条件・受け入れ基準） |
| [architecture.md](architecture.md) | アーキテクチャ設計（レイヤ・インターフェース・テスト戦略） |
| [tasks.md](tasks.md) | 実装タスク分解（1タスクずつ実装・テスト） |
| [docs/research/](docs/research/) | ライブラリ API の一次情報調査・PC 構築実証 |

## リポジトリ構成

```
.
├── requirements.md          # 要件定義
├── architecture.md          # アーキテクチャ設計
├── tasks.md                 # 実装タスク
├── docs/
│   ├── environment-report.md
│   └── research/            # 一次情報の調査ノート・検証記録
├── mobile/                  # Expo アプリ本体（React Native + TypeScript）
├── .npmrc                   # npm キャッシュをワークスペース内へ固定（下記）
└── .gitignore
```

## 開発コマンド

> **この開発環境は DSH サンドボックス（workspace-write）で動いている。**
> ユーザーディレクトリ配下（`~/AppData/Local/npm-cache`, `~/.gradle`, Android SDK 等）への書き込みは拒否されるため、
> キャッシュ類はリポジトリ内へリダイレクトしている。詳細は [環境検証レポート](docs/environment-report.md)。

```powershell
cd mobile

# 依存インストール（.npmrc によりキャッシュは ../.cache/npm へ）
# ※ サンドボックス内ではライフサイクルスクリプトの spawn が EPERM になるため --ignore-scripts が必要
npm install --no-audit --no-fund --ignore-scripts

# 型検査
npx tsc --noEmit

# 単体テスト（※ この環境では --runInBand が必須：子プロセス生成がサンドボックスで制限されるため）
npx jest --runInBand

# 本番バンドルの検証（Metro。Hermes は --no-bytecode で回避）
npx expo export --platform android --max-workers 1 --no-bytecode

# 開発サーバ（PC 上）
npx expo start --web

# 開発サーバ（実機 / エミュレータ）
npx expo start --android
```

> **サンドボックスの制約（実測）**: パイプ付き stdio の子プロセス生成が一律 `EPERM` で拒否される。
> そのため `create-expo-app` / `npx expo install` / Jest の既定ワーカー / Hermes bytecode 生成が使えない。
> 回避策は「テンプレートは `npm pack` + `tar` で展開」「依存は `npm install --ignore-scripts`」
> 「Jest は `--runInBand`」「export は `--max-workers 1 --no-bytecode`」。
> `npx expo config` は無応答ハングするため、app.json の検証には `@expo/config` の `getConfig()` を使う。
> 詳細は [環境検証レポート](docs/environment-report.md) と [PC 構築実証](docs/research/pc-build-verification.md)。

### 環境変数（ネイティブビルド時のみ）

```powershell
$env:GRADLE_USER_HOME  = "<repo>\.gradle"
$env:ANDROID_HOME      = "<repo>\.android-sdk"   # ワークスペース内 SDK を使う場合
$env:ANDROID_USER_HOME = "<repo>\.android"
```

## ステータス

- [x] フェーズ1: 環境確認（PC 上での構築可否・Android 実行環境の readiness 判定）
- [ ] フェーズ1: 仕様策定（requirements / architecture / tasks）
- [ ] フェーズ1: プロジェクト雛形構築・PC 上でのビルド検証
- [ ] フェーズ2: 実装（1 タスクずつ実装・テスト）

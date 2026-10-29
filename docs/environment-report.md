# 環境検証レポート — 寄鳥美鳥地プロトタイプ

- 検証日時: 2026-10-30 (Asia/Tokyo)
- 検証担当: Lead（自動検証。コマンド実行ログに基づく。**推測は「未確認」と明記**）
- 対象: React Native + Expo + TypeScript（Android先行）/ GPS・コンパス（expo-location）/ 地図（react-native-maps）/ ローカル永続化 / Jest
- 検証ワークスペース: `C:\Users\MaedaNatsuki\Documents\deepseek-harness\default-workspace`

---

## 0. 結論サマリ

| レイヤ | 判定 | 根拠・条件 |
|---|---|---|
| PC上の TypeScript 開発（tsc / Jest 単体テスト） | **可能** | Node 22 + npm 10 動作。npm キャッシュをワークスペース内へリダイレクトすれば `npm view` / `npx expo` が成功 |
| Expo 開発サーバ / Metro バンドル（PC上） | **可能** | `npx expo --version` → `58.1.17` 成功。実バンドルは別途実証（`docs/research/pc-build-verification.md`） |
| Web プレビュー（PC上でのUI確認） | **可能（地図を除く）** | Expo web export で確認予定。react-native-maps の Web 対応は未確認 → 地図はフォールバック必須 |
| Android 実機での実行 | **現状不可 → 要準備** | `adb devices` 空。USB接続端末なし（usbipd にも該当デバイスなし） |
| Android エミュレータでの実行 | **現状不可 → 要準備** | system-image **0件**、AVD **0件**。既存SDKは書込不可のため、SDKをワークスペース内に用意する必要 |
| ネイティブ development build（react-native-maps 用） | **条件付きで可能（未実証）** | `~/.gradle`・`%LOCALAPPDATA%\Android\Sdk` が書込不可 → `GRADLE_USER_HOME` / `ANDROID_USER_HOME` のリダイレクトが必須。実ビルドは未実行 |
| バックエンド | 不要（要件どおり） | クラウド設定・APIキー類は一切不要 |

**最重要の結論**: コア（方位計算・Mockセンサー・Jest テスト）はこのPCだけで完全に開発・検証できる。**Android 実機/エミュレータでの動作確認だけが未整備**で、これはユーザーの準備（実機接続 or エミュレータ用イメージ導入の承認）が必要。

---

## 1. ハードウェア / OS

| 項目 | 値 | 取得方法 |
|---|---|---|
| OS | Microsoft Windows NT 10.0.26300.0 | `[System.Environment]::OSVersion` |
| ユーザー | `lx15pro\maedanatsuki` | `whoami` |
| CPU 論理プロセッサ | 16 | `$env:NUMBER_OF_PROCESSORS` |
| ディスク C: | 総容量 475.8 GB / 空き 94.1 GB | `[System.IO.DriveInfo]::new('C')` |
| ハイパーバイザ | WHPX (Windows Hypervisor Platform) が利用可能 | `emulator -accel-check` → `0` / `WHPX(10.0.26300) is installed and usable.` |

- `Get-CimInstance`（WMI）は**アクセス拒否**されるため、ハードウェア情報は .NET API で取得した。
- ディスク空き 94 GB は、node_modules（約 0.6〜1 GB）＋ エミュレータ用 system-image（約 1.5〜2 GB）を置くのに十分。

## 2. ツールチェーン

| ツール | バージョン / パス | 状態 |
|---|---|---|
| Node.js | **v22.22.0**（`C:\nvm4w\nodejs\node.exe`） | ✅ |
| npm | **10.9.4** | ✅ |
| pnpm | 未インストール（DSH同梱 pnpm 11.28.5 は利用可能だがプロジェクトでは未使用） | — |
| yarn | 未インストール | — |
| git | **2.52.0.windows.1** | ✅ |
| Java | **OpenJDK 17.0.18**（Microsoft build） | ✅ `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot\` |
| adb | **1.0.41 (36.0.2)** / `C:\ADB\adb.exe` | ✅ |
| Expo CLI | `npx expo` → **58.1.17**（npm レジストリから取得） | ✅（キャッシュリダイレクト時） |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk`（`ANDROID_HOME` / `ANDROID_SDK_ROOT` は**未設定**） | ✅ 一部のみ（§5） |

### 2.1 ライブラリの実バージョン（npm レジストリ実データ）

| パッケージ | バージョン | 備考 |
|---|---|---|
| `expo` | **58.0.21**（dist-tag `latest`） | 現行 SDK は **58**。`sdk-57`=57.0.31, `sdk-56`=56.0.24, `sdk-55`=55.0.32, `sdk-54`=54.0.38 |
| `expo-location` | **58.0.20** | SDK 58 系 |
| `react-native-maps` | **1.29.11** | Expo 対応状況は `docs/research/library-api-notes.md` を参照 |

> バージョンは `npm view <pkg> version` / `npm view expo dist-tags` の実行結果。**採用バージョンは architecture.md で確定**する（原則7: 未確認APIを想像で実装しない）。

## 3. サンドボックス制約と回避策（重要）

本セッションのファイルポリシーは **workspace-write**（ワークスペース外への書込は拒否）。以下は**実測で確認した拒否**と、確認済みの回避策。

| # | 操作 | 結果 | 回避策（検証済み） |
|---|---|---|---|
| 1 | npm 既定キャッシュ `C:\Users\...\AppData\Local\npm-cache` への書込 | ❌ `EPERM: operation not permitted, open ...\_cacache\tmp\...` | ✅ **`npm_config_cache=<workspace>\.cache\npm`** を設定。`npm view`・`npx expo` が成功することを確認 |
| 2 | `~/.gradle`（`C:\Users\...\.gradle`）への書込 | ❌ アクセス拒否 | ✅ 未検証。`GRADLE_USER_HOME=<workspace>\.gradle` を設定してビルドする想定（初回は依存DLで時間がかかる。ネットワークは§4のとおり到達可） |
| 3 | `%LOCALAPPDATA%\Android\Sdk` への書込 | ❌ アクセス拒否 | ✅ 未検証。`ANDROID_HOME` をワークスペース内SDKへ向ける（§5の準備B） |
| 4 | `C:\Android` への書込 | ❌ アクセス拒否 | — |
| 5 | グローバル npm prefix `C:\nvm4w\nodejs` への書込 | ❌ アクセス拒否 | ✅ グローバルインストールをせず、`npx` / ローカル `node_modules` のみ使う |
| 6 | ワークスペース内への書込 | ✅ 可能 | — |
| 7 | `%TEMP%` | ✅ 書込可（`C:\Users\...\AppData\Local\Temp\dsh-u4jXof`） | — |
| 8 | WMI (`Get-CimInstance`) | ❌ アクセス拒否 | ✅ .NET API（`System.IO.DriveInfo` 等）で代替 |
| 9 | `fsutil volume diskfree` / `Get-Volume` | ❌ アクセス拒否 | ✅ .NET `DriveInfo` で代替 |

### 3.1 恒久化する設定（プロジェクトで採用）

- プロジェクト直下と `mobile/` に `.npmrc` を置き、`cache` をワークスペース内へ固定する（**検証済み**: ルートは `.cache/npm`、`mobile/` は `../.cache/npm` に解決される）。
- 実行スクリプトでは `EXPO_NO_TELEMETRY=1`、`CI=1` を併用し、非対話で動かす。
- ネイティブビルド時のみ `GRADLE_USER_HOME` / `ANDROID_USER_HOME` / `ANDROID_AVD_HOME` をワークスペース内へ設定する。

### 3.2 追加で判明した制約（PC 構築実証で確定）

**根本原因: パイプ付き stdio の子プロセス生成が一律 `EPERM` で拒否される。** 切り分け実験で `pipe`=EPERM / `inherit`・`ignore`=成功、`execSync`・`fork` も EPERM と確定（[PC 構築実証](docs/research/pc-build-verification.md)）。

| 影響を受けるもの | 症状 | 回避策（実測で成功） |
|---|---|---|
| `npm install`（ライフサイクルスクリプト） | `spawn EPERM` で失敗 | ✅ `npm install --ignore-scripts`（実測 1002 packages / 53.8s） |
| `create-expo-app` | EPERM / 内部 TypeError | ✅ `npm pack expo-template-blank-typescript@latest` + `tar -xzf ... --strip-components=1` |
| `npx expo install` | `spawnAsync` EPERM | ✅ `npm install --ignore-scripts <pkg>@<SDK 58 ピン>`（ピン一覧は `docs/research/sdk58-bundled-native-modules.json`） |
| Jest の既定ワーカープール | 子プロセス生成 EPERM で失敗 | ✅ `npx jest --runInBand`（PASS 確認済み） |
| Hermes bytecode 生成 | `hermesc` の spawn EPERM | ✅ `npx expo export --platform android --max-workers 1 --no-bytecode`（616 モジュール / 992KB のバンドル生成を確認） |
| `npx expo config` | 無応答ハング（>600s、offline でも同様） | ✅ `@expo/config` の `getConfig()` を直接呼ぶ（0.1s で解決） |

> これらは**このサンドボックス固有**の制約であり、通常の開発 PC では標準コマンドがそのまま通る見込み（未確認）。
> `mobile/` では実測で `tsc --noEmit` が exit 0、`jest --runInBand` が exit 0 を確認済み。

## 4. ネットワーク到達性

**Node の `fetch` で実測**（HTTP ステータス）:

| 宛先 | 結果 | 用途 |
|---|---|---|
| `https://registry.npmjs.org/` | ✅ 200 | npm パッケージ取得 |
| `https://dl.google.com/android/repository/repository2-3.xml` | ✅ 200 | Android SDK / system-image 取得 |
| `https://maven.google.com/` | ✅ 200 | Gradle ネイティブビルドの依存取得 |
| `https://expo.dev/` | ✅ 200 | Expo ドキュメント / サービス |
| `https://github.com/` | ✅ 200 | 依存の一部取得 |
| npm レジストリへの `npm ping` | ✅ `PONG 399ms` | — |

- プロキシ設定なし（`npm config get proxy` → `null`）。
- ⚠️ **PowerShell の `Invoke-WebRequest` は全HTTPS宛先で失敗**（`接続が切断されました`）。TLS 実装側の問題と見られる。**以後、HTTP確認は Node / curl を使う**（Gradle は Java の TLS 実装を使うため影響不明＝未確認。ネイティブビルド実行時に要確認）。

## 5. Android 実行環境の readiness

### 5.1 既存 Android SDK（`%LOCALAPPDATA%\Android\Sdk`）の導入済みパッケージ

| パッケージ | バージョン |
|---|---|
| `platform-tools` | 37.0.1 |
| `platforms;android-35` | 2 |
| `platforms;android-36.1` | 1 |
| `build-tools;35.0.0` / `36.1.0` / `37.0.0` | 各導入済 |
| `emulator` | 37.2.12 |
| `extras;google;Android_Emulator_Hypervisor_Driver` | 2.2.0 |
| `sources;android-36.1` | 1 |
| `licenses/android-sdk-license` | 受諾済 |

### 5.2 不足しているもの（Android実行のブロッカー）

| 項目 | 状態 | 影響 |
|---|---|---|
| **system-image**（`system-images;android-XX;...`） | **0件** | エミュレータを起動できない |
| **AVD**（Android Virtual Device） | **0件**（`emulator -list-avds` 空、`~/.android/avd` 空） | 同上 |
| **接続中の実機** | **0台**（`adb devices` 空） | 実機で実行できない |
| USB/IP 共有デバイス | カメラ・Bluetooth のみ（スマホなし） | 実機をUSB/IP経由でも使えない |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | **未設定** | Expo/Gradle が SDK を自動発見できない可能性（`ANDROID_HOME` の明示が必要） |
| SDK ディレクトリへの書込権限 | **なし**（§3 #3） | 既存SDKに system-image / AVD を追加できない |

### 5.3 エミュレータの実行能力

- `emulator -accel-check` → **`WHPX(10.0.26300) is installed and usable.`** … ハードウェアアクセラレーションは利用可能。
- つまり「system-image と AVD さえ用意できれば」エミュレータは高速に動く見込み（実起動は未確認）。

## 6. レイヤ別の可否判定と、その理由

1. **コアロジック（純粋関数）＋ Jest**: ✅ 完全に可能。Node だけで動くため Android 環境に一切依存しない。設計原則2（MockセンサーでPC再現）と原則4（境界条件の単体テスト）はこの環境で完結できる。
2. **Expo アプリのバンドル（PC上）**: ✅ 可能（`npx expo` 起動確認済み）。Metro バンドルと型検査は Android 端末なしで検証できる。
3. **UI の目視確認（PC上）**: ⚠️ Expo web で可能な見込み（未実証）。ただし `react-native-maps` は Web 非対応の可能性が高く、**地図コンポーネントは差し替え可能な設計が必須**。
4. **Android 実機**: ❌ 現状不可。**ユーザーの実機接続が必要**（§7-A）。
5. **Android エミュレータ**: ❌ 現状不可。**system-image の導入が必要**（§7-B）。SDK 書込不可のため、ワークスペース内SDK＋`ANDROID_AVD_HOME` リダイレクト方式を採る。
6. **react-native-maps**: ✅ **Expo Go 同梱**（追加設定不要）。したがってプロトタイプの地図表示は **development build なしで Expo Go 上で動く**（調査ノート §3.1）。カスタムビルド（`expo run:android`）にする場合のみ Google Maps API キーが必要。**ネイティブビルド自体は未実行**で、必要になった場合は `GRADLE_USER_HOME` リダイレクトが前提。
7. **Google Maps の API キー**: ⚠️ **Expo Go では不要**。カスタムビルドでのみ必須（キー無しは地図が空白/グレー）。**未取得**。キーなしでも動く「地図なしフォールバック」を設計に入れる。
8. **react-native-maps は Web 非対応**（`MapView.web.ts` が `UnimplementedView` を export）→ **PC ブラウザで地図の実プレビューは不可**。Web では地図をフォールバック表示にする。
9. **Expo Go は SDK 57→58 の移行期**: versions API の `expoGoSdkVersion` は 57.0.0 だが、SDK 58 用 Expo Go（Android 58.0.5 APK）は `expo.dev/go` から入手可能。**実機では `expo.dev/go` の SDK 58 版を使う**（ストア版の SDK は要実機確認）。

## 7. 必要な準備（ユーザーアクション）

### A. Android 実機で動かす場合（推奨・最短）

1. Android 端末の「開発者向けオプション」→「USBデバッグ」を有効化。
2. USB ケーブルでこのPCに接続し、端末側の「USBデバッグを許可しますか？」を許可。
3. こちらで `adb devices` に端末が表示されることを確認。
4. **Expo Go（SDK 58 版）** を `expo.dev/go` から端末にインストール → `npx expo start` で接続。**地図（react-native-maps）も Expo Go に同梱されているため、開発ビルドなしで確認できる**（調査ノート §3.1）。カスタムビルドに切り替える場合のみ Google Maps API キーが必要。

### B. Android エミュレータで動かす場合

1. **ワークスペース内に Android SDK（emulator + system-image + platform-tools）を新規導入**する承認（約 1.5〜2 GB のダウンロード、94 GB 空きなので容量は問題なし）。
2. `ANDROID_AVD_HOME` をワークスペース内へ向けて AVD を作成。
3. 初回 Gradle ビルドは `GRADLE_USER_HOME` リダイレクトのため依存を一からDLする（数分〜十数分）。

### C. 地図（react-native-maps）を使う場合

1. Google Cloud Console で Maps SDK for Android を有効化し、**API キー**を取得（無料枠あり・課金設定が必要な場合あり）。
2. キーはリポジトリに直書きせず、`app.config.ts` の環境変数 / `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` 等で注入する。

### D. どちらも無い場合（現状のまま進める場合）

- **Mock センサー + Jest + Expo web プレビュー**でコア機能（方位計算・鳥の向き・精度/鮮度表示）を開発・検証し、Android 実機確認は後回しにする。設計原則2により、この進め方は仕様上正当。

## 8. 今後のコマンド規約（このリポジトリ共通）

```powershell
# 1) npm キャッシュをワークスペース内へ（必須）
$env:npm_config_cache = "<workspace>\.cache\npm"

# 2) 非対話・テレメトリ無効
$env:CI = "1"; $env:EXPO_NO_TELEMETRY = "1"

# 3) 型検査・テスト
npx tsc --noEmit
npx jest

# 4) Expo 開発サーバ（PC上）
npx expo start --web      # または --tunnel（実機接続時）

# 5) ネイティブビルド（実機/エミュレータ導入後）
$env:GRADLE_USER_HOME  = "<workspace>\.gradle"
$env:ANDROID_HOME      = "<workspace>\.android-sdk"   # 方式Bの場合
$env:ANDROID_USER_HOME = "<workspace>\.android"
npx expo run:android
```

- HTTP 疎通確認は `Invoke-WebRequest` ではなく Node / curl を使う（§4）。
- 依存追加は `npx expo install <pkg>`（SDK 58 に整合するバージョンを解決させる）。`npm install` 直叩きは最終手段。

## 9. 未確認事項（実装前に潰す）

| # | 未確認事項 | 確認方法 | 担当 |
|---|---|---|---|
| 1 | expo-location / react-native-maps の正確な API・Expo Go 対応・APIキー必須性 | 公式ドキュメント精読 | researcher（`docs/research/library-api-notes.md`） |
| 2 | Expo blank-typescript 雛形の生成と npm install / tsc / jest / export が本当に通るか | スクラッチ実証 | env-verifier（`docs/research/pc-build-verification.md`） |
| 3 | Gradle ネイティブビルドがサンドボックス下で通るか（`GRADLE_USER_HOME` リダイレクト含む） | 実機/エミュレータ準備後 | 未着手 |
| 4 | Java の TLS で maven.google.com / dl.google.com から依存取得できるか | 同上 | 未着手 |
| 5 | Expo web での expo-location の挙動（ブラウザ Geolocation の可否） | `expo start --web` 実機確認 | 未着手 |
| 6 | `ANDROID_USER_HOME` / `ANDROID_AVD_HOME` によるリダイレクトが各ツールで有効か | エミュレータ準備時に検証 | 未着手 |

---

## 付録: 実行した主な検証コマンド（再現用）

```powershell
node -v; npm -v; git --version; java -version; adb version
(Get-Command adb).Source
adb devices -l
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -list-avds
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -accel-check
& "C:\Android\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="$env:LOCALAPPDATA\Android\Sdk" --list_installed
npm --cache "<workspace>\.cache\npm" view expo dist-tags --json
npm --cache "<workspace>\.cache\npm" view expo-location version
npm --cache "<workspace>\.cache\npm" view react-native-maps version
$env:npm_config_cache = "<workspace>\.cache\npm"; npx --yes expo@latest --version
node -e "fetch('https://dl.google.com/...').then(r=>console.log(r.status))"   # 到達性
```

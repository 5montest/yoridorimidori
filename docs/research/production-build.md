# Android APK 本番ビルド可否検証レポート

- 検証日時: 2026-10-30 02:03〜02:52 (Asia/Tokyo)
- 検証担当: build-investigator（DSH サブエージェント）
- 検証場所: `C:\Users\MaedaNatsuki\Documents\deepseek-harness\default-workspace\.build-probe\app`（`mobile/` の完全コピー。**`mobile/` と `docs/` には書き込みせず、本書のみ docs 配下に新規作成**）
- 対象: 「寄鳥美鳥地」Expo SDK 58 / RN 0.88.1 アプリ（`mobile/`）の debug APK ビルド
- 参照: [環境検証レポート](../environment-report.md) §3/§3.2/§5、[PC 構築実証](pc-build-verification.md)

---

## 0. 結論（先に）

| 項目 | 判定 | 根拠 |
|---|---|---|
| **この DSH サンドボックス内でのローカル APK ビルド** | **❌ 不可** | すべての前段（Gradle 配布物 DL・Maven 依存解決・AGP 設定・Java/Kotlin コンパイル・リソース/マニフェスト処理）は成功したが、**ネイティブ C++ ビルド（CMake）のドライバである `ninja` が、子プロセスを実行した後にプロセス終了せずハング**する。Expo SDK 58 は `expo-modules-core` の C++（JSI/JNI）ビルドが必須のため、`assembleDebug` は完了できない |
| **APK 生成物** | **なし** | `android/app/build/outputs/apk/` は生成されず（`outputs/logs/` のみ） |
| **実機（Pixel 4a）へのインストール** | **未実施（APK がないため不可）** | 端末は接続認識済み: `12231JEC206116 device product:sunfish model:Pixel_4a`（Android 13 / API 33）。APK が無いので `adb install` に進めない |
| **サンドボックス外（通常の Windows PC / CI）でのローカルビルド** | **✅ 可能な見込み（未実証）** | 本サンドボックス固有の「子プロセス/パイプ制約」さえ無ければ、本検証で成功した全工程＋標準の SDK/NDK 自動導入で通る見込み。再現スクリプト `scripts/build-android.ps1` を用意 |
| **EAS Build / GitHub Actions（クラウド）** | **✅ 推奨（本環境の唯一の現実的経路）** | クラウド側にサンドボックス制約はない。手順は §7 |

**一言**: 「アプリ側・SDK 設定側の問題ではなく、**このサンドボックスが CMake/ninja のビルド実行を完結させられない**」ことが唯一かつ最大のブロッカー。コンパイル・依存解決能力自体は十分にある（下記実測）。

> **追記（2026-10-30 04:14〜）**: DSH のファイルポリシーが **danger-full-access** に変更された。§0〜§9 は**旧ポリシー（workspace-write）時点**の記録であり、新ポリシー下では結論が変わる見込み。再検証状況・落とし穴・`.apk-build/` の準備は **§10** を参照。

---

## 1. 実測したツールチェーン / ビルド設定値

`android/gradle.properties` および Gradle ログ `[ExpoRootProject] Using the following versions`（`.build-probe/logs/03-assembleDebug-attempt1.log`）より実測。

| 項目 | 実測値 | 取得元 |
|---|---|---|
| compileSdk | **37** | Gradle ログ / `expo-gradle-plugin` 既定値（`ExpoRootProjectPlugin.kt`） |
| targetSdk | **36** | 同上 |
| minSdk | **24** | 同上 |
| buildTools | **37.0.0**（AGP が追加で 36.0.0 も自動導入） | Gradle ログ / `.build-probe/sdk/build-tools` |
| NDK | **27.1.12297006**（AGP が自動 DL・導入） | Gradle ログ / `.build-probe/sdk/ndk` |
| CMake | **3.22.1**（AGP が自動 DL・導入） | Gradle ログ / `.build-probe/sdk/cmake` |
| Kotlin Gradle Plugin | **2.2.10**（version catalog 表記は 2.2.0 → 実プラグイン 2.2.10 を採用） | Gradle ログ |
| Gradle | **9.4.1**（wrapper が `services.gradle.org` から DL） | `gradle-wrapper.properties` / `gradlew --version` |
| AGP | **9.2.1**（React Native version catalog `libs.versions.toml` 由来） | `node_modules/@react-native/gradle-plugin/gradle/libs.versions.toml` |
| JDK | **17.0.18**（Microsoft build、`JAVA_HOME` 既存設定を利用） | `gradlew --version` の Launcher JVM |
| Expo / RN / React | 58.0.21 / 0.88.1 / 19.3.0 | `mobile/node_modules/*/package.json` |
| 新アーキテクチャ | `newArchEnabled=true` / Hermes 有効 | 生成 `android/gradle.properties` |
| アプリID / version | `jp.yoridorimidori.app` / versionCode 1, versionName "0.1.0" | 生成 `android/app/build.gradle` |
| 生成テンプレート | `expo-template-bare-minimum@58.0.30`（`npm pack` でローカル取得） | `.build-probe/template/` |

> 補足: Expo SDK 58 のビルドは **compileSdk 37** で、既存 SDK に無い `platforms;android-37.0` を要求する。dl.google.com のリポジトリ XML 上は `platforms;android-37.0` / `37.1` / `37.2` が提供（`android-37` という名前は無い）。本検証では zip を直接取得して配置し、AGP から認識されることを確認した（§3）。

---

## 2. 実行環境のリダイレクト（このサンドボックスで必須）

`~/.gradle` / `%LOCALAPPDATA%\Android\Sdk` / `%USERPROFILE%` は**書込不可**のため、以下をワークスペース内へ向けた（実測で有効）。

```powershell
$ws = "C:\Users\MaedaNatsuki\Documents\deepseek-harness\default-workspace"
$env:GRADLE_USER_HOME   = "$ws\.gradle"                 # 書込可（3.37 GB 消費。Gradle 9.4.1 配布物 + Maven キャッシュ）
$env:ANDROID_USER_HOME  = "$ws\.android"                # AVD 用（今回は未使用）
$env:ANDROID_HOME       = "$ws\.build-probe\sdk"        # ★書込可の SDK コピー（§3）
$env:ANDROID_SDK_ROOT   = "$env:ANDROID_HOME"
$env:HOME               = "$ws\.build-probe\home"       # Node/Expo の ~ 書込回避
$env:USERPROFILE        = "$ws\.build-probe\home"
$env:JAVA_HOME          = "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
$env:npm_config_cache   = "$ws\.cache\npm"
$env:CI = "1"; $env:EXPO_NO_TELEMETRY = "1"; $env:EXPO_NO_GIT_STATUS = "1"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
```

- `ANDROID_HOME` をワークスペース内 SDK へ向けることで、**AGP による NDK / CMake / build-tools の自動ダウンロード・インストールが成功**した（これは大きな収穫。書込不可の既存 SDK のままでは失敗する）。
- 注意: `ANDROID_USER_HOME` は AVD には効くが、AGP の analytics（`~/.android/analytics.settings`）には効かず、`Unable to initialize metrics, ensure C:\Users\...\.android is writable` 警告が出る（**非致命**。`-Duser.home` を GRADLE_OPTS に足せば消せる見込み・未検証）。
- `java` は `JAVA_HOME` 経由で起動確認済み（`openjdk version "17.0.18"`）。

---

## 3. ワークスペース内 Android SDK の構築（書込不可 SDK の回避）

既存 SDK `%LOCALAPPDATA%\Android\Sdk`（1.9 GB、**書込不可**）はそのまま使い、必要な最小構成を `.build-probe/sdk` へコピー＋不足分を手動配置した。最終 2.96 GB。

| 手順 | 内容 | 結果 |
|---|---|---|
| 1 | `licenses` / `platform-tools` / `build-tools\37.0.0` / `build-tools\36.1.0` を robocopy | ✅ 293 MB |
| 2 | `platforms;android-37.0` が無いため、dl.google.com の `repository2-3.xml` から `platform-37.0_r02.zip`（67,281,901 B）を **Node fetch** で取得し `platforms\android-37.0` に展開 | ✅ `AndroidVersion.ApiLevel=37.0`, `android.jar` 41.1 MB |
| 3 | `ANDROID_HOME` をこの SDK に向けて Gradle 実行 → AGP が **NDK 27.1.12297006・CMake 3.22.1・build-tools 36.0.0** を自動 DL | ✅ `Install ... complete.` をログで確認 |
| 4 | AGP が platform を `android-37.0-2` へ再取得（`inconsistent location` 警告） | 警告のみ・認識は正常（非致命） |

- `sdkmanager.bat` は不使用（Java の TLS/書込みを介さず、Node fetch + `tar` で確実に取得）。
- 既存 SDK を丸ごとコピーせず、必要な物だけにしたため書込み可能 SDK の作成は約 30 秒。

---

## 4. 実行したコマンド列と所要時間（そのまま再現可能）

作業ディレクトリ `.build-probe/`（`mobile/` のコピー）。**`mobile/` は一切変更していない。**

### 4.1 事前準備

| # | コマンド（要旨） | 所要時間 | 結果 |
|---|---|---|---|
| 1 | `robocopy mobile .build-probe\app /E`（`node_modules` 含む 60,891 ファイル / 429 MB） | 約 40 秒 | ✅ |
| 2 | `npm pack expo-template-bare-minimum@sdk-58`（`npm_config_cache` をワークスペース内へ） | 約 5 秒 | ✅ `expo-template-bare-minimum-58.0.30.tgz`（298 KB） |
| 3 | `node <fetch> https://dl.google.com/android/repository/platform-37.0_r02.zip` | 約 10 秒 | ✅ 67 MB |
| 4 | SDK 最小コピー（§3） | 約 30 秒 | ✅ 293 MB |

### 4.2 prebuild（ネイティブプロジェクト生成）

```powershell
Set-Location .build-probe\app
node node_modules/expo/bin/cli prebuild --platform android --no-install `
  --template "..\template\expo-template-bare-minimum-58.0.30.tgz"
```

| 結果 | 所要時間 | 備考 |
|---|---|---|
| ✅ 生成成功（`Created native directory` → `Finished prebuild`） | **約 3 秒**（02:08:06→02:08:09） | `--no-install` 必須（npm install を spawn させない）。**CLI は完了後もプロセスが終了しない**（既知のハング）ため、ログで完了を確認して kill。ローカル template を `--template` で渡すことで `npm view`/`npm pack` の内部 spawn（EPERM）を回避 |

- 非致命警告: `» android: userInterfaceStyle: Install expo-system-ui in your project to enable this feature.`
- 生成された主なファイル: `android/build.gradle` / `android/gradle.properties` / `android/settings.gradle` / `android/app/build.gradle` / `android/gradle/wrapper/gradle-wrapper.properties`（Gradle 9.4.1）。

### 4.3 Gradle 配布物の取得確認

```powershell
Set-Location .build-probe\app\android
.\gradlew.bat --version --no-daemon
```

| 結果 | 所要時間 | 備考 |
|---|---|---|
| ✅ Gradle 9.4.1 / Launcher JVM 17.0.18 | **4.8 秒**（初回。`services.gradle.org` から 130 MB 級を DL） | Java の TLS は正常。**`GRADLE_USER_HOME` 未設定だと `Could not create parent directory for lock file C:\Users\...\.gradle\...` で即失敗**することも実測（§6-B2） |

### 4.4 APK ビルド（本命）

```powershell
Set-Location .build-probe\app\android
.\gradlew.bat assembleDebug --no-daemon --console=plain --stacktrace
```

| 結果 | 所要時間 | 到達点 |
|---|---|---|
| ❌ **未完了（ハング）→ kill** | 開始 02:14:24 / 最終ログ 02:21:18 / kill 02:34（**約 20 分**） | `> Task :app:configureCMakeDebug[arm64-v8a]` で**8 分以上無出力**、以降進まず |

- 途中までに**成功した工程**: Maven 依存解決（`.gradle/caches` 3.2 GB 取得）、AGP 9.2.1 読込、Expo プラグイン設定、`expo-modules-core` を含む各モジュールの **Kotlin/Java コンパイル**、リソースマージ、マニフェスト処理、AAR メタデータ検査、dex マージ、prefab パッケージ生成。
- 停止点の詳細: `app/build/intermediates/cxx/Debug/<hash>/logs/arm64-v8a/configure_stdout.txt` が
  ```
  -- The C compiler identification is Clang 18.0.2
  -- The CXX compiler identification is Clang 18.0.2
  -- Detecting C compiler ABI info
  ```
  で止まり、`CMakeFiles\CMakeTmp` にコンパイル済み `.o` はあるが **リンク済み実行ファイルが生成されない**まま。cmake/ninja プロセスは残存（CPU ほぼ 0）。
- 出力: `android/app/build/outputs/apk/` は**存在せず**（`outputs/logs/` のみ）。**APK なし。**

---

## 5. ブロッカーの本質（切り分け結果）

### B-1【最大・唯一のブロッカー】`ninja` が子プロセス実行後に必ずハングし、CMake ビルドが完了しない

サンドボックス制約（[§3.2](../../docs/environment-report.md): パイプ付き子プロセス生成の EPERM 等）の影響を切り分けるため、**Gradle を介さない最小再現**を行った。

| # | 実験 | 結果 |
|---|---|---|
| 1 | Gradle `assembleDebug` の CMake configure（`configureCMakeDebug[arm64-v8a]`） | ❌ **8 分以上ハング**（`-- Detecting C compiler ABI info` で停止） |
| 2 | 最小 CMake プロジェクト（`add_library` + `add_executable`、NDK 27 ツールチェーン）を直接 configure | ❌ **同一箇所でハング**（reproduce） |
| 3 | NDK の `clang.exe` で直接リンク（`--target=aarch64-none-linux-android24`） | ✅ **0.1 秒で成功**（コンパイラ/リンカ自体は健全） |
| 4 | `cmake.exe --version` / `ninja.exe --version` | ✅ 即時成功 |
| 5 | `ninja -n`（dry run）/ `ninja -t targets`（ツール） | ✅ 即時成功（コマンド行の表示まで正常） |
| 6 | **単体 ninja で 1 コマンドだけ実行**（`echo hello > out.txt` の build.ninja） | ❌ **ハング**。ただし **`out.txt` には `hello` が書き込まれた**＝子コマンドは実行され、ninja が終了しないだけ |
| 7 | 単体 ninja で直接 exe（`whoami.exe`）を実行 | ❌ 同様にハング（`cmd.exe` 経由に限定されない） |
| 8 | ハング対策: `stdin` を `NUL` に、`stdout/stderr` を**ファイルへリダイレクト** | ❌ **効果なし**（パイプ起因だけではない） |

**結論**: このサンドボックスのプロセス制約下では、**ninja が子プロセスの完了を検知できず（子コマンド自体は走るが ninja が返らない）**、CMake の configure/build が完了しない。AGP の `externalNativeBuild` は **Ninja ジェネレータ必須**であり、`expo-modules-core` の C++（JSI/JNI）は APK に必須のため、**回避策はワークスペース内では成立しない**。

> 誤解しないための注記: 「CMake+ninja+clang の hello まで成功」に見えるのは **コンパイル/リンクの子コマンドが実行された証拠**であって、**ビルドツール（ninja）が正常終了した証拠ではない**。プロセス終了・成果物生成まで確認できるのは #3 の直接 clang 呼び出しのみ。

### B-2〜B-6 非致命の警告・制約（ビルドは継続）

| # | 事象 | エラー要点 | 影響 |
|---|---|---|---|
| B-2 | Kotlin daemon 起動不可 | `java.nio.file.AccessDeniedException: C:\Users\...\AppData\Local\kotlin\daemon\kotlin-daemon-client-*.tmp` → `Could not connect to Kotlin compile daemon` | 非致命。`Using fallback strategy: Compile without Kotlin daemon` で in-process コンパイルに自動フォールバック。`-Pkotlin.compiler.execution.strategy=in-process` を付ければログのノイズも減る |
| B-3 | Gradle ファイル監視 | `Caught exception: Couldn't open current thread, error = 5`（native file events） | 非致命。`-Dorg.gradle.vfs.watch=false` で抑止可（推奨） |
| B-4 | Expo fingerprint 埋め込み | `Could not embed the project fingerprint (app.fingerprint): spawn EPERM. The build continues normally...` | 非致命（既知のパイプ制約） |
| B-5 | AGP analytics | `Unable to initialize metrics, ensure C:\Users\...\.android is writable` | 非致命（`ANDROID_USER_HOME` では redirect されない） |
| B-6 | platform 冪等性 | `Observed package id 'platforms;android-37.0' in inconsistent location '...\android-37.0-2' (Expected '...\android-37.0')` | 非致命。compileSdk 37 は認識されビルドは進行 |
| B-7 | Expo CLI の終了ハング | `expo prebuild` は本体完了（`Finished prebuild`）後プロセスが終了しない。`expo config` も同様（既知） | 工程自体は成功。ログ確認後に kill で運用可 |

### 試した回避策と結果（時系列）

| 試行 | 目的 | 結果 |
|---|---|---|
| 既存 SDK をそのまま `ANDROID_HOME` に | SDK 書込不可の影響確認 | ❌ platform 37 が無く、AGP の自動導入も書込拒否 |
| SDK をワークスペース内へコピー + platform 37.0 を手動配置 | 書込権限と platform 不足の解消 | ✅ 成功（NDK/CMake も AGP が自動導入） |
| `--no-daemon` / `--console=plain` | サンドボックスで安定したログ | ✅ 有効 |
| Kotlin daemon 失敗 → 自動 fallback | コンパイル継続 | ✅ 有効（非致命） |
| 最小 CMake / 単体 ninja / stdin=NUL / stdout ファイル redirect | CMake ハングの切り分け・回避 | ❌ すべてハング再現・回避不可 |
| `-PreactNativeArchitectures=arm64-v8a`（ABI 削減） | ビルド量削減 | 未試行（configure 段階で停止するため無意味と判断） |

---

## 6. 成果物・証跡

| パス | 内容 |
|---|---|
| `.build-probe/app/` | `mobile/` のコピー（`node_modules` 含む）。`android/` は prebuild 生成物 |
| `.build-probe/app/android/` | 生成されたネイティブプロジェクト（Gradle 9.4.1 / AGP 9.2.1） |
| `.build-probe/sdk/` | **書込可能 SDK 2.96 GB**（platform-tools / build-tools 36.0.0, 36.1.0, 37.0.0 / platforms android-37.0, android-37.0-2 / NDK 27.1.12297006 / CMake 3.22.1 / licenses） |
| `.build-probe/template/expo-template-bare-minimum-58.0.30.tgz` | prebuild 用ローカルテンプレート |
| `.build-probe/downloads/platform-37.0_r02.zip` | platform 37.0（67 MB） |
| `.build-probe/logs/01-prebuild.log` | prebuild ログ（3 秒で完了） |
| `.build-probe/logs/02-gradle-version.log` | Gradle 9.4.1 / JDK 17 起動確認 |
| `.build-probe/logs/03-assembleDebug-attempt1.log` | **assembleDebug 全ログ（248 KB）。停止点・実測バージョン・警告の一次証跡** |
| `.build-probe/logs/04-cmake-minimal.log` | 最小 CMake 再現ログ |
| `.build-probe/logs/06/07/08-ninja*.log` | ninja 単体ハングの再現ログ（07/08 は 0 バイト＝子コマンド実行後も無出力のままハング） |
| `.gradle/` | Gradle 9.4.1 配布物 + Maven キャッシュ（3.37 GB） |
| **APK** | **なし（`.cache/build/` にもコピー対象なし）** |

---

## 7. 代替案（デプロイ経路）

### 7-1. EAS Build（クラウド・推奨／最短）

この環境の制約を受けない Expo 公式クラウドビルド。**必要なもの: Expo アカウント（https://expo.dev/signup、無料枠あり）とネットワークのみ**。

```powershell
# 1) ログイン（初回のみ）
npx eas-cli login            # Expo アカウント
# 2) プロジェクト初期化（eas.json は Lead が作成。ここでは触らない）
cd mobile
npx eas-cli build:configure --platform android
# 3) APK をクラウドでビルド（profile 名は eas.json の定義に合わせる）
npx eas-cli build --platform android --profile preview
# 4) 生成 APK を取得して実機へ
adb install -r <ダウンロードした APK>
```

- `eas.json` の `preview` プロファイルで `"android": { "buildType": "apk" }` にすると **APK**、`production` は AAB（配布用）。
- **Google Maps API キー**はカスタムビルドでは必須（Expo Go では不要）。`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` などを `eas secret` / `eas.json` の env で注入する（キー無しでも地図以外は動作する設計なら、キーなしで APK を作る選択肢もある）。
- 無料枠: ビルド回数・同時実行数・待ち時間に制限あり（プランによる）。

### 7-2. GitHub Actions（CI でAPKを生成）

GitHub の Ubuntu runner には Android SDK が入っており、**SDK への書込みも可能**なので本サンドボックスの制約は無関係。`mobile/package-lock.json` があるため `npm ci` が使える。

```yaml
# .github/workflows/build-android.yml（例）
name: build-android
on: { workflow_dispatch: {}, push: { branches: [main] } }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: mobile/package-lock.json }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - name: npm ci
        working-directory: mobile
        run: npm ci
      - name: prebuild
        working-directory: mobile
        run: npx expo prebuild --platform android --no-install
      - name: assembleDebug
        working-directory: mobile/android
        run: chmod +x gradlew && ./gradlew assembleDebug --no-daemon --console=plain
      - uses: actions/upload-artifact@v4
        with:
          name: app-debug-apk
          path: mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

- 初回は NDK/CMake/build-tools の自動 DL で 10〜20 分。2 回目以降は `actions/cache` で短縮可。
- `EXPO_TOKEN` を Secrets に置けば EAS Build を CI から起動する構成も可。

### 7-3. 通常の Windows PC（サンドボックス外）でのローカルビルド

本検証のコマンド列をそのまま実行すれば通る**見込み**（未実証）。`scripts/build-android.ps1` を用意した。通常 PC では `~/.gradle` と `%LOCALAPPDATA%\Android\Sdk` が書込可能なので、リダイレクトは任意。Android Studio / JDK 17 / Node 22 のみ用意すれば、NDK・CMake・build-tools は AGP が自動導入する。

### 7-4. 配布せずに確認する場合（参考）

- **Expo Go + Metro** での実機確認は既に成功済み（[environment-report §5.4](../environment-report.md)）。プロトタイプの動作確認だけなら APK 不要。
- **EAS Update** で JS バンドルだけを配信する方法もある（ネイティブ変更が無い範囲）。

---

## 8. 再現スクリプト

`scripts/build-android.ps1`（ルート `scripts/` 配下）を作成した。通常の Windows PC 向けの手順を 1 コマンド化したもの。

```powershell
# 通常PC（サンドボックス外）:
pwsh -File scripts/build-android.ps1
# オプション例:
pwsh -File scripts/build-android.ps1 -ProjectRoot mobile -Task assembleDebug -Arch arm64-v8a
```

スクリプト冒頭に「**DSH サンドボックス内では `configureCMakeDebug` で ninja がハングするため完了しない**」ことを明記している。

> **2026-10-30 追加**: full-access / 通常 PC で `.apk-build\app` を使う一括スクリプト `scripts/build-apk.ps1` も用意した（`npm install` → `expo prebuild` → `gradlew assembleDebug` → `.cache/build/` へ APK コピー → `adb install -r` → 起動確認・スクショ。失敗時もログを残してサマリ表示）。使い方は §10.4 参照。

> 注意: `.ps1` は **UTF-8 BOM 付き**で保存している。この環境の PowerShell パーサは BOM 無し UTF-8 の `.ps1` を ANSI(CP932) として解釈して日本語コメントで構文エラーになる（実測）。BOM を削らないこと。

---

## 9. 未確認事項 / 次に必要なこと

| # | 事項 | 必要なもの |
|---|---|---|
| 1 | EAS Build による APK 生成（実機インストールまで） | **Expo アカウント**でのログイン（Lead が eas.json を用意）。ネットワークは到達可を確認済み |
| 2 | GitHub Actions での APK 生成 | GitHub リポジトリ + workflow 追加（`mobile/` を push） |
| 3 | Google Maps API キー | カスタムビルドで地図を有効にする場合のみ。Google Cloud Console |
| 4 | サンドボックス外 Windows PC での実ビルド | 通常の Android SDK/JDK がある PC。本レポートの手順で再現可（見込み） |
| 5 | release APK / AAB・署名 | EAS では自動署名（`eas credentials`）。ローカルでは keystore 作成が必要（今回は debug にも到達せず未着手） |

---

## 10. サンドボックス解除後の再検証（2026-10-30 04:14〜 ポリシー変更）

> 本節は初回検証（02:03〜02:52、workspace-write）の**後**に判明した環境変更と、その下での再検証準備の記録。§0〜§9 の「不可」判定は**旧ポリシー時点**の結論である。

### 10.1 変更内容（Lead セッションでの実測）

- DSH のファイルポリシーが **workspace-write → danger-full-access** に変更され、承認プロンプトも不要になった。
- Lead（full-access）セッションでの実測:
  - **パイプ付き子プロセス spawn が成功**（`execSync` / `spawnSync` とも OK）
  - `~/.gradle` / `%LOCALAPPDATA%\Android\Sdk` / npm 既定キャッシュが**書込可**
- これにより §5 の推定原因（パイプ付き子プロセス拒否に起因する ninja ハング）は解消される見込み。full-access 環境での APK ビルドは **Lead が実行中**（結果は §10.5 に追記予定）。

### 10.2 重要な落とし穴: 既に spawn 済みの teammate セッションは旧ポリシーのまま

**teammate のセッションは spawn 時点のファイルポリシーを引き継ぎ、途中のポリシー変更は反映されない。**
build-investigator セッションで 04:14〜04:16 に実測（同一 turn 内で再確認）:

| 検証 | 結果 |
|---|---|
| `node -e "execSync('cmd /c echo ...')"` | ❌ **EPERM** |
| `node -e "spawn(cmd, ..., {stdio:['ignore','pipe','pipe']})"` | ❌ **spawn EPERM** |
| `~/.gradle` / `%LOCALAPPDATA%\Android\Sdk` / `C:\Users\...` への書込 | ❌ アクセス拒否 |
| ワークスペース内 `.gradle` / `.apk-build` への書込 | ✅ 可 |
| pwsh からの `cmd.exe` 直接起動（inherit） | ✅ 可（パイプは不可） |

→ **子プロセス（パイプ）・外部パス書込を伴う作業（APK ビルド等）は、Lead（full-access）または新規に spawn した teammate で行う必要がある。** 既存 teammate に依頼しても旧ポリシーのままで失敗する（※この切り分けは本再挑戦の重要な知見）。

### 10.3 `.apk-build/` の準備（build-investigator が実施済み）

`mobile/` は Phase 4 実装中のため**一切変更せず**、スナップショットを別ディレクトリに作成した。

```powershell
# 1) ソースのスナップショット（node_modules 等はコピーしない）
New-Item -ItemType Directory -Force -Path .apk-build | Out-Null
robocopy .\mobile .\.apk-build\app /E /R:2 /W:2 /MT:8 `
  /XD .\mobile\node_modules .\mobile\.expo .\mobile\dist .\mobile\coverage
# → 119 ファイル（assets/ src/ __mocks__/ App.tsx index.ts app.json eas.json package*.json tsconfig.json など）

# 2) 依存インストール（旧ポリシー下でも --ignore-scripts で成功した実績あり）
cd .apk-build\app
$env:npm_config_cache = "<workspace>\.cache\npm"
npm ci --ignore-scripts --no-audit --no-fund
# → 1006 packages / 42.4 秒で成功（04:17 実測）
```

- 注意: `npm ci` 時に `react-native-svg` の一部ファイルで `TAR_ENTRY_ERROR ENOENT` 警告が出た（exit 0）。**full-access では `--ignore-scripts` を付けずに `npm install` するのが確実**（Lead 実行手順どおり）。prebuild には `package.json` と autolinking メタデータがあれば足りるため実害はない見込みだが、release ビルド（JS バンドル）まで行う場合は `node_modules\react-native-svg` の欠損に注意（`npm install` 再実行で解消）。

### 10.4 full-access 環境でのビルド手順（Lead が実行）

```powershell
cd .apk-build\app
$env:npm_config_cache = "<workspace>\.cache\npm"   # 既定キャッシュでも可（書込可）
npm install --no-audit --no-fund
npx expo prebuild --platform android
cd android
.\gradlew.bat assembleDebug --no-daemon
```

- 既定の `~/.gradle` / `%LOCALAPPDATA%\Android\Sdk` が使える。SDK が書込可のため **AGP が platform 37 / NDK 27.1.12297006 / CMake 3.22.1 / build-tools を自動導入**できる（§3 の手動 SDK 構築は不要になる見込み）。
- 既存キャッシュの再利用も可（任意）: `GRADLE_USER_HOME=<workspace>\.gradle`（3.37 GB、Gradle 9.4.1 + Maven キャッシュ済み）/ `ANDROID_HOME=<workspace>\.build-probe\sdk`（2.96 GB、NDK・CMake・platform 37 導入済み）。
- 生成 APK: `android/app/build/outputs/apk/debug/app-debug.apk`。
- release: `.\gradlew.bat assembleRelease --no-daemon`。本テンプレートの `signingConfigs.release` は **debug 署名**に設定済みのため、プロトタイプ配布ならそのままインストール可能。正式署名にする場合は `keytool` で keystore を作成し、`android/gradle.properties` に `MYAPP_UPLOAD_STORE_FILE` 等を置いて `app/build.gradle` の `signingConfigs.release` から参照する（`mobile/` を触らず `.apk-build/app/android` 側のみで完結させる）。
- 一括実行する場合: `pwsh -File scripts/build-apk.ps1 -AppDir .apk-build\app`（本節の手順＋APK コピー＋`adb install -r`＋起動確認＋スクショを実行。失敗時も `.apk-build\logs\` にログを残してサマリ表示）。

### 10.5 再検証結果（2026-10-30 04:20 時点: 未確定）

| 項目 | 結果 |
|---|---|
| `npm install`（.apk-build/app） | ✅ 1006 packages / 42.4 秒（ただし `--ignore-scripts` での実測） |
| `expo prebuild` | 未実施（Lead 実行予定） |
| assembleDebug | 未確定（Lead 実行中） |
| APK パス / サイズ | 未確定 |
| assembleRelease | 未確定 |
| `adb install -r` / 起動確認 | 未確定 |
| 所要時間（初回/2回目） | 未確定 |

---

## 付録 A: assembleDebug ログの要点（一次証跡から抜粋）

```text
[ExpoRootProject] Using the following versions:
  - buildTools:  37.0.0
  - minSdk:      24
  - compileSdk:  37
  - targetSdk:   36
  - ndk:         27.1.12297006
  - kotlin:      2.2.10
...
Checking the license for package NDK (Side by side) 27.1.12297006 ... accepted.
Installing NDK (Side by side) 27.1.12297006 ... complete.
...
> Task :expo-modules-core:compileDebugKotlin
> Task :expo-modules-core:configureCMakeDebug[arm64-v8a]
...
"Install CMake 3.22.1 v.3.22.1" ... complete.
...
> Task :app:processDebugManifest
> Task :app:processDebugManifestForPackage
> Task :app:configureCMakeDebug[arm64-v8a]     ← ここから 8 分以上進まず（最終ログ 02:21:18）
```

`app/build/intermediates/cxx/.../configure_stdout.txt`（停止時点）:

```text
-- The C compiler identification is Clang 18.0.2
-- The CXX compiler identification is Clang 18.0.2
-- Detecting C compiler ABI info
```

## 付録 B: 環境回復手順（次回以降のため）

```powershell
# 残存プロセス掃除（ハングした java / cmake / ninja を kill）
Get-Process -Name java,cmake,ninja -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "*$PWD*" } | Stop-Process -Force
# 再実行時は §2 の env を設定し、4.4 を実行（このサンドボックスでは configureCMakeDebug で停止する）
```

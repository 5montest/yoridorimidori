# デプロイ手順書（Android 配布ビルド / EAS Build クラウド）

- 確認日: **2026-10-30**（Asia/Tokyo）
- 対象プロジェクト: 寄鳥美鳥地 スマホ向けナビプロトタイプ（**Expo SDK 58 / React Native 0.88.1**、Android先行、package name `jp.yoridorimidori.app`）
- 方針: 本サンドボックスでは**ローカル Gradle ビルドが現実的でない**ため、**EAS Build（クラウド）を主経路**とする。
- 情報源: Expo公式ドキュメント（`docs.expo.dev` のMarkdown版）、npmレジストリ実データ、unpkgで取得したパッケージ型定義。すべて確認日 2026-10-30。
- 制約: `web_search` / `web_fetch` がAPIキー未設定で利用できなかったため、Node.jsのHTTPSクライアントで上記一次情報URLを直接取得した。**推測は排除**し、確認できない事項は「未確認」と明記する。
- 注意: 本ドキュメントは**手順書のみ**。`eas.json` / `app.config.ts` 等の設定ファイルはLeadが作成する（本調査では作成していない）。

---

## 1. 前提（アカウント・ツール）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/build/setup.md
  - https://registry.npmjs.org/-/package/eas-cli/dist-tags
  - https://registry.npmjs.org/eas-cli/27.1.0
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json
- 確認できた事実:
  - **Expoアカウント**が必要。EAS Buildは無料プランでも利用可能（有料プランは並列ビルド数・優先度・タイムアウト上限などの違い）。作成先: https://expo.dev/signup
  - **EAS CLI の最新安定版は 27.1.0**（npm dist-tags: `latest: 27.1.0`）。EAS CLI 27.1.0 の `engines.node` は `^20.18.3 || >=22.0.0`。
  - 本プロジェクトの Node 要件は SDK 58 の **Node 22.13以上**（`expo` の engines。前回調査 `docs/research/library-api-notes.md` §1）。Node 22.22.0（本環境）は両方を満たす。
  - EAS CLI のインストールはグローバル（`npm install --global eas-cli`）または **`npx eas-cli@latest`** のどちらでもよい。公式ドキュメントは「`npx eas-cli@latest` を使う場合は、以降の `eas` をすべて `npx eas-cli@latest` に読み替える」としている。
  - Google Play へ**アップロード**するには Google Play Developer アカウント（初回 $25）が必要。ただし **APKのビルド・署名自体はアカウント不要**（「You can build and sign your app using EAS Build, but you can't upload it to the Google Play Store unless you have a membership」）。今回の「配布用APK共有」はPlayアカウント不要。
  - `android.package` が未設定の場合、EAS CLI が最初のビルド時に設定を促す（本プロジェクトは `jp.yoridorimidori.app` を `app.json` に設定済みであることが前提）。
- 未確認・不明点:
  - EAS無料プランの正確なビルド回数・同時実行数・キューの上限（公式の料金ページの詳細は本調査では未確認）。

---

## 2. 最短手順（クラウドで APK を作り、共有URL/APKを得る）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/build/setup.md （インストール・ログイン・設定・ビルド）
  - https://docs.expo.dev/build/eas-json.md
  - https://docs.expo.dev/build-reference/apk.md
  - https://docs.expo.dev/build/internal-distribution.md
  - https://docs.expo.dev/eas/cli.md （`eas init` / `eas project:info`）
- 確認できた事実（公式の標準手順）:
  - 初回は `eas build:configure` を実行してプロジェクトをEAS Build用に設定する。**`eas build` を未設定のまま実行しても、同じ初期化が自動で走る**（「eas build:configure (or **eas build**, which runs this same process if the project is not yet configured)」）。
  - ログインは `eas login`。ログイン確認は `eas whoami`。CIでは `EXPO_TOKEN` によるトークン認証も可能（ローカルビルドの節で公式が案内）。
  - EASプロジェクトの作成/リンクは **`eas init`**（正式名 `eas project:init`、エイリアス `eas init`）。既存プロジェクトへリンクする場合は `--id <projectId>`。
  - 現在のプロジェクト情報は **`eas project:info`** で確認できる（「Information about the current project.」）。
  - APKをビルドするには、`eas.json` のプロファイルで `android.buildType: "apk"` を指定するか、`distribution: "internal"` を指定する（internal指定時はAndroidの既定GradleコマンドがAPK生成に変わる）。
  - 実行コマンドは **`eas build -p android --profile preview`**（公式のAPK作成ページの記載どおり）。
  - 完了後、ビルド詳細ページのURL（または `eas build:run`）からAPKを取得できる。実機へはURLを開いてインストール、または `adb install path/to/file.apk`。エミュレータへは `eas build:run -p android --latest` で最新ビルドをダウンロード&インストールできる。
- **最短のコマンド列（3コマンド + 任意確認1）**:

  ```sh
  # 1) ログイン（初回のみ）
  npx eas-cli@latest login

  # （任意）ログイン確認
  npx eas-cli@latest whoami

  # 2) EASプロジェクトの作成/リンク（初回のみ。app config の差分はコミットする）
  npx eas-cli@latest init

  # 3) クラウドでAPKビルド（eas.json の preview プロファイル）
  npx eas-cli@latest build -p android --profile preview
  ```

  - 上記のうち必須は **login → init → build の3コマンド**（`whoami` は確認用）。`eas init` は `eas build` が未設定プロジェクトで自動実行する初期化と重複するが、**プロジェクトIDの確定とコミットのため明示実行を推奨**。
  - `eas.json` はLeadが先に作成しておく（§3）。無い場合 `eas build` が既定設定で自動生成するが、本プロジェクトの推奨値（APK/internal）にするため事前作成が確実。
- 未確認・不明点:
  - `eas init` が app config のどこにプロジェクトIDを書き込むか（`extra.eas.projectId` という記載は公式ドキュメントの app config リファレンスには見つからなかった）。**`eas init` 実行後に app config の差分を確認し、`eas project:info` の表示と照合してコミットする**運用にする（§10-4）。
  - 初回ビルド時のキュー待ち時間（プラン・時間帯依存。未確認）。

---

## 3. 推奨 `eas.json`（このプロジェクト用）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/build/eas-json.md
  - https://docs.expo.dev/eas/json.md （スキーマ）
  - https://docs.expo.dev/build-reference/apk.md
  - https://docs.expo.dev/build/internal-distribution.md
  - https://docs.expo.dev/build-reference/app-versions.md
- 確認できた事実（スキーマの意味）:
  - **`build.<profile>`**: ビルド設定の名前付きグループ。`--profile` 省略時は `production` が使われる（存在する場合）。
  - **`android.buildType`**: `"app-bundle"`（`:app:bundleRelease` → **.aab**）または `"apk"`（`:app:assembleRelease` → **.apk**）。**既定はAAB**（「The default file format used when building Android apps with EAS Build is an Android App Bundle (AAB)」）。`gradleCommand` や `developmentClient: true` があると上書きされる。
  - **`distribution`**: `"internal"`（ビルドURLを共有して端末に直接インストール可能。APK/IPAである必要あり）または `"store"`（ストア提出用。URL共有不可）。**内部配布ではAndroidの既定GradleコマンドがAPK生成に変わり、EASが新しいAndroid keystoreを生成（同じpackage nameのdevelopment buildがあれば再利用）**。
  - **`developmentClient: true`**: `expo-dev-client` が必要。Androidの`gradleCommand`を`:app:assembleDebug`にする。**本プロジェクトはExpo Go運用のため、`expo-dev-client`を入れていない限りdevelopmentプロファイルは使わない**（入れるとビルドが失敗する）。公式: 「For the build to be successful, the project must have expo-dev-client installed and configured.」
  - **`cli.appVersionSource`**: `"remote"`（EASサーバーが `android.versionCode` / `ios.buildNumber` を管理。**EAS CLI 12.0.0以降の推奨**）または `"local"`（プロジェクト側の値をそのまま使用）。`"remote"` のとき `production` に `autoIncrement: true` を置くとビルドごとにversionCodeを自動採番（初期値はapp configの値、未設定なら1から）。**既定値は公式ドキュメントに明記なし（未確認）→ 明示指定する**。
  - **`autoIncrement`**: 既定 `false`。Androidは `expo.android.versionCode` を、iOSは `expo.ios.buildNumber` をインクリメント。
  - **`cli.version`**: スキーマ例では `"version": "SEMVER_RANGE"` とだけ記載され、**意味・既定値の詳細は公式ドキュメントに明記されていない（未確認）**。推奨JSONでは省略する（必要になったら「プロジェクトが対応するEAS CLIのsemver範囲」として設定し、`npx eas-cli@latest` と整合させる）。
  - **`env`**: ビルド中の環境変数。公式注記: 「コミットしてよい値のみ。パスワードやsecretには使わない」。**`eas build` 実行時に app.config.js をローカル評価する際にも使われ、ビルドサーバー上でも設定される**。secretはEAS環境変数（Secret visibility）を使う。
  - `extends` でプロファイルを継承可能（最大5段、循環不可）。

- **推奨 `eas.json`（このプロジェクト用・最小構成）**:

  ```json
  {
    "cli": {
      "appVersionSource": "remote"
    },
    "build": {
      "preview": {
        "distribution": "internal",
        "android": {
          "buildType": "apk"
        }
      },
      "production": {
        "autoIncrement": true,
        "android": {
          "buildType": "app-bundle"
        }
      }
    }
  }
  ```

  - 使い分け: **`preview` = 配布用APK**（internal distribution。ストア不要・共有URLでインストール可）、**`production` = Play提出用AAB**（`autoIncrement` でversionCode自動採番）。
  - `development` プロファイルは `expo-dev-client` 導入時のみ追加する（`developmentClient: true` + `distribution: "internal"`）。
  - Google Maps APIキーを入れる場合は §4 の差分を追加する。
- 未確認・不明点:
  - `distribution` の既定値（スキーマに明記なし。プロファイルで明示するのが安全）。
  - `cli.version` の検証挙動（範囲外のEAS CLIでエラーになるのか警告か）は未確認。
  - `appVersionSource` の既定値（未確認。明示指定推奨）。

---

## 4. Google Maps API キーの注入（カスタムビルド時のみ）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/versions/latest/sdk/map-view.md （react-native-maps config plugin）
  - https://docs.expo.dev/workflow/configuration.md （app.config.ts / 動的設定 / process.env）
  - https://docs.expo.dev/build/eas-json.md （`env` と app.config.js の評価）
  - https://docs.expo.dev/guides/environment-variables.md （EXPO_PUBLIC_）
  - https://docs.expo.dev/eas/environment-variables.md （EAS環境変数）
  - 前回調査: `docs/research/library-api-notes.md` §3.5（Expo Goはキー不要 / カスタムビルドは必須 / キー無しは地図が空白）
- 確認できた事実:
  - **Expo Goではキー不要**。カスタムビルド（development build / 配布APK・AAB）では Android は Google Maps のみのため **Google Maps SDK for Android のAPIキーが必須**（前回調査で確定）。
  - react-native-maps の config plugin は `app.json`/app config の `plugins` に次の形で設定する:
    `["react-native-maps", { "androidGoogleMapsApiKey": "<KEY>" }]`（iOSは `iosGoogleMapsApiKey`）。
  - 公式の `app.config.js` 例では `process.env.MY_CUSTOM_PROJECT_VERSION` のように **`process.env` を動的設定で読める**（`app.config.ts` も公式サポート。`import { ExpoConfig, ConfigContext } from 'expo/config'`）。
  - `EXPO_PUBLIC_` 接頭辞の変数は `.env` から読み込まれ、**`process.env.EXPO_PUBLIC_[NAME]` という静的参照（ドット記法）でのみ** JSバンドルにインライン化される。`process.env['EXPO_PUBLIC_KEY']` や分割代入は不可。**`EXPO_PUBLIC_` はクライアントに平文で埋め込まれるため秘密情報を置かない**（公式明記）。
  - EAS Buildでは、`eas.json` のプロファイル `env` が **`eas build` 実行時の app.config.js ローカル評価に使われ、ビルドサーバー上でも設定される**。EAS環境変数（サービス）を使う場合はプロファイルに `"environment": "preview"` / `"production"` を指定して、その環境の変数セットをビルドに適用する。
- **差分手順（推奨）**:
  1. ローカル開発用: `.env.local`（git管理外）に
     `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<キー>` を置く。
  2. `app.config.ts` を作成（既存 `app.json` を読み込んで拡張する形）。config plugin に
     `androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` を渡す。
     公式の `app.config.ts` 基本形: `export default ({ config }: ConfigContext): ExpoConfig => ({ ...config, ... })`。
  3. クラウドビルド用: **EAS環境変数**として `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` を `preview`（および必要なら `production`）environment に Secret または Sensitive で登録し、`eas.json` の該当プロファイルに `"environment": "preview"` を追加する。
     - 登録例: `eas env:set --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value <KEY> --environment preview --visibility sensitive`
  4. キー自体は Google Cloud で **Maps SDK for Android を有効化**し、**Application restrictions = Android apps** で `jp.yoridorimidori.app` と **SHA-1証明書フィンガープリント**を登録する（前回調査の手順。development buildは debug keystore、Play配布時は Play App Signing のSHA-1）。
  5. `eas.json` の `preview`/`production` で再ビルドし、実機で地図タイルが出ることを確認（キー無し・誤りは地図が空白/グレー）。
  - 注意: 公式 map-view ドキュメントの app.json 例は `"process.env.YOUR_GOOGLE_MAPS_API_KEY"` という**文字列そのまま**を書いており、app.json（静的JSON）では環境変数展開されない。**動的に差し込むなら `app.config.ts`（または app.config.js）で `process.env` を読む**のが確実。
- **`app.config.ts` の型の注意（`@types/node` が無い環境）**:
  - 確認できた事実: Expo公式の型パッケージ `expo/types`（`expo@58.0.21/types/global.d.ts` 等）には **`process` の宣言が無い**。`expo/tsconfig.base` の `lib` は `["DOM", "ESNext"]` で、`process` はDOM libにも含まれない。SDK 58 のテンプレート `tsconfig.json` は `"extends": "expo/tsconfig.base"` のみ（`include`/`exclude` の追加なし）で、baseの exclude は `node_modules` / `babel.config.js` / `metro.config.js` / `jest.config.js` / `android` / `ios` のみ → **`app.config.ts` は `tsc --noEmit` の型チェック対象に入る**。
  - したがって `@types/node` が無いプロジェクトで `app.config.ts` に `process.env...` を書くと、**TypeScriptの型エラー（`Cannot find name 'process'`）になる可能性が高い**（型解決の一般論からの推定。公式ドキュメントにこの点の明記は無い＝**未確認**）。
  - 回避策（優先順）:
    1. **`app.config.js`（JavaScript）を使う** — 公式サポートされており、`allowJs: true` だが `checkJs` は既定offのため型エラーにならない（最も安全）。
    2. **`@types/node` を devDependency に追加**する（`process` の型が入る。プロジェクト全体にNode型が入る点に注意）。
    3. `app.config.ts` 内で型宣言を自前で足す（例: `declare const process: { env: Record<string, string | undefined> }`）。型のみで実行時影響なし。
  - **未確認**: Expo CLI は `app.config.ts` を「型チェックなしのトランスパイル」で読むため、`tsc` を通さない限りビルドは通る（`npx expo config` での確認を推奨）。この挙動は公式ドキュメントに明記なし。
- 未確認・不明点:
  - EAS環境変数（Secret）が **`app.config.ts` の評価時（prebuild前）に利用可能か**。EAS Buildの流れでは prebuild はビルドサーバー上で行われるため利用可能と解釈できるが、公式に明記なし（未確認）。確実にしたい場合は `eas.json` のプロファイル `env`（コミット可の値）を使う。
  - Google Maps APIキーを `EXPO_PUBLIC_` で扱う場合の制約（キーは最終的にAndroidManifestに埋め込まれるため秘匿性は無い。SHA-1/package制限が必須）。

---

## 5. 署名（EAS管理の既定動作）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/app-signing/managed-credentials.md
  - https://docs.expo.dev/build-reference/android-builds.md
  - https://docs.expo.dev/eas/json.md （`credentialsSource`）
- 確認できた事実:
  - `eas build` 実行時、資格情報が未作成なら**プロンプトで生成を促され、EASサーバー上に安全に保存**される。以降のビルドでは**同じ資格情報が再利用**される。Androidは「Generate new keystore」を選べば完了（keystoreはEASサーバーに安全に保存）。
  - `credentialsSource` は `local`（自前の `credentials.json` を使う）または `remote`（EAS管理。**既定オプション**）。**EAS管理（remote）なら `credentials.json` を自分で用意する必要はない**。Androidビルド時、EAS Buildが**プロジェクトルートの `credentials.json` を自動生成・注入**してGradleに署名設定を渡す（ユーザーが作るものではない）。
  - 資格情報の確認・変更は `eas credentials` で行える。
  - `--local`（ローカルビルド）の注意: EAS管理の資格情報を使う場合、ローカルビルド時に**EASサーバーから資格情報をダウンロード**する。ローカルのシークレット環境変数は別途自分で設定する必要がある（§6・§9）。
- 未確認・不明点:
  - EAS管理keystoreの実体・バックアップ手順の詳細（Play App Signing採用時の扱い）は未確認。Play配布する場合は「keystoreを失うとストア更新不可」の注意（公式に記載あり）→ Play App Signing有効化を推奨。

---

## 6. 配布: internal distribution（APK）と Play Store（AAB）の違い

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/build/internal-distribution.md
  - https://docs.expo.dev/build-reference/apk.md
  - https://docs.expo.dev/build/eas-json.md
  - https://docs.expo.dev/deploy/build-project.md
- 確認できた事実:
  - **internal distribution（`distribution: "internal"`）**: ビルドURLを共有すると、そのURLを持つ人が端末へ直接インストールできる。**URLは既定で誰でもアクセス可能（32文字UUID）**。プロジェクト設定「Unauthenticated access to internal builds」を無効にするとExpoアカウントのサインインが必要になる。**AndroidはAPKが必須**（AABはストア経由でしか配布できない）。内部配布では既定でAPKが生成され、EASが新規keystoreを生成/再利用する。
  - **Play Store（AAB）**: `android.buildType: "app-bundle"`（既定）。ストア提出用で、ビルドURLは共有できない。Google Play Developer アカウント（$25）とアップロード用の Google Service Account Key が必要（`eas submit` の `serviceAccountKeyPath` 等）。
  - **用途の使い分け（本プロジェクト）**: まずは **preview + APK** で実機配布（テスターにURL共有）。ストア提出段階になったら **production + AAB** に切り替える。
  - ビルドとアップロードは分離されている: EAS BuildはAPK/AABを作るところまで。Playへのアップロードは EAS Submit（またはPlay Console手動）。
- 未確認・不明点:
  - internal build URLの有効期限・保持期間（公式に明記なし。未確認）。
  - Play Console への手動アップロード手順の詳細（EAS Submitの手順は未調査）。

---

## 7. `expo-updates` を使わない構成（OTA不要・ビルドのみ）の注意点

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/eas-update/introduction.md
  - https://docs.expo.dev/build/eas-json.md （`channel` / `environment`）
- 確認できた事実:
  - EAS Updateは「**`expo-updates` ライブラリを使うプロジェクト向け**のクラウドサービス」。**`expo-updates` を入れていなければOTA更新は行われない**（EAS Updateの利用には `npx expo install expo-updates` が必要、と公式に明記）。
  - `eas.json` の `channel` はEAS Updateのチャンネル指定であり、`developmentClient: true` の場合は効果がない。**expo-updatesを使わないなら `channel` / `releaseChannel` は不要**。
  - `environment` はEAS環境変数のセット選択用であり、OTAの有無とは独立。Google MapsキーをEAS環境変数で渡す場合のみ必要。
  - `runtimeVersion` / `updates` 設定もexpo-updates用。expo-updatesを入れない構成では設定不要。
  - ビルド自体は `expo-updates` が無くてもEAS Buildで問題なく作成できる（EAS BuildはAPK/AABを作るサービス。EAS Updateとは独立）。
- 未確認・不明点:
  - `expo-updates` を将来導入する場合の `channel`/`runtimeVersion` の設定パターン（今回は対象外・未確認）。
  - expo-updates無しのバイナリに対するEAS Updateの安全性/挙動（そもそも更新取得コードが無い）は未確認。

---

## 8. ローカルビルド（`eas build --local`）がこの環境で使えない理由

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/build-reference/local-builds.md
  - サンドボックス実測: `docs/environment-report.md`（子プロセスパイプ拒否・npmキャッシュEPERM・Android SDK書込不可）
- 確認できた事実:
  - `eas build --local` は**macOS/Linuxが公式サポート対象**。公式ドキュメントに「**On Windows, you can use WSL for local EAS Builds. However, we do not officially test against this platform and do not support Windows for local builds (macOS and Linux are supported).**」と明記。
  - ローカルビルドの前提: Node.jsとパッケージマネージャ、**Android SDK / NDK**、JDK等がローカルに必要（EASサーバーが用意してくれるツールを自分で揃える）。`node`/`yarn`/`fastlane`/`cocoapods`/`ndk`/`image` などのeas.jsonフィールドはローカルでは無視される。キャッシュ不可。EAS環境変数のSecret visibilityはローカルでは非対応（自分の環境変数で設定する）。
  - 本環境（Windows + サンドボックス）では、**Windows非対応（公式）**に加え、**子プロセスパイプ付き実行の拒否・npmキャッシュ書込制限・Android SDKが読み取り専用**という制約（environment-report）があるため、**`eas build --local` もローカルGradleビルドも現実的でない**。
  - 代替（公式に用意されている経路）: **EAS Buildクラウド**（本手順書の主経路）、**EAS Workflows**（`eas workflow:run` / pushトリガーのCI）、**GitHub Actions等のCIで `eas-cli` を実行**（`https://docs.expo.dev/build/building-on-ci.md`）。CIでは `EXPO_TOKEN` によるトークン認証が使える（公式：`eas login` の代替）。
- 未確認・不明点:
  - 本サンドボックス内で `npx eas-cli@latest` 自体が正常起動できるか（npmキャッシュ・子プロセス制約の影響）は**未検証**。**EAS CLIはサンドボックス外の通常のWindows PCで実行する**運用を推奨。
  - WSL2上での `eas build --local` の可否（公式に「サポート外」とされているため未検証）。

---

## 9. トラブルシュート（Windows / 本環境）

- 確認日: 2026-10-30
- 情報源URL: 上記各節のURL、https://docs.expo.dev/build-reference/limitations.md
- 確認できた事実・対処:
  1. **`eas: command not found` / npxが遅い**: グローバルインストールの代わりに `npx eas-cli@latest ...` を一貫して使う（公式の代替手段）。初回はnpmレジストリからの取得が必要（ネットワーク必須）。
  2. **未ログイン/トークン**: `eas login` または `EXPO_TOKEN` 環境変数（CI）。`eas whoami` で確認。
  3. **`eas.json` が無い/プロファイル名が違う**: `eas build` は未設定だと初期化を自動実行するが、本プロジェクトの推奨設定と異なる既定が生成される。**Leadが作成した `eas.json` の `preview` プロファイルを使う**。`--profile` 省略時は `production` になる点に注意。
  4. **`android.package` 未設定**: EAS CLIがビルド時に設定を促す。`jp.yoridorimidori.app` を設定しておく（前回の環境/要件定義で確定済み）。
  5. **地図が真っ白/グレー**: AndroidのGoogle Maps APIキー未設定・誤り・制限不一致（SHA-1/package name）。Expo Goではキー不要だがカスタムAPKでは必須（前回調査 §3.5）。EAS管理keystoreのSHA-1は Expo dashboard > Credentials > Application Identifiers > Android Keystore で確認する手順が公式にある（初回ビルド後）。
  6. **Google Mapsキーのビルド時注入で失敗**: `app.config.ts` の `process.env` が未定義（`@types/node` 無しの型エラー or 環境変数未設定）。`npx expo config --type public` で最終configを確認し、キーが plugin に渡っているか検証する。
  7. **ローカルビルドが失敗**: Windows公式非対応（WSLもサポート外）。`eas build --local` を諦め、クラウドビルドにする。
  8. **サンドボックス内で `npx eas-cli` が失敗**: 本環境の制約（子プロセスパイプ拒否・npmキャッシュEPERM）が原因の可能性。サンドボックス外の通常PCで実行する（未検証）。
  9. **iOSは対象外**: 本プロトタイプはAndroid先行。iOSの署名はApple Developer Program（$99）が必要で、今回のスコープ外。
- 未確認・不明点:
  - EAS Buildの失敗時のログの読み方・既知の制限（limitationsページ）の詳細は未確認。

---

## 10. 未確認事項一覧

1. **`cli.version` の厳密な意味・既定値・違反時の挙動**（公式スキーマは `SEMVER_RANGE` のプレースホルダのみ）→ 推奨JSONでは省略。
2. **`cli.appVersionSource` の既定値**（明記なし）→ `"remote"` を明示。
3. **`distribution` の既定値**（スキーマに明記なし）→ プロファイルで明示。
4. **`eas init` が `extra.eas.projectId` にプロジェクトIDを書き込むか**（公式app configリファレンスに該当記載なし）。実行後に app config 差分と `eas project:info` を確認してコミットする。
5. **`eas init` / `eas build` の実挙動**（本サンドボックスでは実行できないため未検証。ネットワーク・認証が必要）。
6. **本サンドボックスで `npx eas-cli@latest` が起動できるか**（npmキャッシュ・子プロセス制約の影響）→ 未検証。通常PCで実行推奨。
7. **EAS無料プランのビルド回数・同時実行・キューの正確な上限**（料金ページ詳細は未確認）。
8. **`app.config.ts` + `process.env` の型解決**（`@types/node` 無し時の挙動）は公式ドキュメントに明記なし。tsconfigのinclude/excludeからの推定で「型エラーになる可能性が高い」→ `app.config.js` または `@types/node` 追加で回避。
9. **EAS環境変数（Secret/Sensitive）が `app.config.ts` 評価時に利用可能か**（ビルドサーバー上のprebuild前）。明記がないため、確実にしたい場合は `eas.json` のプロファイル `env` を使う。
10. **internal distribution build URLの保持期間・有効期限**（未確認）。
11. **Play Consoleへの手動アップロード手順とEAS Submitの詳細**（今回のスコープ外・未調査）。
12. **Expo Go 58 と配布APKの共存/バージョン差異**（Expo Goは開発用、APKは本番相当。同じ端末に両方入れられるが扱いは別。未確認）。

---

## 11. 情報源一覧（すべて 2026-10-30 取得）

| 情報源 | URL | 確認した内容 |
| --- | --- | --- |
| EAS Build はじめに | https://docs.expo.dev/build/introduction.md | EAS Buildの概要 |
| 初回ビルド手順 | https://docs.expo.dev/build/setup.md | Expoアカウント、EAS CLIインストール、login、configure、build、署名、料金 |
| eas.json 設定 | https://docs.expo.dev/build/eas-json.md | プロファイル、`env`、`extends`、スキーマ例 |
| eas.json リファレンス | https://docs.expo.dev/eas/json.md | `distribution`/`buildType`/`credentialsSource`/`autoIncrement`/`environment` の意味 |
| Android APK ビルド | https://docs.expo.dev/build-reference/apk.md | APK生成の条件、`buildType: apk`、インストール方法、`eas build:run` |
| Internal distribution | https://docs.expo.dev/build/internal-distribution.md | internalの効果（APK生成・keystore生成・URL共有）、配布機構 |
| EAS管理資格情報 | https://docs.expo.dev/app-signing/managed-credentials.md | keystore自動生成・EASサーバー保存・再利用、`eas credentials` |
| Androidビルドプロセス | https://docs.expo.dev/build-reference/android-builds.md | 既定Gradleコマンド、keystore/credentials.jsonの自動生成 |
| ローカルビルド | https://docs.expo.dev/build-reference/local-builds.md | `eas build --local` の前提・制限、**Windows非対応**（WSLはサポート外） |
| アプリバージョン管理 | https://docs.expo.dev/build-reference/app-versions.md | `appVersionSource` のremote/local、`autoIncrement` |
| 動的設定 | https://docs.expo.dev/workflow/configuration.md | app.config.ts / process.env / 解決規則 / TypeScriptサポート |
| Expo環境変数 | https://docs.expo.dev/guides/environment-variables.md | `EXPO_PUBLIC_` の読み込み・インライン化・秘密情報禁止 |
| EAS環境変数 | https://docs.expo.dev/eas/environment-variables.md | environment（development/preview/production）、visibility、`eas env:set` |
| ストア向けビルド | https://docs.expo.dev/deploy/build-project.md | productionビルド（AAB既定）、ストアアカウント要件 |
| EAS Update概要 | https://docs.expo.dev/eas-update/introduction.md | expo-updatesが無いとEAS Updateは使えない |
| EAS CLIリファレンス | https://docs.expo.dev/eas/cli.md | `eas init`/`project:init`/`project:info`/`build:configure`/`build:run` |
| react-native-maps(Expo) | https://docs.expo.dev/versions/latest/sdk/map-view.md | config pluginの `androidGoogleMapsApiKey`、Google Mapsキー手順 |
| npm eas-cli | https://registry.npmjs.org/-/package/eas-cli/dist-tags / https://registry.npmjs.org/eas-cli/27.1.0 | 最新安定版 27.1.0、Node engines |
| Expo SDK 58 / 型 | https://unpkg.com/expo@58.0.21/tsconfig.base.json / https://unpkg.com/expo@58.0.21/types/global.d.ts / https://unpkg.com/expo-template-blank-typescript@58.0.30/tsconfig.json | tsconfigのlib/exclude、expo/typesにprocess宣言が無いこと、テンプレート構成 |
| サンドボックス制約 | `docs/environment-report.md`（本プロジェクト内の実測レポート） | 子プロセスパイプ拒否・npmキャッシュEPERM・Android SDK書込不可 |

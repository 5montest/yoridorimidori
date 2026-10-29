# 寄鳥美鳥地 スマホ向けナビプロトタイプ — ライブラリAPI調査ノート

- 調査日: **2026-10-30**（Asia/Tokyo）
- 対象: React Native + Expo + TypeScript（Android先行）ナビプロトタイプ
- 担当: 技術調査（researcher）
- 目的: 設計原則「**未確認のライブラリAPIを想像で実装しない**」に従い、実装前にAPI仕様・必須設定・制約を公式一次情報のみで確定させる。

---

## 0. 調査方法・凡例（最初に読むこと）

- **確認日**: すべて 2026-10-30。
- **情報源の優先順位**（すべて一次情報）:
  1. Expo公式ドキュメント `docs.expo.dev`（`/versions/latest/` = SDK 58 のリファレンス）
  2. npmレジストリ `registry.npmjs.org` の実データ（dist-tags / 各バージョンの package.json）
  3. npm公開パッケージ内の**型定義ファイル（.d.ts）と同梱モック**（unpkg経由。パッケージの中身そのもの＝一次情報）
  4. `react-native-maps` の GitHub リポジトリ（README / docs/*.md）
  5. Expo公式 versions API（`exp.host/--/api/v2/versions`）
- **本セッションの制約**: `web_search` / `web_fetch` ツールは API キー未設定のため利用できなかった。代替として Node.js の HTTPS クライアントで上記の一次情報URLを直接取得した（取得対象・内容は同じ一次情報）。将来 web_search が使える環境でも、本ノートのURLを直接再取得すれば照合可能。
- **「未確認」の定義**: 公式一次情報で確認できなかった事項。**推測で埋めていない**。実装前に追加確認が必要なものは §10 に一覧化した。
- 本文中の「〜系」は npm 実バージョンとの差を吸収する表現（例: RN 0.88系 = 実ピン 0.88.1）。

---

## 1. Expo SDK の最新安定版と要求バージョン（2026-10-30時点）

### 1.1 結論

- **最新安定版は Expo SDK 58**。npm `expo` の `latest` は **58.0.21**。
- SDK 58 が要求する主要バージョン（実ピン）: **React Native 0.88.1 / React 19.3.0 / TypeScript ~6.0.3 / @types/react ~19.3.0**。
- ツール要件: **Node.js 22.13以上（22系）/24.3以上（24系）/26以上**（奇数系23・25は非対応）。
- 対応OS: **Android 7以上（compileSdk 37 / targetSdk 36）、iOS 16.4以上（Xcode 26.4以上）**。
- SDK 58 のリリース日は **2026-10-15**（公式changelog）。

### 1.2 根拠

- 確認日: 2026-10-30
- 情報源URL:
  - https://registry.npmjs.org/-/package/expo/dist-tags
  - https://registry.npmjs.org/expo/58.0.21 （package.json の engines/peerDependencies）
  - https://registry.npmjs.org/expo-template-blank-typescript/latest
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json
  - https://docs.expo.dev/versions/latest/ （「Each Expo SDK version depends on a React Native version」表）
  - https://expo.dev/changelog/sdk-58
  - https://exp.host/--/api/v2/versions （sdkVersions["58.0.0"]）
- 確認できた事実:
  - npm dist-tags（2026-10-30取得）: `latest: 58.0.21`、`sdk-57: 57.0.31`、`sdk-56: 56.0.24`、`next: 58.0.11`、`canary: 58.0.0-canary-20260909-ea7a89a`。**`sdk-58` という dist-tag はまだ存在しない**（`latest` が58系である状態）。
  - `expo@58.0.21` の `engines.node` = `^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0`。
  - `expo-template-blank-typescript@58.0.30`（SDK 58の公式テンプレート）の依存: `expo ~58.0.21`, `react 19.3.0`, `react-native 0.88.1`, `expo-status-bar ~58.0.4`、dev: `typescript ~6.0.3`, `@types/react ~19.3.0`。
  - Expo公式ドキュメントの対応表: `58.0.0 → React Native 0.88 / React 19.3.0 / React Native Web 0.21.0 / 最小Node 22.13.x`、`Android 7+ / compileSdkVersion 37 / targetSdkVersion 36 / iOS 16.4+ / Xcode 26.4+`。
  - versions API `sdkVersions["58.0.0"]`: `expoVersion ~58.0.21`、`facebookReactNativeVersion 0.88.1`、`facebookReactVersion 19.3.0`、`relatedPackages.jest ~30.5.2`、`relatedPackages.typescript ~6.0.3`、`relatedPackages['@types/jest'] 30.0.0`。
  - changelog（2026-10-15）: 「SDK 58 is built for iOS 27 and includes React Native 0.88.」
- `npx expo install` が SDK 58 プロジェクトで選ぶ実バージョン（`bundledNativeModules.json` より）:
  - `expo-location ~58.0.20` / `react-native-maps 1.29.11` / `jest-expo ~58.0.13` / `expo-sensors ~58.0.4` / `@react-native-async-storage/async-storage 2.2.0` / `expo-sqlite ~58.0.14` / `expo-maps ~58.0.11` / `expo-dev-client ~58.0.17` / `expo-task-manager ~58.0.12` / `react-native 0.88.1` / `react 19.3.0`
  - 全124エントリ。

### 1.3 Expo Go の SDK 58 対応状況（重要・移行期）

- 確認日: 2026-10-30
- 情報源URL:
  - https://expo.dev/changelog/sdk-58 （「Expo Go」節）
  - https://docs.expo.dev/troubleshooting/expo-go-version-mismatch.md
  - https://exp.host/--/api/v2/versions
- 確認できた事実:
  - changelog（リリース当時）: 「Expo Go for SDK 58 … will be released within a few weeks. Until then, `npx create-expo-app` creates SDK 57 projects. To start a new SDK 58 project, run `npx create-expo-app --template default@sdk-58` and use a development build. The new Expo Go will support **only SDK 58**.」
  - トラブルシューティング公式ページ: 「**Expo Go on the Apple App Store stops at SDK 54**, and SDK 55 and later are not available there. **The Google Play version can also lag behind a new SDK release.**」→ ずれている場合は `expo.dev/go` でSDKバージョンを指定して互換ビルドを入手するか、development build を使う。
  - versions API（2026-10-30取得）: トップレベルの `expoGoSdkVersion` は **57.0.0**。一方 `sdkVersions["58.0.0"]` には Androidクライアント `58.0.5`（APK URL）と iOSクライアント `58.0.7` の配布URLが存在する。
  - つまり現時点は **「SDK 58用のExpo Goビルドは配布済みだが、ストア/既定のExpo Goはまだ57」という移行期**。
- 未確認・不明点:
  - 2026-10-30 時点で **Google Play / App Store の Expo Go が SDK 58 になっているか**（公式ドキュメントに明記なし。`expoGoSdkVersion=57.0.0` が何を指すかの厳密な定義も未確認）。
  - 2026-10-30 時点で `npx create-expo-app` がデフォルトで SDK 57/58 のどちらを作るか（changelog時点では57。現時点は未確認）。
  - → **実機セットアップ時に最初に `expo --version` / Expo Go のバージョン / `expo.dev/go` の表示を確認する**こと。SDK 58 を使うなら Expo Go は `expo.dev/go` からSDK 58版（Android APK 58.0.5）を入れる運用が確実（公式に案内されている手段）。

### 1.4 SDK 57 フォールバック（Expo Goストア版を使いたい場合の参考値）

- 確認日: 2026-10-30
- 情報源URL: https://unpkg.com/expo@57.0.31/bundledNativeModules.json 、https://exp.host/--/api/v2/versions
- 確認できた事実（SDK 57の実ピン）: `expo ~57.0.31` / `react-native 0.86.3` / `react 19.2.3` / `expo-location ~57.0.22` / `react-native-maps 1.27.2` / `jest-expo ~57.0.6` / `expo-sensors ~57.0.3` / `@react-native-async-storage/async-storage 2.2.0` / `expo-sqlite ~57.0.4` / Expo Goクライアント 57.0.9。

---

## 2. expo-location

### 2.1 バージョン・対応SDK・プラットフォーム・Expo Go

- 確認日: 2026-10-30
- 情報源URL:
  - https://registry.npmjs.org/-/package/expo-location/dist-tags
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json
  - https://docs.expo.dev/versions/latest/sdk/location.md （frontmatter / 冒頭 / Permissions節）
- 確認できた事実:
  - npm `latest` = **58.0.20**。SDK 58 の Expo 推奨 = **~58.0.20**（ドキュメントの「Recommended version」も同じ）。SDK 57 向けは 57.0.22。
  - 対応プラットフォーム（公式ドキュメントのfrontmatter）: `android`, `ios`, `web`, `expo-go`。ページ冒頭表記は「**Android, iOS, Web, Included in Expo Go**」。
  - インストール: `npx expo install expo-location`（yarn/pnpm/bun も同様）。
- 未確認・不明点:
  - Expo Go に同梱されている expo-location の実バージョン（公式に明記なし。`npx expo install` が入れるのは 58.0.20）。

### 2.2 インストール後の設定（app.json / config plugin / Android権限）

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/location.md （Configuration in app config / Configurable properties / Permissions）
- 確認できた事実:
  - config plugin あり。`app.json` の `expo.plugins` に `["expo-location", { ... }]` の形で設定する（CNG＝prebuild/EAS Build 前提。Expo Go の動作には不要）。
  - 設定可能プロパティ（公式表のとおり）:
    - `locationAlwaysAndWhenInUsePermission`（iOS。`NSLocationAlwaysAndWhenInUseUsageDescription` の文言。既定 `"Allow $(PRODUCT_NAME) to use your location"`）
    - `locationWhenInUsePermission`（iOS。`NSLocationWhenInUseUsageDescription`）
    - `locationAlwaysPermission`（iOS・非推奨。`NSLocationAlwaysUsageDescription`）
    - `motionUsagePermission`（iOS。`NSMotionUsageDescription`）
    - `isIosBackgroundLocationEnabled`（既定 false。iOSの `UIBackgroundModes` に `location` を追加）
    - `isAndroidBackgroundLocationEnabled`（既定 false。`ACCESS_BACKGROUND_LOCATION` を追加）
    - `isAndroidForegroundServiceEnabled`（`FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION`。`isAndroidBackgroundLocationEnabled` が true なら既定 true）
    - `androidForegroundServiceIcon`（前景サービス通知アイコン。96x96の白一色PNG推奨）
  - **Android 権限はモジュール導入で自動追加**される（config plugin に個別指定は不要）:
    - 必須: `ACCESS_COARSE_LOCATION`（概算位置）、`ACCESS_FINE_LOCATION`（高精度位置）
    - 任意: `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION`（Android 14以降の前景サービス位置情報）、`ACCESS_BACKGROUND_LOCATION`（背景位置）
    - 除外も可能だが「必須権限を除外すると該当機能が壊れる」と明記。
  - iOS の usage description キー（`NSLocationWhenInUseUsageDescription` 等）は config plugin が生成。ネイティブプロジェクト手編集時は Info.plist に手動追加が必要。
  - **高精度GPSに必要な設定（Android）**:
    - 高精度取得には `ACCESS_FINE_LOCATION` が必要（上記のとおり自動追加）。
    - 「高精度ロケーションモード」をユーザーにONしてもらうAPIとして `Location.enableNetworkProviderAsync()`（Androidのみ）がある。Android 11未満はシステム設定画面への誘導、等はドキュメントに記載あり（後述 §2.3）。
    - `getCurrentPositionAsync` の `LocationOptions.mayShowUserSettingsDialog`（Androidのみ、既定 true）は「Wi-Fi/セル/ GPS を使う高精度モードをONにするか尋ねる」設定。
    - エミュレータでは Settings > Location で「Use location」をON、位置が取れない場合は「Google Location Accuracy（Improve Location Accuracy）」をOFFにしてGPSのみにする手順が公式に記載（Android 12以上 / 11以下でメニュー位置が異なる）。
- 未確認・不明点:
  - app.json の `android.permissions` に明示しなくても自動マージされる、という理解は公式の記述どおりだが、**Expo Go アプリ内でプロジェクト側の権限設定がどう扱われるか**は未確認（Expo Go はExpo Go自身のManifestで動くため）。
  - `enableNetworkProviderAsync()` を呼ぶべきタイミング（起動時/取得失敗時）の公式推奨は未確認。

### 2.3 位置取得API（シグネチャ確定）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/versions/latest/sdk/location.md （Methods / Types / Enums）
  - https://unpkg.com/expo-location@58.0.20/build/Location.d.ts （実型定義）
  - https://unpkg.com/expo-location@58.0.20/build/Location.types.d.ts
  - https://unpkg.com/expo-location@58.0.20/build/index.d.ts
- 確認できた事実（型定義から確定。`import * as Location from 'expo-location'`）:
  - `Location.getCurrentPositionAsync(options?: LocationOptions): Promise<LocationObject>`
    - 単発取得。`options` は省略可。ドキュメント注記: 位置フィックスに数秒かかることがある。即答性が必要で高精度不要なら `getLastKnownPositionAsync` を検討、と明記。
  - `Location.watchPositionAsync(options: LocationOptions, callback: LocationCallback, errorHandler?: LocationErrorCallback): Promise<LocationSubscription>`
    - **`options` は必須**（省略不可）。`callback` は `(location: LocationObject) => any`。`errorHandler` は `(reason: string) => void`。戻り値は `remove(): void` を持つ `LocationSubscription`。
    - 「アプリがフォアグラウンドの間のみ更新」。背景更新は `startLocationUpdatesAsync`（TaskManager）を使う、と明記。
  - `Location.getLastKnownPositionAsync(options?: LocationLastKnownOptions): Promise<LocationObject | null>`
    - 直近の既知位置。`null` は「無い」または「maxAge / requiredAccuracy 条件を満たさない」。速いが古い可能性あり、と明記。
  - 周辺API（実装前の事前チェックに有用）:
    - `Location.requestForegroundPermissionsAsync(): Promise<LocationPermissionResponse>`
    - `Location.getForegroundPermissionsAsync(): Promise<LocationPermissionResponse>`
    - `Location.useForegroundPermissions(options?)` → `[LocationPermissionResponse | null, request, get]` のタプル（Reactフック）
    - `Location.hasServicesEnabledAsync(): Promise<boolean>`（位置情報サービス自体のON/OFF）
    - `Location.getProviderStatusAsync(): Promise<LocationProviderStatus>`（`locationServicesEnabled`, `gpsAvailable?`, `networkAvailable?`, `passiveAvailable?`, `backgroundModeEnabled`）
    - `Location.enableNetworkProviderAsync(): Promise<void>`（Androidのみ。高精度モードONのダイアログ。拒否でreject）
    - `Location.installWebGeolocationPolyfill(): void`（Webで `navigator.geolocation` をポリフィル）
  - `LocationSubscription` = `{ remove: () => void }`（watch系の解除に必須。`remove()` を呼ばないと購読が残る）。
- 未確認・不明点:
  - `watchPositionAsync` の `timeInterval` / `distanceInterval` の実機での最小有効値（「Default value may depend on accuracy option」としか書かれていない）。
  - `getCurrentPositionAsync` のタイムアウトはAPIに無い（自前で `Promise.race` 等が必要か）→ 公式に記載なし＝未確認。

### 2.4 戻り値の型（正確なフィールドと意味）

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/location.md （Types節） / https://unpkg.com/expo-location@58.0.20/build/Location.types.d.ts
- 確認できた事実:
  - `LocationObject`:
    - `coords: LocationObjectCoords`
    - `timestamp: number` — **ミリ秒（Unix epoch ms）**
    - `mocked?: boolean` — Android/iOSのみ。Androidはモックプロバイダ由来、iOSはXcode等のシミュレーション時に true
  - `LocationObjectCoords`:
    - `latitude: number`（度）
    - `longitude: number`（度）
    - `altitude: number | null`（WGS84楕円体基準のメートル。Webで無い場合null）
    - `accuracy: number | null` — **半径（メートル）の不確かさ**。値が小さいほど高精度。Webで無い場合null
    - `altitudeAccuracy: number | null`（メートル。Webで無い場合null）
    - `heading: number | null` — **「進行方向（travel direction）」**。真北から時計回りの度。**コンパス方位ではない**（重要）
    - `speed: number | null`（m/s。Webで無い場合null）
  - `LocationOptions`（`getCurrentPositionAsync` / `watchPositionAsync` 共通）:
    - `accuracy?: LocationAccuracy` — 既定 `LocationAccuracy.Balanced`（=100m）
    - `mayShowUserSettingsDialog?: boolean` — Androidのみ、既定 true
    - `timeInterval?: number` — Androidのみ、最小更新間隔(ms)
    - `distanceInterval?: number` — 更新する最小距離(m)
  - `LocationLastKnownOptions`:
    - `maxAge?: number`（ms。これより古いと null）
    - `requiredAccuracy?: number`（m。これより精度が悪い＝半径が大きいと null）
  - `LocationPermissionResponse` = `PermissionResponse & { ios?: PermissionDetailsLocationIOS; android?: PermissionDetailsLocationAndroid }`:
    - `PermissionResponse`: `granted: boolean`, `status: 'granted' | 'denied' | 'undetermined'`, `canAskAgain: boolean`, `expires: 'never' | number`
    - `android?: { accuracy: 'fine' | 'coarse' | 'none' }`
    - `ios?: { scope: 'whenInUse' | 'always' | 'none'; accuracy: 'full' | 'reduced' }`（`accuracy` はiOS14+。14未満は常に `'full'`）
- 未確認・不明点:
  - `coords.accuracy` の統計的定義（68%信頼半径か等）は公式ドキュメントに明記なし。Android/iOSのプラットフォーム定義に従う（未確認）。

### 2.5 精度: Accuracy 列挙型

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/location.md （Enums > Accuracy） / https://unpkg.com/expo-location@58.0.20/build/Location.types.d.ts
- 確認できた事実:
  - 実型は `LocationAccuracy` だが、**`Accuracy` という別名でもexportされている**（`index.d.ts`: `export { LocationAccuracy as Accuracy, ... }`）。`import { Accuracy } from 'expo-location'` も `Location.Accuracy` も可。
  - 値と意味:

    | メンバー | 値 | 意味（公式の説明） |
    | --- | --- | --- |
    | `Accuracy.Lowest` | 1 | 約3km精度 |
    | `Accuracy.Low` | 2 | 約1km精度 |
    | `Accuracy.Balanced` | 3 | 約100m以内（**既定値**） |
    | `Accuracy.High` | 4 | 目標から約10m以内 |
    | `Accuracy.Highest` | 5 | 利用可能な最高精度 |
    | `Accuracy.BestForNavigation` | 6 | ナビゲーションアプリ向けの最高精度（追加センサーデータを利用） |

  - `LocationOptions.accuracy` の既定は `LocationAccuracy.Balanced`（=3）。
- 未確認・不明点:
  - `Highest` と `BestForNavigation` のAndroid/iOS実装差（GPS有効化ポリシー等）はドキュメントに記載なし＝未確認。
  - ナビ用途で `BestForNavigation` を指定した場合のバッテリー影響の定量値は未確認。

### 2.6 方位（コンパス heading）

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/location.md （`Location.getHeadingAsync`, `Location.watchHeadingAsync`, `LocationHeadingObject`） / https://unpkg.com/expo-location@58.0.20/build/Location.d.ts
- 確認できた事実:
  - `Location.getHeadingAsync(): Promise<LocationHeadingObject>`
    - 内部で `watchHeadingAsync` を呼び、数回の更新を待って「十分に正確」なものを1つ返す、と明記。
  - `Location.watchHeadingAsync(callback: LocationHeadingCallback, errorHandler?: LocationErrorCallback): Promise<LocationSubscription>`
    - 対応プラットフォームは **Android / iOS のみ（Web非対応）**（型定義の `@platform android @platform ios`）。
    - `callback` は `(location: LocationHeadingObject) => any`。
  - `LocationHeadingObject` のフィールド（**正確な名前はこれ**）:
    - `trueHeading: number` — 真北からの度。**位置情報の権限が必要。権限が無い場合は `-1` を返す**（公式明記）。
    - `magHeading: number` — 磁北からの度。
    - `accuracy: number` — **コンパスの校正レベル（0〜3の数値）**:
      - `3`: high accuracy（高精度）
      - `2`: medium accuracy（中精度）
      - `1`: low accuracy（低精度）
      - `0`: none（校正されていない）
      - iOSの参考値: `3` = 不確かさ20度未満、`2` = 35度未満、`1` = 50度未満、`0` = 50度超。
      - **型は数値（number）であり列挙型ではない**。
  - `coords.heading`（§2.4）は「進行方向」であり、コンパス方位ではない。方位に使うのは `LocationHeadingObject` 側。
- 未確認・不明点:
  - `watchHeadingAsync` のAndroid実装がどのセンサー（回転ベクトル/磁気センサー合成）を使うかはドキュメントに記載なし＝未確認。
  - `trueHeading` が `-1` になる条件の詳細（位置権限が「拒否」の場合のみか、「未要求」でも-1か）は未確認。
  - Webで方位を取る公式手段（`watchHeadingAsync` はWeb非対応）は未確認。

### 2.7 Expo Go / development build の可否

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/location.md （frontmatter、Background location節、Permissions > Android）
- 確認できた事実:
  - ページは **「Included in Expo Go」**（Android/iOS/Web対応）と明記。
  - ただし:
    - **背景位置情報（background location）は iOS では Expo Go 非対応**。「You must use a development build to use background location since it is not supported in the Expo Go app.」と明記。
    - AndroidのPermissions節に「**Foreground and background services are not available in Expo Go for Android.** Instead, we recommend using a development build to avoid limitations.」という注意書きがある。
  - したがって、**プロトタイプで使う「前景の単発取得（getCurrentPositionAsync）」「前景watch（watchPositionAsync）」「方位（getHeadingAsync/watchHeadingAsync）」は Expo Go の対象**と読める（提供機能一覧にExpo Goが含まれるため）。背景位置・ジオフェンス・前景サービスは development build 前提。
- 未確認・不明点:
  - 上記Androidの注意書きが「前景サービス（Foreground Service）全般」を指すのか「背景位置用の前景サービス」を指すのか、文言だけでは一意でない。**前景取得自体がExpo Goで問題なく動くかは実機で確認するのが安全**（未確認）。
  - Expo Goの版によっては位置権限の許可ダイアログの文言・挙動が異なる可能性（未確認）。

### 2.8 Jestでのモック（公式な方法の有無）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/modules/mocking.md
  - https://docs.expo.dev/develop/unit-testing.md
  - https://unpkg.com/expo-location@58.0.20/mocks/ExpoLocation.ts （パッケージ同梱モックの実物）
  - https://unpkg.com/jest-expo@58.0.13/src/preset/moduleMocks/expoModules.js
- 確認できた事実:
  - **expo-location専用の公式モック手順ページは存在しない**（`llms.txt` のドキュメント一覧および unit-testing / mocking の両ページを確認した範囲）。公式にあるのは「Expoモジュール一般のモックの仕組み」の説明。
  - 公式の仕組み（`mocking.md`）: Expo SDKの各パッケージは `mocks/` ディレクトリにネイティブモジュールのモックを同梱でき、**`jest-expo` preset が `requireNativeModule` 呼び出し時に自動でそれを返す**。
  - expo-location@58.0.20 の実物: `mocks/ExpoLocation.ts` が存在し、全メソッドが **`export async function ...(): Promise<any> {}` の空実装**（`getCurrentPositionAsync`, `getLastKnownPositionAsync`, `watchPositionImplAsync`, `watchDeviceHeading`, `requestForegroundPermissionsAsync` などを網羅）。→ **テストで import しても落ちないが、戻り値は `undefined`**。
  - jest-expo@58.0.13 の `src/preset/moduleMocks/expoModules.js` に `ExpoLocation` のメソッド一覧（`getCurrentPositionAsync` argumentsCount:1、`requestForegroundPermissionsAsync` argumentsCount:0 等）が含まれることを確認。
  - 実データを返すテストにするには、公式の一般手段である **`jest.mock('expo-location', () => ({...}))` または `__mocks__/expo-location.ts` の設置**が必要（`mocking.md` の「you can also mock any JS code yourself using built-in Jest APIs」）。戻り値は §2.4 の型に合わせて自前で用意する。
- 未確認・不明点:
  - expo-location の「現実的な値を返す公式モックデータ」は提供されていない（空実装のみ）＝**モックデータは自作が必要**。
  - `jest-expo` が expo-location の `mocks/ExpoLocation.ts` を実際に自動適用するかは、presetの仕様記述とモックファイルの存在からの推定であり、**動作は要検証**（未確認。テストを1本書いて `getCurrentPositionAsync` の戻り値を確認するのが確実）。

---

## 3. react-native-maps

### 3.1 バージョン・Expo対応・Expo Go

- 確認日: 2026-10-30
- 情報源URL:
  - https://registry.npmjs.org/-/package/react-native-maps/dist-tags
  - https://unpkg.com/react-native-maps@1.29.11/package.json
  - https://docs.expo.dev/versions/latest/sdk/map-view.md （frontmatter / 冒頭）
  - https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/README.md
- 確認できた事実:
  - npm `latest` = **1.29.11**。SDK 58 のExpo推奨/`npx expo install` の実バージョンも **1.29.11**（`bundledNativeModules`）。
  - dist-tags: `latest 1.29.11`、`beta 2.0.0-beta.15`（**ベータは使わない**）。
  - Expo公式ドキュメント: 対応プラットフォーム `android`, `ios`, `expo-go`。ページ冒頭「**Android, iOS, Included in Expo Go**」。「**No additional setup is required when testing your project using Expo Go.** However, to deploy the app binary on app stores additional steps are required for Google Maps.」
  - README: React Native互換性（Fabric/New Architecture）は「**1.26.1+ requires RN >= 0.81.1**」→ SDK 58のRN 0.88.1は条件を満たす。
  - package.json: `main: src/index.ts`, `types: dist/src/index.d.ts`。`codegenConfig` に Fabric用 `RNMapsSpecs` の定義あり（New Architecture対応）。
- 未確認・不明点:
  - Expo Go（SDK 58）に同梱される react-native-maps の実バージョン（公式に明記なし）。
  - SDK 58（RN 0.88 / New Architecture）での実機動作の詳細（READMEの互換表は満たすが、実機での既知不具合は未確認）。

### 3.2 インストール手順と config plugin

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/map-view.md （Installation / Deploy app with Google Maps） / https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/docs/installation.md
- 確認できた事実:
  - インストールは `npx expo install react-native-maps`（SDK 58なら 1.29.11 が入る）。
  - **config plugin あり**。パッケージに `app.plugin.js` と `plugin/build/*.js` が同梱されていることを確認。`app.json` の `expo.plugins` に `["react-native-maps", { androidGoogleMapsApiKey: ..., iosGoogleMapsApiKey: ... }]` を追加する（**自動では追加されない。手動でpluginsを書く**）。
  - README（docs/installation.md）: 「This plugin is only compatible with react-native-maps version **1.22 and above**, and requires **Expo SDK version 53 or higher**.」
  - Google Map providerを使う場合はコード側で `import { PROVIDER_GOOGLE } from 'react-native-maps'` し、`<MapView provider={PROVIDER_GOOGLE} />` を指定する（公式手順）。
- 未確認・不明点:
  - `npx expo install` 実行時に `app.json` のpluginsが自動追記されるか（公式手順は手動追記のみ記載。自動追記は未確認）。
  - config pluginの `androidGoogleMapsApiKey` に `"process.env.YOUR_GOOGLE_MAPS_API_KEY"` という文字列を書いた場合に環境変数として解決されるか（公式のapp.json例はこの文字列だが、app.jsonでは通常環境変数展開されない。**実値直書き or app.config.js で `process.env` を読む運用が必要**。plugin側の解決仕様は未確認）。

### 3.3 MapView の正確な props 名（公式コンポーネントリファレンス）

- 確認日: 2026-10-30
- 情報源URL: https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/docs/mapview.md （MapView Props表 / Events表）
- 確認できた事実（**名前・既定値は公式表のとおり**。実装するならこの名前を使う）:
  - `provider`: 地図フレームワーク。`"google"` で Google Maps、`null`/`undefined` ならネイティブ実装（iOS = MapKit、**Android = Google Maps**）。
  - `initialRegion`: `Region`。マウント時にだけ使う初期表示領域。マウント後の変更は無視される。
  - `initialCamera`: `Camera`。同上（カメラ版）。
  - `region`: `Region`（制御された表示領域。`initialRegion` とは併用しない）。
  - `showsUserLocation`: `Boolean`（既定 `false`）。現在地表示のON/OFF。**公式注記: 「You need runtime location permissions prior to setting this to true, otherwise it is going to _fail silently_!」**（権限なしだと無言で失敗する）。
  - `userLocationAnnotationTitle`: `String`。現在地注釈のタイトル（iOSのみ）。
  - `followsUserLocation`: `Boolean`（既定 `false`）。**Apple Maps（iOS）のみ**有効。Androidでは効かない。
  - `showsMyLocationButton`: `Boolean`（既定 `true`）。現在地に移動するボタンの表示。
  - `showsCompass`: `Boolean`（既定 `true`）。コンパスの表示。
  - `showsTraffic`: `Boolean`（既定 `false`）。交通情報の表示。
  - `showsIndoorLevelPicker`: `Boolean`（既定 `false`）。Google Mapsのみ。
  - `liteMode`: `Boolean`（既定 `false`）。**Androidのみ**。軽量地図。
  - `zoomTapEnabled`: `Boolean`（既定 `true`）。Google Maps on iOSのみの注記あり。
  - `scrollDuringRotateOrZoomEnabled`: `Boolean`（既定 `true`）。Google Maps only。
  - `kmlSrc`: `string`。KMLのURL（Google Maps & Markersのみ）。
  - イベント（`MapView` のコールバック）:
    - `onUserLocationChange`: `{ coordinate: Location }`。**`showsUserLocation` が true のときのみ**呼ばれる。Android API 18+では `coordinate.isFromMockProvider` も含む。
    - `onRegionChangeStart` / `onRegionChange` / `onRegionChangeComplete`: `(Region, { isGesture: boolean })`。`isGesture` はGoogle Mapsのみ対応。
  - メソッド（ref経由）: `fitToElements(options)`, `fitToSuppliedMarkers(markerIDs, options)`, `setMapBoundaries(northEast, southWest)`, `addressForCoordinate(coordinate)` などが公式表に記載。
  - `Region` 型は READMEの例で `{ latitude, longitude, latitudeDelta, longitudeDelta }`（度・度・度・度）。
- 未確認・不明点:
  - `Region` の厳密な型定義（`LatLng` と `RegionDelta` の合成か等）はREADMEの使用例からの確認であり、型定義ファイルの該当箇所を精読していない（未確認）。
  - `showsUserLocation` がExpo Go（Expo Go自身の権限状態）でどう判定されるか（未確認）。
  - `followsUserLocation` のAndroid代替（`showsMyLocationButton` 等で代替するしかないか）の公式推奨は未確認。

### 3.4 Marker の正確な props 名（公式コンポーネントリファレンス）

- 確認日: 2026-10-30
- 情報源URL: https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/docs/marker.md
- 確認できた事実:
  - `coordinate`: `LatLng`（マーカー位置。**実質必須**。公式表に必須マークの記載はないが、位置指定プロパティはこれ）。
  - `title`: `String`（Calloutが無い場合のデフォルト吹き出しのタイトル）
  - `description`: `String`（同・説明）
  - `image`: `ImageSource`（**ローカル画像リソースのみ可**。`image={require('...')}` 等）
  - `pinColor`: `Color`（デフォルトピンの色。Androidでは利用可能色が限られ、非対応色は赤にフォールバック）
  - `anchor`: `Point`（既定 `(0.5, 1)`。アイコンのどの点を位置に固定するか。0.0〜1.0）
  - `flat`: `Boolean`（既定 `false`。地図に寝かせるかビルボードか）
  - `identifier`: `String`（後で参照するID）
  - `rotation`: `Float`（既定 `0`。度）
  - `draggable`: 値なしprop（付けるとドラッグ可能）
  - `onPress`: `{ coordinate: LatLng, position: Point }` のコールバック
- 未確認・不明点:
  - `Marker` に `zIndex` / `tracksViewChanges` 等があるか（今回は公式表の上記項目のみ確認。全props網羅ではない＝未確認）。
  - カスタムマーカービュー（`<Marker>` の子にReactビュー）のパフォーマンス注意はREADMEに記載あり（Androidはビットマップ化されるためAnimated API非互換の可能性）。

### 3.5 Android の Google Maps API キー（必須か / 設定方法 / 無しで動く範囲）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/versions/latest/sdk/map-view.md （Deploy app with Google Maps > Android）
  - https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/docs/installation.md
  - https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/README.md （Troubleshooting）
- 確認できた事実:
  - **Expo Go では APIキー不要**。Expo公式: 「No additional setup is required when testing your project using Expo Go.」
  - **カスタムビルド（development build / 配布ビルド）ではAndroidはGoogle Mapsのみ**のため、**Google Maps SDK for Android の APIキーが必須**。README: 「On Android, one has to use Google Maps, which in turn requires you to obtain an API key for the Android SDK.」
  - 設定手順（公式）:
    1. Google Cloud でプロジェクト作成 → **Maps SDK for Android** を有効化
    2. SHA-1証明書フィンガープリントを取得（Play配布ならPlay Console > App integrity > App signing key certificate、development buildなら Expo dashboard > Credentials > Android Keystore）
    3. APIキー作成時に **Application restrictions = Android apps** で、`android.package`（app.jsonの値）とSHA-1を登録
    4. `app.json` の `expo.plugins` に `["react-native-maps", { "androidGoogleMapsApiKey": "<key>" }]` を追加
    5. コードで `provider={PROVIDER_GOOGLE}` を指定
    6. **アプリバイナリを再ビルド**（既にストアにあるなら再提出）
  - キーが無い/誤りの場合: READMEのトラブルシューティングに「map is blank」「background is otherwise blank, this is likely an API key issue」と記載。→ **地図が空白/グレーになる**。
  - iOS: デフォルト（Apple Maps）はキー不要。Google MapsをiOSで使う場合のみ `iosGoogleMapsApiKey` とGoogle Maps SDK for iOS が必要。READMEはiOSのGoogle Maps利用は「requires iOS 14+」とも記載。
- 未確認・不明点:
  - APIキー無しの **development build** で「地図タイルだけ出ない」のか「クラッシュする」のかの正確な挙動（READMEは空白と記載するのみ。未確認）。
  - Expo Go に組み込まれているGoogle Maps APIキーの制約（パッケージ名/SHA-1制限の有無）は未確認。
  - `PROVIDER_GOOGLE` を明示しない場合のAndroidの挙動（ドキュメント上はAndroidは常にGoogle Maps）→ 実機での差は未確認。

### 3.6 Web対応（PCブラウザでのプレビュー可否）

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/react-native-maps@1.29.11/src/MapView.web.ts
  - https://docs.expo.dev/versions/latest/sdk/map-view.md （frontmatter `platforms: ['android','ios','expo-go']`）
  - https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/README.md （「React Native Map components for iOS + Android」）
- 確認できた事実:
  - **Web非対応**。`src/MapView.web.ts` の実装は次の1行のみ:
    `export {default} from 'react-native-web/dist/modules/UnimplementedView';`
    → Webビルドでは地図ではなく **react-native-web の UnimplementedView（未実装プレースホルダ）** が描画される。
  - Expo公式ドキュメントの対応プラットフォームにも `web` は含まれない。
  - READMEの対象も「iOS + Android」。
  - したがって **PCブラウザで実際の地図をプレビューすることはできない**（react-native-mapsを使う場合）。
- 未確認・不明点:
  - MapView以外（Marker等）のWeb実装の有無（MapView.web.tsのみ確認。他コンポーネントのweb実装は未確認）。
  - Webで地図プレビューする代替手段（expo-maps、WebView + 地図JS、外部タイル等）の比較は本調査の範囲外・未調査。

---

## 4. Jest / jest-expo

### 4.1 バージョンと対応関係

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json
  - https://registry.npmjs.org/-/package/jest-expo/dist-tags
  - https://unpkg.com/jest-expo@58.0.13/package.json
  - https://exp.host/--/api/v2/versions （relatedPackages）
  - https://docs.expo.dev/develop/unit-testing.md
- 確認できた事実:
  - SDK 58 の `npx expo install` が入れる `jest-expo` = **~58.0.13**（npm `latest` も 58.0.13）。
  - **SDK 58 では jest-expo が Jest 30 を要求**（公式ドキュメント「Migrate tests to SDK 58」節に明記）。versions API の `relatedPackages`: `jest ~30.5.2`、`@types/jest 30.0.0`。npm `jest` の `latest` = 30.5.2。
  - `jest-expo@58.0.13` の peerDependencies: `expo: *`, `jest: ^29.0.0 || ^30.0.0`, `react-native: *`, `@react-native/jest-preset: ^0.88.1`, `react-server-dom-webpack: ~19.0.4 || ~19.1.5 || ~19.2.4 || ~19.3.0`。
  - `@testing-library/react-native` の npm `latest` = **14.1.0**。公式ドキュメントは「`@testing-library/react-native` が非推奨の `react-test-renderer` を置き換える（React 19以上はreact-test-renderer非対応）」と明記。Expo Routerのテストでは v14以上が必要。
- 未確認・不明点:
  - SDK 58 で `jest-expo` が実際にどの Jest 30.x を要求するか（peer範囲は^29||^30だが、ドキュメントは「Jest 30」とのみ。~30.5.2 が実ピン候補）。
  - `jest-expo` の `@react-native/jest-preset` peer が ^0.88.1 固定のため、RN 0.88.1 とセットで使う前提（他SDKでは未確認）。

### 4.2 設定（preset / transformIgnorePatterns / tsconfig）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/develop/unit-testing.md
  - https://raw.githubusercontent.com/expo/expo/main/packages/jest-expo/README.md
- 確認できた事実:
  - インストール: `npx expo install jest-expo jest @types/jest --dev`（**Windowsでは** `npx expo install jest-expo jest @types/jest "--" --dev`）。TypeScriptでないなら `@types/jest` は不要。
  - `package.json`:
    - `scripts.test`: 例 `jest --watchAll`
    - `jest.preset`: **`"jest-expo"`**
  - TypeScriptなら `tsconfig.json` の `compilerOptions.types` に `"jest"` を追加。
  - `transformIgnorePatterns` の公式推奨値（npm/Yarn）:
    `"node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)"`
    - pnpm用は `node_modules/(?!(.pnpm|...))`、Bun用は `node_modules/(?!(.bun|...))` と、パッケージマネージャ別の変種が公式に記載。
  - `jest-expo` のREADME: `jest-expo` presetは「Expo SDKのネイティブ部分をモックする」。**既定（`jest-expo`）はiOS環境で実行**され、「推奨は `jest-expo/universal`（iOS/Android/web/Nodeを全実行）」。`jest-expo/ios` / `jest-expo/android` / `jest-expo/web` / `jest-expo/node` の個別presetもある。`projects` で組み合わせ可能。プラットフォーム別拡張子（`-test.ios.*`, `-test.android.*`, `-test.web.*`, `-test.node.*`）もREADMEに記載。
- 未確認・不明点:
  - SDK 58 で `jest-expo/universal` を使う場合の設定差分・既知問題は未確認（READMEには推奨とあるが、SDK 58固有の注意は未確認）。
  - `transformIgnorePatterns` は公式の「推奨値」であり、依存追加時に追記が必要（全パターン網羅ではない）。

### 4.3 expo-location を Jest でモックする公式な方法

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/modules/mocking.md
  - https://unpkg.com/expo-location@58.0.20/mocks/ExpoLocation.ts
  - https://unpkg.com/jest-expo@58.0.13/src/preset/moduleMocks/expoModules.js
- 確認できた事実:
  - **expo-location専用の公式モック手順は無い**（§2.8と同じ）。公式が用意するのは「パッケージ同梱モック」＋「jest-expo preset による自動適用」の汎用機構。
  - expo-locationの同梱モックは**全て空実装**（`Promise<any>` を返すだけ）なので、`getCurrentPositionAsync()` は `undefined` になる。テストで位置情報の値を扱うには **`jest.mock('expo-location', () => ({ ... }))` で自前にモックする**（`mocking.md` が「任意のJSコードをJestの組み込みAPIでモックできる」と明記）。
  - モックの戻り値は §2.4 の `LocationObject` / `LocationHeadingObject` / `LocationPermissionResponse` の型に合わせる必要がある（型定義は `unpkg` のパッケージ内 `.d.ts` が正）。
  - 参考: AsyncStorageには公式のJestモック（`@react-native-async-storage/async-storage/jest/async-storage-mock`）が用意されている（§6.1）。expo-locationには同等の「公開モックデータ」は無い。
- 未確認・不明点:
  - `jest-expo` が expo-location の同梱モックを実際に適用するかは**要検証**（presetのソースとモックファイルの存在からの推定。テスト実行で確認するのが確実）。
  - `watchPositionAsync` の `LocationSubscription`（`remove()`）まで含めたモックの公式例は無い（未確認＝自作）。

---

## 5. expo-sensors（Magnetometer）— 方位の代替候補

### 5.1 バージョン・対応・Expo Go

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json （~58.0.4）
  - https://registry.npmjs.org/-/package/expo-sensors/dist-tags
  - https://docs.expo.dev/versions/latest/sdk/magnetometer.md （frontmatter）
  - https://docs.expo.dev/versions/latest/sdk/sensors.md
- 確認できた事実:
  - npm `latest` = **58.0.4**。SDK 58 のExpo推奨 = `~58.0.4`。インストールは `npx expo install expo-sensors`。
  - Magnetometerページの対応プラットフォーム: `android`, `ios`, `expo-go`（**Web非対応**）。ページ冒頭「Android, iOS, Included in Expo Go」。
  - expo-sensors 全体のconfig pluginあり（`motionPermission` = iOS `NSMotionUsageDescription`）。
  - Android 12（API 31）以降はセンサー更新200Hz制限。200Hz超が必要なら `android.permission.HIGH_SAMPLING_RATE_SENSORS` を `app.json` の `expo.android.permissions` に追加（またはAndroidManifestに `<uses-permission>`）。
- 未確認・不明点:
  - Expo Go 同梱の expo-sensors 実バージョン（未確認）。

### 5.2 Magnetometer の API（確定）

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/magnetometer.md
- 確認できた事実:
  - import: `import { Magnetometer, MagnetometerUncalibrated } from 'expo-sensors'`
  - `Magnetometer.addListener(listener): EventSubscription` — 磁気センサー更新を購読。`listener` は `MagnetometerMeasurement` を1引数で受ける。戻り値は `remove()` を持つ `EventSubscription`。
  - `Magnetometer.setUpdateInterval(intervalMs: number): void` — 更新間隔(ms)。
  - `Magnetometer.isAvailableAsync(): Promise<boolean>` — **使用前に必ず確認すること**（公式注記）。Android 2.3（API 9）+ / iOS 8+。
  - `Magnetometer.getPermissionsAsync(): Promise<PermissionResponse>` / `requestPermissionsAsync(): Promise<PermissionResponse>`
  - `Magnetometer.getListenerCount(): number`、`hasListeners(): boolean`、`removeAllListeners(): void`（非推奨。`subscription.remove()` を使う）、`removeSubscription(subscription): void`
  - `MagnetometerMeasurement`: `{ x: number; y: number; z: number; timestamp: number }`
    - x/y/z は**各軸の磁場の強さ（マイクロテスラ `μT`）**。
    - `timestamp` は**秒**（※expo-locationの `LocationObject.timestamp` はミリ秒。単位が違うので混同注意）。
  - `MagnetometerUncalibrated` は未校正の生値。
- 未確認・不明点:
  - センサーの校正状態・精度をAPIから取得する方法（Accuracy相当の情報）は無いように見えるが、明記は無い（未確認）。

### 5.3 自前でコンパス方位（heading）を計算する場合の注意点

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/magnetometer.md 、https://docs.expo.dev/versions/latest/sdk/sensors.md
- 確認できた事実（公式ドキュメントに書かれている範囲）:
  - Magnetometerが返すのは **x/y/z の磁場強度とタイムスタンプのみ**。**方位角（heading）を直接返すAPIは無い**。
  - **チルト補正（端末の傾き補正）に必要な姿勢情報はMagnetometer APIには含まれない**。expo-sensorsには `DeviceMotion`（「Measures device motion on all platforms」）や `Gyroscope` もあるが、**磁気センサーと組み合わせたコンパス方位の計算手順・サンプルは公式ドキュメントに記載が無い**（未確認）。
  - **磁気偏角（magnetic declination）**（磁北→真北の補正）を提供する機能はexpo-sensors/expo-locationのどちらにも見当たらない（expo-locationのheadingは `trueHeading` を返すため、端末側が補正済み）。
  - 校正・磁気外乱（金属・スピーカー・ケース等）の影響を補正する仕組みはAPIに無い（`accuracy` に相当する校正レベルはMagnetometerには無い）。
- 未確認・不明点:
  - 実装式（`atan2` による方位算出、`DeviceMotion` の回転情報を使ったチルト補正、磁気偏角の扱い）は**本調査では公式一次情報を確認できていない**。→ 自前実装するなら別途、物理計算の妥当性検証と実機テストが必要（未確認）。
  - WebでのMagnetometer動作（`platforms` にwebが無いため不可と判断。未確認）。

### 5.4 expo-location heading との比較・推奨

- 確認日: 2026-10-30
- 情報源URL: 上記 §2.6 / §5.2 / §5.3 と同じ
- 確認できた事実に基づく比較:
  - **expo-location `getHeadingAsync` / `watchHeadingAsync`**: 方位（`magHeading`, `trueHeading`）と校正レベル（`accuracy: 0-3`）を直接返す。`trueHeading` は位置権限があれば真北基準。Android/iOS対応。**コンパス方位が必要ならこちらが適切**。
  - **expo-sensors Magnetometer**: x/y/z の磁場のみ。方位計算・チルト補正・磁気偏角補正を自前で行う必要があり、公式の計算方法も無い。**フォールバック（heading APIが使えない環境）用途に限定するのが安全**。
- 未確認・不明点:
  - expo-locationのheadingが「どのセンサー融合で算出されているか」は未確認だが、`accuracy` の校正レベルを持つ点で自前計算より信頼性が高いと判断できる（判断根拠は公式ドキュメントの `accuracy` 説明）。
  - Android実機でのheadingの応答速度・精度の実測値は未確認（実機テストが必要）。

---

## 6. 永続化（ローカル保存のみ・バックエンドなし）

### 6.1 @react-native-async-storage/async-storage

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json
  - https://docs.expo.dev/versions/latest/sdk/async-storage.md
  - https://registry.npmjs.org/-/package/@react-native-async-storage%2Fasync-storage/dist-tags
  - https://react-native-async-storage.github.io/2.0/API/
  - https://react-native-async-storage.github.io/2.0/advanced/Limits/
  - https://react-native-async-storage.github.io/2.0/advanced/Jest-integration/
- 確認できた事実:
  - **SDK 58 のExpo推奨 = `2.2.0`**（`bundledNativeModules`、公式ドキュメントの「Recommended version: 2.2.0」）。`npx expo install @react-native-async-storage/async-storage` は **2.2.0** を入れる。
  - **npm の `latest` は 3.1.1**（dist-tags: `latest 3.1.1`, `next 3.0.0-next.3`）。**Expoの推奨（2.2.0）とnpm最新（3.1.1）が乖離している**。→ 独自に `npm install` で 3.x を入れない。
  - 対応プラットフォーム: `android`, `ios`, `macos`, `tvos`, `web`, `expo-go`（**Included in Expo Go**）。
  - API（公式APIページのシグネチャ）:
    - `getItem(key: string): Promise<string | null>` — 既存値 or null
    - `setItem(key: string, value: string): Promise<void>`
    - `mergeItem(key: string, value: string): Promise<void>`
    - `removeItem(key: string): Promise<void>`
    - `getAllKeys(): Promise<string[]>`
    - `multiGet(keys: string[]): Promise<[string, string | null][]>`
    - `multiSet(keyValuePairs: [string, string][]): Promise<void>`
    - `multiMerge(keyValuePairs: [string, string][]): Promise<void>`
    - `multiRemove(keys: string[]): Promise<void>`
    - `clear(): Promise<void>`
    - `useAsyncStorage(key)` フック
  - **文字列のみ保存可**。オブジェクトは `JSON.stringify` → `JSON.parse` が必要（公式Usageに明記）。
  - **暗号化されない**（公式の説明: 「asynchronous, unencrypted, persistent, key-value storage API」）。
  - **Androidの既知サイズ制限**（公式 Known limits）: 合計 **6MB**（既定。feature flagで増加可能）、1エントリあたり **約2MB**（WindowCursorのバッファ制限。回避策なし。大きなデータは分割し `multiGet`/`multiSet` を使う）。
  - **公式のJestモックあり**: `@react-native-async-storage/async-storage/jest/async-storage-mock`（パッケージ内に `/jest/async-storage-mock.js` が存在することを確認）。`__mocks__/@react-native-async-storage/async-storage.js` に `export * from "..."` を置くか、Jest setup で `jest.mock(...)` する（公式ページに手順）。
- 未確認・不明点:
  - **AsyncStorage 3.1.1 と Expo SDK 58 の互換性**（Expoが2.2.0をpinしている理由・3.xでの破壊的変更の有無は未確認）。
  - iOSのサイズ制限（公式Known limitsはAndroidのみ記載。iOS側の上限は未確認）。
  - Expo Go 同梱のAsyncStorage実バージョン（未確認）。

### 6.2 expo-sqlite

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json
  - https://docs.expo.dev/versions/latest/sdk/sqlite.md
  - https://registry.npmjs.org/-/package/expo-sqlite/dist-tags
- 確認できた事実:
  - npm `latest` = **58.0.14**。SDK 58 のExpo推奨 = `~58.0.14`。
  - 対応プラットフォーム: `android`, `ios`, `macos`, `tvos`, `web`, `expo-go`（**Included in Expo Go**）。
  - 主なAPI（公式）:
    - `SQLite.openDatabaseAsync(databaseName, options?, directory?): Promise<SQLiteDatabase>`
    - `db.execAsync(source: string)`（複数SQLをまとめて実行。**エスケープされない**ので自前で注意）
    - `db.runAsync(source, params)`（INSERT/UPDATE等。`SQLiteRunResult { changes, lastInsertRowId }`）
    - `db.getAllAsync(source, params)` / `db.getFirstAsync(source, params)` / `db.getEachAsync`
    - `db.withTransactionAsync(task)` / `withExclusiveTransactionAsync(task)`
    - `SQLiteProvider`（Reactコンポーネント）と `useSQLiteContext()`
  - **Key-valueストア**: `expo-sqlite/kv-store` が **`@react-native-async-storage/async-storage` のドロップイン代替**（公式明記）。APIは同じ（`getItem`/`setItem`/`removeItem`/`getAllKeys`/`multiGet`/`multiSet`/`clear` 等）に加え、**同期API**（`getItemSync`/`setItemSync` 等）を持つ。既にexpo-sqliteを入れているなら追加依存なし。import文を `'@react-native-async-storage/async-storage'` → `'expo-sqlite/kv-store'` に変えるだけで移行可能、と公式に記載。パッケージ内に `/kv-store.js` が存在することを確認。
  - **`expo-sqlite/localStorage/install`**: Webの `localStorage` APIのドロップイン実装（Webではno-op）。`/localStorage/install.js` が存在することを確認。
  - **Webで使うには追加設定が必要**: Metroのwasm対応（`metro.config.js` のカスタマイズ）と、`SharedArrayBuffer` 用のHTTPヘッダ（COOP/COEP）設定。EAS Hostingではapp.jsonでヘッダ設定可能。`SQLite.configureWeb({ wasmURL })` も必要。
  - 暗号化はデフォルトでは無い（`useSQLCipher` オプションでSQLCipher実装を選択可能）。
- 未確認・不明点:
  - Expo Go（Android/iOS）でのSQLiteの動作制約（基本的には動く想定だが、公式に「Expo Goで動く」以上の詳細は未確認）。
  - 大容量データ・同時アクセス時の性能特性（未確認）。
  - WebでのCOOP/COEP設定が本プロトタイプのWebプレビューに与える影響（未確認）。

### 6.3 要件（ローカル保存のみ・バックエンドなし）に対する選択肢比較

- 確認日: 2026-10-30（上記 §6.1 / §6.2 の事実に基づく整理。推測は含めない）
- 比較（公式事実ベース）:

  | 観点 | AsyncStorage 2.2.0 | expo-sqlite 58.0.14 |
  | --- | --- | --- |
  | 形態 | 非暗号化キーバリュー（文字列のみ） | SQLite（リレーショナルDB）＋ kv-store（AsyncStorage互換） |
  | Expo SDK 58 推奨 | 2.2.0（pin） | ~58.0.14 |
  | Expo Go | 同梱（可） | 同梱（可） |
  | Web | 対応 | 対応（wasm設定・COOP/COEP必須） |
  | 得意 | 設定・フラグ・小さなJSON | 履歴・構造化データ・検索/集計・大きなデータ |
  | サイズ制限 | Android: 合計6MB / 1件約2MB | 公式に明記された上限は未確認 |
  | テスト | 公式Jestモックあり | 公式の専用Jestモック手順は未確認 |
  | 追加設定 | なし | WebはMetro/ヘッダ設定が必要 |

- 要件（ローカル保存のみ・バックエンドなし）への適合:
  - どちらも「ローカルのみ」で完結し、バックエンド不要。
  - **小さな設定・ユーザー状態・保存した地点のJSON（数MB未満）→ AsyncStorage 2.2.0 が最小構成**。
  - **走行履歴・訪問記録など件数が増える構造化データ、検索・集計が必要 → expo-sqlite**（`kv-store` を使えばAsyncStorage互換のままSQLiteバックエンドにできる）。
  - 注意: AsyncStorageは**非暗号化**。機微情報を保存する要件がある場合は expo-secure-store 等の検討が必要（本調査では未調査）。

### 6.4 未確認・不明点（永続化）

- AsyncStorage 3.1.1 を SDK 58 で使った場合の互換性・挙動（未確認）。
- Expo Go に同梱される各ライブラリの実バージョン（未確認）。
- expo-sqlite の Expo Go 上での具体的な制約（未確認）。
- 保存データ量の想定（プロトタイプの要件次第。設計時に決める必要あり）。

---

## 7. 補足: Location (next)、expo-maps、SDK 57フォールバック

### 7.1 Location (next)（新API・ベータ）

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/location-next.md / https://expo.dev/changelog/sdk-58
- 確認できた事実:
  - `expo-location/next` として**新しい位置情報APIがベータ提供**されている（既存APIと併用可能）。「Since it is in beta, the API might change between SDK versions.」と明記。
  - 対応プラットフォームは `android`, `ios` のみ（frontmatterに `expo-go` が無い＝**Expo Go想定ではない**）。
  - 新APIの特徴（changelog）: 位置プロバイダ抽象化、シンプルな位置取得API、位置ウォッチャー、バックグラウンド更新、Androidの位置前景サービス、iOSの一時的なフル精度要求などの権限オプション。
  - 新APIの例: `import { Location, LocationAccuracy } from 'expo-location/next'`、`Location.requestForegroundPermissions()`、`Location.getPosition()`、`getPosition()` は `{ coordinates, horizontalAccuracy }` 等を返す（ドキュメントのサンプルより）。
- 未確認・不明点:
  - ベータAPIの安定性・SDK 59での変更予定（未確認）。
  - Expo Goでの動作可否（frontmatterにexpo-goが無いため不可と判断。未確認）。
- **推奨**: プロトタイプの安定実装には **既存の `expo-location` API（§2）を使う**。`expo-location/next` はベータであり、API変更リスクがある。

### 7.2 expo-maps（react-native-mapsの代替）

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/maps.md / https://unpkg.com/expo@58.0.21/bundledNativeModules.json
- 確認できた事実:
  - SDK 58 のバージョンは `~58.0.11`。
  - 対応プラットフォームは `ios`, `android` のみ（frontmatter）。**Expo Go 同梱の記載なし**。
  - react-native-maps の代替としてExpoが開発しているが、**Expo Goでは動かない（development buildが必要）**と判断できる。
- 未確認・不明点:
  - expo-maps のAPI詳細・Web対応（未調査）。

### 7.3 SDK 57 で作る場合のバージョン（参考）

§1.4 のとおり。Expo Goのストア版（SDK 57）で動かしたい場合は、`expo ~57.0.31` / RN 0.86.3 / React 19.2.3 / expo-location ~57.0.22 / react-native-maps 1.27.2 / jest-expo ~57.0.6 / expo-sensors ~57.0.3 / async-storage 2.2.0 / expo-sqlite ~57.0.4 が対応バージョン。

---

## 8. 設計に影響する重要ファクト（サマリ）

1. **最新安定版は Expo SDK 58**（`expo@58.0.21`、2026-10-15リリース）。要求は **RN 0.88.1 / React 19.3.0 / TypeScript ~6.0.3 / Node 22.13以上**。Androidは7以上（compileSdk 37 / targetSdk 36）。
2. **Expo Goは移行期**。versions API の `expoGoSdkVersion` は **57.0.0** の一方、SDK 58用Expo Go（Android 58.0.5 APK / iOS 58.0.7）の配布URLは存在する。SDK 58で進めるなら **Expo Goは `expo.dev/go` からSDK 58版を入れる**（ストア版のSDKは要確認）。SDK 57にすればストア版Expo Goで動く可能性が高いが、`create-expo-app` のデフォルトSDKは要確認。
3. **expo-location（~58.0.20）は Expo Go 同梱**。前景の位置取得・方位はExpo Goで可。**背景位置と前景サービスは development build 必須**（iOSは公式明記、Androidは「Foreground and background services are not available in Expo Go for Android」）。
4. **位置取得の確定シグネチャ**: `getCurrentPositionAsync(options?) → Promise<LocationObject>` / `watchPositionAsync(options, callback, errorHandler?) → Promise<LocationSubscription>` / `getLastKnownPositionAsync(options?) → Promise<LocationObject | null>`。`LocationSubscription` は `remove()` で解除。
5. **LocationObject の要点**: `coords.{latitude, longitude, accuracy(半径m), altitude, altitudeAccuracy, heading(進行方向), speed}` + `timestamp(ms)`。**`coords.heading` は進行方向でありコンパス方位ではない**。方位は `LocationHeadingObject`（`trueHeading` / `magHeading` / `accuracy: 0-3`）を使う。`trueHeading` は位置権限なしだと **-1**。
6. **精度は `Accuracy`（= `LocationAccuracy` の別名）で指定**。既定 `Balanced`=3（100m）。ナビ用途は `High`=4（10m）または `BestForNavigation`=6 を明示指定する。`BestForNavigation` は追加センサーデータ利用の最高精度。
7. **react-native-maps 1.29.11 は Expo Go 同梱**（追加設定不要）。`showsUserLocation`（既定false）は**実行時位置権限が無いと無言で失敗**。`showsMyLocationButton`（既定true）、`showsCompass`（既定true）、`followsUserLocation`（**Apple Maps/iOSのみ**）、`provider`・`initialRegion`・`liteMode`（Androidのみ）等が確定props。`Marker` は `coordinate` 必須、`title` / `description` / `pinColor` / `image` / `identifier` / `rotation` / `draggable` / `onPress`。
8. **Androidのカスタムビルドには Google Maps APIキーが必須**（Expo Goは不要）。設定は `app.json` の `plugins: [["react-native-maps", { androidGoogleMapsApiKey: ... }]]` + SHA-1/package制限 + `provider={PROVIDER_GOOGLE}` + **再ビルド**。キー無しは**地図が空白/グレー**（README記載）。pluginは rnm 1.22+ / Expo SDK 53+ が条件。
9. **react-native-maps は Web 非対応**（`MapView.web.ts` は `react-native-web` の `UnimplementedView` をexport）。**PCブラウザで実地図のプレビューはできない**。expo-mapsもExpo Go非対応（`~58.0.11`、development build必須）。
10. **Jestは `jest-expo ~58.0.13` + Jest 30（~30.5.2）/ `@types/jest` 30.0.0**。preset `"jest-expo"`、`transformIgnorePatterns` の公式推奨値あり。**expo-location専用の公式モックは無く**、同梱モックは空実装（`undefined` を返す）なので、テストでは `jest.mock('expo-location', ...)` で自前モックが必要。永続化は **AsyncStorage 2.2.0（Expoピン、npm latest 3.1.1とは乖離）** または **expo-sqlite 58.0.14（`expo-sqlite/kv-store` でAsyncStorage互換）**。どちらもExpo Go同梱・ローカルのみで完結。AsyncStorageのAndroid制限は合計6MB / 1件約2MB。

---

## 9. 情報源一覧（すべて 2026-10-30 取得）

| 情報源 | URL | 何を確認したか |
| --- | --- | --- |
| Expo SDK index（v58） | https://docs.expo.dev/versions/latest/ | SDK 58 のRN/React/Node対応表、Android/iOS要件 |
| Expo SDK 58 changelog | https://expo.dev/changelog/sdk-58 | リリース日(2026-10-15)、RN 0.88、Expo Go移行期の記述、expo-location/next |
| expo-location 公式 | https://docs.expo.dev/versions/latest/sdk/location.md | バージョン、Expo Go、config plugin、権限、全API・型・Enums |
| expo-location 型定義 | https://unpkg.com/expo-location@58.0.20/build/Location.d.ts / https://unpkg.com/expo-location@58.0.20/build/Location.types.d.ts / https://unpkg.com/expo-location@58.0.20/build/index.d.ts | 正確な関数シグネチャ、型、Accuracy/HeadingObject、Accuracy別名export |
| expo-location 同梱モック | https://unpkg.com/expo-location@58.0.20/mocks/ExpoLocation.ts | 空実装モックの実体 |
| react-native-maps 公式(Expo) | https://docs.expo.dev/versions/latest/sdk/map-view.md | 対応PF、Expo Go、Google Mapsキー設定手順 |
| react-native-maps README | https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/README.md | 対応RNバージョン、セットアップ、トラブルシュート |
| react-native-maps docs | https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/docs/mapview.md / https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/docs/marker.md / https://raw.githubusercontent.com/react-native-maps/react-native-maps/master/docs/installation.md | MapView/Markerの正確なprops、インストール、Google Mapsキー必須、plugin互換 |
| react-native-maps パッケージ実物 | https://unpkg.com/react-native-maps@1.29.11/package.json / https://unpkg.com/react-native-maps@1.29.11/src/MapView.web.ts | バージョン、types、Web実装（UnimplementedView）、plugin同梱 |
| expo-sensors Magnetometer 公式 | https://docs.expo.dev/versions/latest/sdk/magnetometer.md | Magnetometer API、MagnetometerMeasurement、Expo Go |
| expo-sensors 公式 | https://docs.expo.dev/versions/latest/sdk/sensors.md | config plugin、Android 200Hz制限、対応センサー一覧 |
| Expo公式 単体テスト | https://docs.expo.dev/develop/unit-testing.md | jest-expo設定、Jest 30要件、transformIgnorePatterns、RNTL v14 |
| Expo公式 モック | https://docs.expo.dev/modules/mocking.md | Expoモジュールのモック機構（mocksディレクトリ / jest-expo） |
| jest-expo README | https://raw.githubusercontent.com/expo/expo/main/packages/jest-expo/README.md | presetの種類、universal推奨、プラットフォーム別拡張子 |
| jest-expo 実物 | https://unpkg.com/jest-expo@58.0.13/package.json / https://unpkg.com/jest-expo@58.0.13/src/preset/moduleMocks/expoModules.js | peer依存、ExpoLocationモックの定義 |
| Expo Go バージョン不一致 | https://docs.expo.dev/troubleshooting/expo-go-version-mismatch.md | ストア版Expo GoのSDK状況、expo.dev/goでの入手 |
| Expo versions API | https://exp.host/--/api/v2/versions | sdkVersions（58.0.0のRN/React/jest/クライアントURL）、expoGoSdkVersion |
| SDK 58 bundledNativeModules | https://unpkg.com/expo@58.0.21/bundledNativeModules.json | `npx expo install` が入れる実バージョン一覧 |
| SDK 57 bundledNativeModules | https://unpkg.com/expo@57.0.31/bundledNativeModules.json | SDK 57フォールバック時のバージョン |
| npm registry（expo） | https://registry.npmjs.org/-/package/expo/dist-tags / https://registry.npmjs.org/expo/58.0.21 | 実バージョン、dist-tags、Node engines |
| npm registry（各ライブラリ） | https://registry.npmjs.org/-/package/expo-location/dist-tags ほか（react-native-maps / jest-expo / expo-sensors / @react-native-async-storage%2Fasync-storage / expo-sqlite / expo-maps） | 実バージョンとdist-tags |
| expo-sqlite 公式 | https://docs.expo.dev/versions/latest/sdk/sqlite.md | SQLite API、kv-store、localStorage、Web設定、Expo Go |
| AsyncStorage 公式 | https://docs.expo.dev/versions/latest/sdk/async-storage.md / https://react-native-async-storage.github.io/2.0/API/ / .../advanced/Limits/ / .../advanced/Jest-integration/ | Expo推奨版、APIシグネチャ、Androidサイズ制限、公式Jestモック |
| AsyncStorage 実物 | https://unpkg.com/@react-native-async-storage/async-storage@2.2.0/?meta | jestモックファイルの同梱確認 |

---

## 10. 未確認事項一覧（実装前に追加確認が必要）

1. **2026-10-30時点のExpo Goストア版がSDK 58かどうか**、および `npx create-expo-app` のデフォルトSDK（SDK 58を選ぶなら `expo.dev/go` からSDK 58版Expo Goを導入する運用が確実）。
2. **Expo Go（Android）で前景位置取得が制限なく動くか**（公式の「Foreground and background services are not available in Expo Go for Android」の解釈が一意でない。実機で `getCurrentPositionAsync` / `watchPositionAsync` を試す）。
3. **expo-location の `watchHeadingAsync` がAndroid実機でどの程度の精度・応答か**（実測が必要）。
4. **expo-location 同梱モックが jest-expo preset で実際に適用されるか**（テストを1本書いて `getCurrentPositionAsync` の戻り値が `undefined` になることを確認）。
5. **`jest-expo/universal` をSDK 58で使う場合の設定**（READMEは推奨とするが、SDK 58固有の注意は未確認）。
6. **react-native-maps のAPIキー無し development build の正確な挙動**（READMEは「空白」と記載。クラッシュ有無は未確認）。
7. **`androidGoogleMapsApiKey` に環境変数文字列を書いた場合の解決可否**（公式例は `process.env...` 文字列。app.jsonでは展開されない可能性が高い）。
8. **Expo Go / 各パッケージ同梱の実バージョン**（expo-location, react-native-maps, expo-sensors, AsyncStorage, expo-sqlite）。
9. **AsyncStorage 3.1.1 と SDK 58 の互換性**（Expoは2.2.0を指定。3.xの利用は避けるのが安全）。
10. **Magnetometerからコンパス方位を自前計算する具体的な式・チルト補正・磁気偏角の扱い**（Expo公式ドキュメントに記載なし。必要なら別途、物理計算の検証と実機テストが必要）。
11. **expo-sqlite の Expo Go 上での詳細制約**、およびWebプレビュー時のwasm/COOP/COEP設定の実作業量。
12. **react-native-maps の `Region` 等の厳密な型定義**（README使用例からは確認。型定義ファイルの精読はしていない）。

# 目的地設定UX刷新のためのAPI・実現性調査ノート

- 確認日: **2026-10-30**（Asia/Tokyo）
- 対象: 寄鳥美鳥地（Expo SDK 58 / React Native 0.88.1 / Android先行）。目的地設定UX刷新（地図タップ・場所検索・他アプリ共有・クリップボード・ディープリンク）の実現性確定。
- 情報源: Expo公式ドキュメント（`docs.expo.dev` のMarkdown版）、npmレジストリ、unpkgで取得した**公開パッケージの型定義・実装ソース**、Android/Google公式ドキュメント。すべて確認日 2026-10-30。
- 制約: `web_search` / `web_fetch` はAPIキー未設定で利用不可のため、Node.jsのHTTPSクライアントで一次情報URLを直接取得した。**推測は排除**し、一次情報で確定できないものは「未確認」と明記。

---

## 0. 結論サマリ（Expo Go と development build の線引き）

| 目的地設定の経路 | Expo Goで実装・検証 | development buildが必要 | 根拠（詳細は後述） |
| --- | --- | --- | --- |
| 地図タップ（既存のreact-native-maps） | **可** | 不要 | 前回調査のとおりExpo Go同梱 |
| 場所検索（expo-location `geocodeAsync`） | **可** | 不要 | expo-locationはExpo Go同梱。geocodeはAndroid/iOS対応 |
| 逆ジオコーディング（`reverseGeocodeAsync`） | **可** | 不要 | 同上 |
| クリップボードから貼り付け（expo-clipboard） | **可** | 不要 | Expo Go同梱。ただしAndroid 10+は「フォーカス中のみ」読取可 |
| ディープリンク受信（Expo Go: `exp://.../--/set?...`） | **可** | 不要 | `expo-linking`はExpo Go同梱。`/--/`の公式書式あり |
| カスタムスキーム `yoridorimidori://` の受信 | **不可** | **必要** | スキーム追加はネイティブ設定変更。公式「新しいdevelopment buildを作成」 |
| 共有メニュー（ACTION_SEND）から直接受け取り | **不可** | **必要** | Expo Goは固定ネイティブ。intent-filter追加不可（公式FAQ・expo-share-intent README） |
| Googleマップアプリを開く（geo: URI等） | **可（API上）** | 不要 | `Linking.openURL` / `expo-intent-launcher`（Expo Go同梱）。ただしMaps起動の公式例は未確認 |
| PCブラウザでの地名検索 | 不可（geocodeはAndroid/iOSのみ） | - | `geocodeAsync` の対応プラットフォームはAndroid/iOS |

---

## 1. expo-location のジオコーディング（場所検索の要）

### 1.1 バージョン・Expo Go・プラットフォーム

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json
  - https://docs.expo.dev/versions/latest/sdk/location.md
- 確認できた事実:
  - SDK 58 の `npx expo install expo-location` は **`~58.0.20`** をインストール（`bundledNativeModules.json`）。
  - expo-location の対応プラットフォーム（frontmatter）: `android`, `ios`, `web`, `expo-go`。ページ冒頭「**Android, iOS, Web, Included in Expo Go**」→ **Expo Goで動く**。
  - ただし **`geocodeAsync` / `reverseGeocodeAsync` の対応は `Android, iOS` のみ**（公式 「Supported platforms: Android, iOS.」、Web非対応）。Webプレビューでは地名検索は使えない。
- 未確認・不明点:
  - Expo Go に同梱される expo-location の実バージョン（公式に明記なし。`npx expo install` の解決値は 58.0.20）。

### 1.2 正確なシグネチャ（型定義で確定）

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/expo-location@58.0.20/build/Location.d.ts
  - https://unpkg.com/expo-location@58.0.20/build/Location.types.d.ts
  - https://docs.expo.dev/versions/latest/sdk/location.md
- 確認できた事実（`import * as Location from 'expo-location'`）:
  - **`Location.geocodeAsync(address: string): Promise<LocationGeocodedLocation[]>`**
    - 住所文字列→緯度経度。戻り値は配列（公式: 「in most cases its size is 1」）。
    - **Androidでは、呼ぶ前に `requestForegroundPermissionsAsync()` で位置情報（前景）権限が必要**（公式注記）。
  - **`Location.reverseGeocodeAsync(location: Pick<LocationGeocodedLocation, 'latitude' | 'longitude'>): Promise<LocationGeocodedAddress[]>`**
    - 実引数は `{ latitude: number; longitude: number }` のオブジェクト。
    - 同様にAndroidでは前景位置権限が必要。
  - Android実装（Kotlin）を確認: `android.location.Geocoder` を使用し、**`getFromLocationName(address, 1)` / `getFromLocation(lat, lng, 1)` と maxResults=1 で呼んでいる**（=Androidでは結果は最大1件）。`Geocoder.isPresent()` が false の場合は `NoGeocodeException` を投げる。
- 戻り値の型（全フィールド）:
  - `LocationGeocodedLocation`:
    - `latitude: number`
    - `longitude: number`
    - `altitude?: number`（WGS84楕円体基準のメートル）
    - `accuracy?: number`（不確かさの半径・メートル）
  - `LocationGeocodedAddress`（すべて `string | null`）:
    - `city`, `district`, `streetNumber`, `street`, `region`, `subregion`, `country`, `postalCode`, `name`, `isoCountryCode`, `timezone`（**iOSのみ**）, `formattedAddress`（**Androidのみ**。例: "111 8th Avenue, New York, NY"）
- 未確認・不明点:
  - iOS側の実装（`CLGeocoder` と推定されるが、一次情報で未確認）と、iOSでの返却件数。
  - `geocodedAddress` 各フィールドの値が端末言語・地域設定でどう変わるか（未確認）。

### 1.3 Androidでのネットワーク要件（オフラインで動くか）

- 確認日: 2026-10-30
- 情報源URL:
  - https://developer.android.com/reference/android/location/Geocoder
  - https://unpkg.com/expo-location@58.0.20/android/src/main/java/expo/modules/location/LocationModule.kt
- 確認できた事実:
  - expo-locationのAndroid実装はプラットフォーム標準の `android.location.Geocoder` を使用（Kotlinソースで確認）。**Google Maps APIキーは不要**（プラットフォームのジオコーダを使う）。
  - Android公式ドキュメント:
    - 「Use the `isPresent()` method to determine whether a Geocoder implementation exists on the current device. If no implementation is present, any attempt to geocode will result in an error.」
    - 「**Warning: This API may hit the network**, and may block for excessive amounts of time. It's strongly encouraged to use the asynchronous version of this API...」
    - 戻り値について「Returns null or empty list if no matches were found **or there is no backend service available**.」
    - 「Geocoding services may provide no guarantees on availability or accuracy... Do not use this API for any safety-critical or regulatory compliance purpose.」
  - → **ネットワーク（Googleのバックエンドサービス）に依存**します。オフラインでの動作保証は公式に無い。
- 未確認・不明点:
  - 完全オフライン時の挙動（例外になるか空配列になるか）は公式に明記なし＝**未確認**。実機の機内モードで要検証。
  - Google Play services が無い端末（Huawei等）での挙動は未確認。
  - iOS側のネットワーク要件（未確認）。

### 1.4 レート制限・同時呼び出しの注意（公式記載）

- 確認日: 2026-10-30
- 情報源URL: https://docs.expo.dev/versions/latest/sdk/location.md （geocodeAsync / reverseGeocodeAsync のNote）
- 確認できた事実（公式の注意書き）:
  - 「**Geocoding is resource consuming and has to be used reasonably. Creating too many requests at a time can result in an error, so they have to be managed properly.** It's also discouraged to use geocoding while the app is in the background and its results won't be shown to the user immediately.」
  - → **同時多発リクエストはエラーになり得る**ため、呼び出しは直列化・デバウンス等で管理する必要がある（具体的な数値上限は公式に記載なし）。
  - Android実装では、アプリがバックグラウンドに回ると `mGeocoderPaused` が立ち、以降 `"Geocoder is not running"` 例外を投げる実装になっている（`LocationModule.kt`）。
- 未確認・不明点:
  - 「何件/秒まで」等の**数値のレート制限は公式に明記なし**（未確認。プラットフォーム依存）。
  - iOSのレート制限（未確認）。

### 1.5 実装上の意味（場所検索）

- Expo Goで検証可能。APIキー不要。ただし **Androidでは位置情報権限が必要**、**ネットワーク必須**、**結果は最大1件（Android）**、**レート注意（直列化）**、**Web非対応**。
- 検索結果は「緯度経度＋精度」しか返らないため、**地名・住所の候補リスト表示には向かない**（1件のみ）。UXとしては「検索語→1件確定」または「地図タップ/クリップボード」と併用する形が現実的。

---

## 2. expo-clipboard（共有テキストの貼り付け経路）

### 2.1 バージョン・Expo Go・API（正確な型）

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json （`~58.0.4`）
  - https://docs.expo.dev/versions/latest/sdk/clipboard.md
  - https://unpkg.com/expo-clipboard@58.0.4/build/Clipboard.d.ts
  - https://unpkg.com/expo-clipboard@58.0.4/build/Clipboard.types.d.ts
- 確認できた事実:
  - SDK 58 の `npx expo install expo-clipboard` は **`~58.0.4`**。
  - 対応プラットフォーム（frontmatter）: `android`, `ios`, `web`, `expo-go`。冒頭「**Android, iOS, Web, Included in Expo Go**」→ **Expo Goで動く**。
  - API（型定義で確定）:
    - `getStringAsync(options?: GetStringOptions): Promise<string>` — クリップボードの文字列を取得。空/権限拒否時は空文字。
      - `GetStringOptions = { preferredFormat?: StringFormat }`、`StringFormat.PLAIN_TEXT = 'plainText'` / `StringFormat.HTML = 'html'`（既定は PLAIN_TEXT）。
    - `setStringAsync(text: string, options?: SetStringOptions): Promise<boolean>` — 設定。Android/iOSでは常に `true`。Webでは成功可否のboolean。
      - `SetStringOptions` は `SetStringAndroidOptions`（`android.isSensitive?: boolean`）やiOSオプションを含む。
    - `hasStringAsync(): Promise<boolean>` — テキストがあるか（plain text / rich text の両方で true）。
    - `getUrlAsync()/setUrlAsync()/hasUrlAsync()` — **iOS/macOSのみ**。
    - `addClipboardListener(listener: (event: ClipboardEvent) => void): EventSubscription` — クリップボード変更監視（Web/macOSではno-op）。
    - 画像系: `getImageAsync(options)`, `setImageAsync(base64, options?)`, `hasImageAsync()`。
  - いずれもAndroid/iOS/Webで「文字列取得・設定」がサポート。
- 未確認・不明点:
  - Expo Go同梱のexpo-clipboard実バージョン（未確認）。

### 2.2 Android 10+ のクリップボード読み取り制限

- 確認日: 2026-10-30
- 情報源URL: https://developer.android.com/about/versions/10/privacy/changes （Limited access to clipboard data）
- 確認できた事実（Android公式）:
  - 「**Unless your app is the default input method editor (IME) or is the app that currently has focus, your app cannot access clipboard data on Android 10 or higher.**」
  - → **アプリがフォーカスを持っている間だけ**クリップボード読取が可能。ユーザーがアプリ内で「貼り付け」ボタンを押す通常UXは問題ないが、バックグラウンドでの読取・自動監視は不可。
  - 補足: Android 13+ではクリップボードプレビューが表示される。expo-clipboardは `setStringAsync(text, { android: { isSensitive: true } })` で `EXTRA_IS_SENSITIVE` を設定でき、プレビュー非表示・キーボードのプレビュー抑止に使える（公式expo-clipboardドキュメントに記載）。
- 未確認・不明点:
  - expo-clipboard公式ドキュメントにはAndroid 10+の「フォーカス必須」制限の明記が無い（Androidプラットフォームの仕様として記載）。`hasStringAsync()` も同じ制限を受けると解釈されるが、**expo-clipboard固有の記載は未確認**。
  - Android 12+の「クリップボードアクセス通知」の詳細挙動は未確認。

---

## 3. expo-linking / ディープリンク

### 3.1 バージョン・Expo Go・API（正確な型）

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json （`~58.0.15`）
  - https://docs.expo.dev/versions/latest/sdk/linking.md
  - https://unpkg.com/expo-linking@58.0.15/build/Linking.d.ts
  - https://unpkg.com/expo-linking@58.0.15/build/Linking.types.d.ts
  - https://unpkg.com/expo-linking@58.0.15/build/createURL.d.ts
- 確認できた事実:
  - SDK 58 の `npx expo install expo-linking` は **`~58.0.15`**。
  - 対応プラットフォーム: `android`, `ios`, `web`, `tvos`, `expo-go`。冒頭「**Android, iOS, tvOS, Web, Included in Expo Go**」→ **Expo Goで動く**。
  - API（型定義で確定）:
    - `getInitialURL(): Promise<string | null>` — アプリを起動したURL（無ければ null）。
    - `addEventListener(type: 'url', handler: URLListener): EmitterSubscription` — 起動中に届くURL。`URLListener = (event: { url: string; nativeEvent?: MessageEvent }) => void`。戻り値は `remove()` 可能。
    - `useLinkingURL(): string | null` — 推奨フック（initial URL + 以降の変更）。`useURL()` は**非推奨**。
    - `parseInitialURLAsync(): Promise<ParsedURL>` — initial URLをparseしたもの。
    - `parse(url: string): ParsedURL` — `{ scheme: string|null; hostname: string|null; path: string|null; queryParams: Record<string, undefined|string|string[]> | null }`。
    - `createURL(path: string, options?: { scheme?: string; queryParams?: QueryParams; isTripleSlashed?: boolean }): string`。
    - `openURL(url: string): Promise<true>` — OSにURLを開かせる（`tel:`, `geo:` 等も渡せる）。
    - `canOpenURL(url: string): Promise<boolean>` — Androidで判定不能時はreject、iOSは `LSApplicationQueriesSchemes` 未登録だと判定不可（公式注記）。
    - `unwrapDevLaunchURL(url: string): string` — **SDK 58の新API**。Expo Go / development buildの「launcherコマンド」URL（`__expo_*`予約クエリ、または旧`expo-development-client`ホストの`url`パラメータ）から、アプリが本来処理すべきURLを取り出す。
    - `clearInitialURL()`, `getLinkingURL()`, `openSettings()`。
- 未確認・不明点:
  - Expo Go同梱のexpo-linking実バージョン（未確認）。

### 3.2 Expo Go でのパス付きURL受信（`--` の意味）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/linking/into-your-app.md （Test a link using Expo Go / Handle URLs / Parse URLs）
  - https://unpkg.com/expo-linking@58.0.15/build/createURL.js （parse実装）
- 確認できた事実:
  - Expo GoのURLは既定で **`exp://`**。開発時の完全なURLは `exp://127.0.0.1:8081`。
  - パスを指定する場合は **`/--/` を挟む**。公式例:
    `npx uri-scheme open exp://127.0.0.1:8081/--/somepath/into/app?hello=world --ios`
  - 公式説明: 「**In Expo Go, `/--/` is added to the URL when a path is specified. This indicates to Expo Go that the substring after it corresponds to the deep link path and is not part of the path to the app itself.**」
  - `exp://` はExpo Goで開くときに既定で `http://` に置き換えられる。`exps://` は `https://`。
  - 受け取り方法: `Linking.useLinkingURL()`（内部で `getInitialURL()` + `addEventListener('url', ...)`）、または `Linking.parse(url)` で `path`/`queryParams` を取り出す。
  - `parse()` の実装（unpkgの実JSで確認）: Expoホストかつカスタムスキーム無しの場合、**`/--/` 以降の部分を deep link path として切り出す**（先頭の `/--/` プレフィックスを除去して `path` を返す）。したがって `exp://127.0.0.1:8081/--/set?lat=35.6&lon=139.7` は `path: "set"`, `queryParams: { lat: "35.6", lon: "139.7" }` になる（実装からの確定）。
  - `createURL('/set', { queryParams: { lat, lon } })` はExpo Goでは `exp://<host>:<port>/--/set?lat=..&lon=..` を生成する（実装で `/--/` を挿入）。
  - **SDK 58のlauncherコマンド**: Expo Go / development buildは `__expo_*` で始まる予約クエリをlauncherコマンドとして扱う（`__expo_url` にターゲットURLを入れる等）。`getInitialURL()` がlauncher URLを返す場合に備え、**`unwrapDevLaunchURL()` を通してから `parse()` する**のがSDK 58の推奨（`unwrapDevLaunchURL` の型コメントで明記）。
- 未確認・不明点:
  - **物理Android端末**で `exp://.../--/...` をadb/uri-scheme経由で開いた場合の挙動（公式例はiOS/シミュレータ中心。`npx uri-scheme` の `--android` でも可能と記載があるが、実機での検証は未実施＝未確認）。
  - Expo Goの「公開アップデート」でのURL挙動は「undefined / 依存しないこと」と公式に明記（未確認ではなく「保証なし」）。
  - `unwrapDevLaunchURL` を挟むべき具体的なケース（どのlauncherコマンドが付与されるか）は未確認。

### 3.3 カスタムスキーム（`yoridorimidori://`）と development build

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/linking/into-your-app.md
  - https://docs.expo.dev/develop/development-builds/faq.md （Expo Goの不可事項）
- 確認できた事実:
  - カスタムスキームは `app.json` の `expo.scheme` に追加する（例: `"scheme": "myapp"`）。
  - 公式: 「After adding a custom scheme to your app, you need to **create a new development build**. Once the app is installed on a device, you can open links within your app using `myapp://`.」
  - `scheme` が未定義の場合、prebuildが `android.package` / `ios.bundleIdentifier` を既定スキームとして追加する。
  - Expo GoのFAQ: 「Expo Go ... comes with a fixed set of native libraries built in ... **it can't be changed after you install it**. To add new native libraries or change things like your app name and icon, you need to build your own native app (a development build).」／Android App Links・iOS Universal Linksは「**impossible with Expo Go** due to native code immutability」。
  - → **カスタムスキーム `yoridorimidori://` の受信はExpo Goでは不可、development build必須**という理解で**正しい**（Expo Goは `exp://` のみ）。
- 未確認・不明点:
  - dev buildに `scheme` を追加してからの再ビルド手順の詳細（prebuild/EAS）は前回のdeploy調査を参照。実機でのカスタムスキーム動作は未検証。

---

## 4. Googleマップ（Android）の「共有」内容と取り込み

### 4.1 公式に確定しているURI/URL形式（Google公式ドキュメント）

- 確認日: 2026-10-30
- 情報源URL:
  - https://developer.android.com/guide/components/intents-common#Maps （Google Maps intents for Android）
  - https://developers.google.com/maps/documentation/urls/get-started （Google Maps URLs）
- 確認できた事実:
  - Android intentsで文書化されている `geo:` URI:
    - `geo:latitude,longitude` — 指定位置の地図を表示（例 `geo:47.6,-122.3`）
    - `geo:latitude,longitude?z=zoom` — ズーム指定（例 `geo:47.6,-122.3?z=11`）
    - `geo:0,0?q=lat,lng(label)` — ラベル付きで表示（例 `geo:0,0?q=34.99,-106.61(Treasure)`）
    - `geo:0,0?q=my+street+address` — 住所検索（例 `geo:0,0?q=1600+Amphitheatre+Parkway%2C+CA`）
  - Google Maps URLs（クロスプラットフォーム、**APIキー不要**）:
    - `https://www.google.com/maps/search/?api=1&query=...` — `query` 必須。**`query=緯度,経度` も公式に許容**（例: `https://www.google.com/maps/search/?api=1&query=47.5951518%2C-122.3316393`）。`query_place_id` 任意。
    - `https://www.google.com/maps/dir/?api=1&...`（経路）、`https://www.google.com/maps/@?api=1&map_action=map&center=lat,lng&zoom=z`（地図表示）。
    - `api=1` は必須。URLは2,048文字以内・エンコード必須。Mapsアプリが入っていればアプリで、無ければブラウザで開く。
- 未確認・不明点:
  - **Googleマップアプリの「共有」で生成されるテキストの正確な形式**は公式ドキュメントに記載が無い（アプリのUI仕様）。端末の言語・アプリのバージョンで変わる可能性がある＝**未確認**。代表例（場所名 + `https://maps.app.goo.gl/...` 等）は実機で採取して確定させる必要がある。
  - **ピンをドロップして共有した場合に緯度経度がテキストにそのまま含まれるか**は未確認（実機で採取）。
  - `geo:` 形式がGoogleマップの共有メニューから出るケースは未確認（`geo:` はAndroidのintent用の形式として文書化されている）。

### 4.2 短縮リンク `maps.app.goo.gl` の解決

- 確認日: 2026-10-30
- 情報源URL: 上記Google公式ドキュメント（短縮リンク解決のAPI仕様は記載なし）
- 確認できた事実:
  - Google公式ドキュメントには、**`maps.app.goo.gl` のHTTPリダイレクト仕様・展開先URLの形式・APIとしての利用可否は記載されていない**。
  - Google Maps URLsは「`https://www.google.com/maps/...` を開く」ためのもので、短縮リンクを解決する公式APIは見当たらない。
- 未確認・不明点:
  - `maps.app.goo.gl` へのHTTP GET/HEADで `Location` ヘッダに展開先URLが入るか、展開先に緯度経度が含まれる形式（`/maps?q=lat,lng` 等）かは**未確認**。確認手順の例（実機/PCで実施）:
    - `curl -sI "https://maps.app.goo.gl/<実際の共有リンク>"` でステータス（301/302）と `Location` ヘッダを確認
    - Node.jsなら `fetch(url, { redirect: 'manual' })` で `res.status` と `res.headers.get('location')` を確認
  - 短縮リンクは**ネットワーク必須**で、Googleの仕様変更・レート制限のリスクがある。**アプリの正式な取り込み経路として依存するのは推奨しない**（非公式）。
  - 実機でGoogleマップの共有テキストを採取し、①`https://maps.app.goo.gl/...` 形式か ②`geo:` 形式か ③緯度経度が本文に含まれるか、を確認するのが先決（未確認のため）。

### 4.3 取り込み方針（調査結果からの示唆）

- クリップボード経由で共有テキストを受け取る場合、**公式に形式が保証されているのは「Google Maps URLs（`https://www.google.com/maps/search/?api=1&query=lat,lng`）」と「`geo:lat,lng`」のみ**。共有アプリが生成するテキストは非公式なので、**複数パターンのパーサ（query=lat,lng / q=lat,lng / geo:lat,lng / 生の "lat, lng"）を用意し、抽出できた場合のみ目的地設定に使う**のが安全。短縮リンクのみの場合は「解決できない可能性がある」旨のUX（ユーザーに地図タップを促す等）が必要。

---

## 5. 共有インテント（ACTION_SEND）の受け取り

### 5.1 Expo Go では ACTION_SEND を受け取れない（根拠）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/develop/development-builds/faq.md
  - https://github.com/achorein/expo-share-intent （README）
  - https://developer.android.com/guide/components/intents-filters （intent-filter / ACTION_SEND）
- 確認できた事実:
  - Expo公式FAQ:
    - 「Expo Go ... comes with a **fixed set of native libraries built in** ...」
    - 「Expo Go is a pre-built native app that works like a playground — **it can't be changed after you install it**. To add new native libraries or **change things like your app name and icon**, you need to build your own native app (a development build).」
    - 「There is **no way to get the native code into the Expo Go app** unless it was already included in the bundle that was uploaded to the app stores.」
  - → ACTION_SENDを受け取るには、**AndroidManifestに`<intent-filter>`（`android.intent.action.SEND` + `text/plain`等）を追加**する必要があるが、これはExpo Goのネイティブアプリには存在せず、変更できない。**したがってExpo Goでは不可、development build必須**。
  - expo-share-intentのREADMEも明記: 「**We are using native code to make share intent works, so we can't use Expo Go and have to use a custom dev client**」。Expo Goでクラッシュを避けたい場合は `useShareIntent({ disabled: true })` でネイティブ呼び出しを無効化できる、とも記載。
- 未確認・不明点:
  - Expo Go SDK 58 での具体的なエラー挙動（パッケージimport時に落ちるか等）は未確認。

### 5.2 実現する場合の選択肢: expo-share-intent（npm実データ＋READMEで確認）

- 確認日: 2026-10-30
- 情報源URL:
  - https://registry.npmjs.org/-/package/expo-share-intent/dist-tags
  - https://registry.npmjs.org/expo-share-intent/9.0.0
  - https://raw.githubusercontent.com/achorein/expo-share-intent/main/README.md
- 確認できた事実:
  - **npm `latest` = 9.0.0**。READMEのバージョン対応表: **Expo SDK 58 → `expo-share-intent` 9.0+**。
  - `9.0.0` の peerDependencies: `expo: ^58`, `react: *`, `react-native: *`, **`expo-linking: >=58.0.13`**, **`expo-constants: >=58.0.12`** → SDK 58 対応が型メタデータでも確認できる。
  - インストール: `npm install expo-share-intent`（またはyarn）。**`expo-linking` が必須**。v6.0以降（Expo 55+）は `patch-package` 不要（README）。
  - 設定（app.json）:
    - `plugins` に `"expo-share-intent"` を追加。**既定はテキスト/URLのみ**（`androidIntentFilters` の既定は `["text/*"]`）。
    - **`scheme` の設定が必要**（例 `"scheme": "my-app"`）。
    - カスタム設定例: `["expo-share-intent", { "androidIntentFilters": ["text/*", "image/*"], "iosActivationRules": {...} }]` など。
    - 主なプラグインオプション: `androidIntentFilters`（単一ファイル共有のMIME配列。既定 `["text/*"]`）、`androidMultiIntentFilters`（複数ファイル。既定 `[]`）、`androidMainActivityAttributes`（既定 `{ "android:launchMode": "singleTask" }`）、`iosActivationRules`、`disableAndroid`、`disableIOS` 等。
  - 開発: **development build必須**。READMEの手順は `expo prebuild --no-install --clean` → `expo run:android` / `expo run:ios`（`npx expo start` のExpo Goでは動作しない）。`ios/`・`android/` はコミットせず、EAS Build前に再生成する、と記載。
  - API:
    - `useShareIntent()` が返す: `{ hasShareIntent, shareIntent, resetShareIntent, error }`。
    - `shareIntent.text`（生テキスト。Androidは `text/*`）、`shareIntent.webUrl`（本文から抽出したURL）、`shareIntent.files`（`{ path, mimeType, fileName, size, width?, height?, duration? }`）、`shareIntent.meta`（`title` 等）。
    - 複数画面では `ShareIntentProvider` + `useShareIntentContext()` を使用（App.tsxの最上位に置く）。
  - MIME: Androidの受け取りMIMEはプラグインの `androidIntentFilters` で指定（`text/*`, `image/*`, `video/*`, `*/*` 等）。テキスト共有（Googleマップの共有）なら `text/*` を受け取ればよい。
- 未確認・不明点:
  - expo-share-intent 9.0.0 と Expo SDK 58 の**実機での動作**（未検証）。
  - Googleマップの共有が `text/plain` で届くか（実機で未確認）。
  - EAS Build（prebuild）時にプラグインが正しく適用されるか（未検証）。
  - `useShareIntent` の正確な戻り値型（READMEの記載からの整理。型定義ファイルは未精読＝未確認）。

### 5.3 代替: カスタム config plugin + ネイティブ実装の概要（調査ノート範囲）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/config-plugins/mods.md
  - https://developer.android.com/reference/android/app/Activity （`getIntent()`, `onNewIntent(Intent)`）
  - https://developer.android.com/guide/components/intents-filters （intent-filterの書き方・ACTION_SEND）
- 確認できた事実（必要な実装の概要）:
  - **config pluginのmods**で `AndroidManifest.xml` に `<intent-filter>`（`android.intent.action.SEND`, `android:mimeType="text/plain"`）を追加し、必要なら `MainActivity` の `android:launchMode` を `singleTask` などに変更する。
  - ネイティブ側は `Activity.getIntent()` で起動時のIntent、起動中は `onNewIntent(Intent)` で新しいIntentを受け取る。Android公式の `onNewIntent` の説明: 「Note that `getIntent()` still returns the original Intent. You need to call `setIntent()` to update it.」→ onNewIntent内で `setIntent(intent)` してから `intent.getStringExtra(Intent.EXTRA_TEXT)` 等を読む。
  - 受け取ったテキストはExpo Modules（JSI/イベント）経由でJSへ渡す実装が必要（expo-share-intentはこれを実装済み）。
- 未確認・不明点:
  - Expo Modules APIでIntentを受け取る具体的な実装手順（`expo-modules-core` のイベント送出）は未精読＝未確認。
  - カスタムpluginの実装コスト・保守性の評価は未確認。**既存のexpo-share-intentを使う方が現実的**（READMEでSDK 58対応が明示）。

---

## 6. その他

### 6.1 expo-web-browser / expo-intent-launcher（Googleマップアプリを開く導線）

- 確認日: 2026-10-30
- 情報源URL:
  - https://docs.expo.dev/versions/latest/sdk/webbrowser.md
  - https://docs.expo.dev/versions/latest/sdk/intent-launcher.md
  - https://unpkg.com/expo-intent-launcher@58.0.3/build/IntentLauncher.d.ts
- 確認できた事実:
  - `expo-web-browser`（SDK 58: `~58.0.7`、`android/ios/web/expo-go`、**Expo Go同梱**）:
    - `openBrowserAsync(url, options?)` は **AndroidではChrome Custom Tabs**、iOSではSFSafariViewControllerで開く。→ **Googleマップ「アプリ」ではなくブラウザ（Custom Tabs）で開く**。Googleマップアプリを直接開く用途には不適。
  - `expo-intent-launcher`（SDK 58: `~58.0.3`、`android` + `expo-go`、**Expo Go同梱**）:
    - `startActivityAsync(activityAction: ActivityAction | string, params?: IntentLauncherParams): Promise<IntentLauncherResult>`
    - `IntentLauncherParams`: `{ type?: string; category?: string; extra?: Record<string, any>; data?: string; flags?: number; packageName?: string; className?: string }`（`data` はURI。**AndroidではURIスキームを小文字にする必要**と注記）。
    - `openApplication(packageName: string): void` — **パッケージ名でアプリを開ける**（例の記載はGmailの `com.google.android.gm`）。Googleマップのパッケージ名 `com.google.android.apps.maps` を渡せばMapsアプリを開ける可能性があるが、**公式にGoogleマップの例は無い＝未確認**。
  - より簡便なのは `Linking.openURL('geo:35.6586,139.7454?q=35.6586,139.7454(目的地)')`（`geo:` はAndroid公式でMapsが処理する形式）。`canOpenURL` はAndroidで判定不能時にrejectする点に注意（公式）。
- 未確認・不明点:
  - `Linking.openURL('geo:...')` や `IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: 'geo:...', packageName: 'com.google.android.apps.maps' })` で**Googleマップアプリが確実に起動するか**（公式例なし・実機未検証）。Maps未インストール端末での挙動も未確認。

### 6.2 地名検索を外部APIキーなしで行う手段

- 確認日: 2026-10-30
- 情報源URL: 上記 §1（expo-location）、https://docs.expo.dev/versions/latest/sdk/location.md
- 確認できた事実:
  - **Expo SDK内で地名検索（フォワードジオコーディング）を提供するのは `expo-location.geocodeAsync()` のみ**（Androidは `android.location.Geocoder`、APIキー不要）。
  - 他のExpo SDKパッケージに地名検索APIは見当たらない（`expo-maps` は地図表示、`expo-location` 以外に検索APIなし）。
  - 外部サービス（OpenStreetMap Nominatim等）はExpo SDK外で、ネットワーク・利用規約・レート制限が別途必要。今回の「APIキーなし」要件では**expo-locationのgeocode以外に公式SDKの選択肢は「なし」**。
- 未確認・不明点:
  - iOSの `CLGeocoder` 利用の詳細（未確認）。
  - expo-location geocodeの結果順位・候補複数表示の可否（Androidは1件のみの実装）。
  - 将来SDKで追加される検索APIの有無（未確認）。

---

## 7. Expo Go で実装・検証できるもの / development build が必要なもの（線引き・再掲）

**Expo Goで実装・検証できる（今回の主戦場）**
1. 地図タップで目的地設定（react-native-maps。Expo Go同梱）
2. 場所検索: `Location.geocodeAsync(address)`（Expo Go同梱・APIキー不要・要ネットワーク・要位置権限(Android)・最大1件）
3. 逆ジオコーディング表示: `Location.reverseGeocodeAsync({latitude, longitude})`
4. クリップボード貼り付け: `Clipboard.getStringAsync()` / `hasStringAsync()`（Android 10+はフォーカス中のみ読取可）
5. ディープリンク受信: Expo Goでは `exp://<host>:<port>/--/set?lat=..&lon=..` の形式（`Linking.useLinkingURL()` + `parse()`）。**カスタムスキームは不可**
6. Googleマップアプリを開く導線（`Linking.openURL('geo:...')` または `expo-intent-launcher`。API上は可能、実機検証要）

**development buildが必要（Phase 2以降）**
1. カスタムスキーム `yoridorimidori://` の受信（公式: scheme追加後に新しいdevelopment buildを作成）
2. 共有メニュー（ACTION_SEND）からの直接受け取り（expo-share-intent 9.0.0 + SDK 58、`expo-linking` 必須、plugin + scheme設定、dev build必須）
3. Android App Links / iOS Universal Links（Expo Goでは不可と公式FAQに明記）

---

## 8. 推奨する実装方針（主軸経路）

**主軸（Expo Goで検証可能な範囲で完結させる）**
- **第1経路: 地図タップ**（`react-native-maps` の `onPress` → 座標）。最も確実で依存が少ない。
- **第2経路: 場所検索**（`Location.geocodeAsync`）。APIキー不要で Expo Go動作。ただし「結果1件・ネットワーク必須・レート注意」をUXに反映（検索中インジケータ、失敗時は地図タップへ誘導）。
- **第3経路: クリップボード貼り付け**（`Clipboard.getStringAsync` → テキストから座標/URL抽出）。Googleマップの共有テキストをユーザーがコピーして貼る運用。Android 10+のフォーカス制限は「ユーザー操作で貼り付け」なら問題なし。
- **第4経路: ディープリンク**（Expo Goは `exp://.../--/set?lat=..&lon=..`、dev build移行後は `yoridorimidori://set?lat=..&lon=..`）。`Linking.parse()` で `path === 'set'` を判定。SDK 58では `unwrapDevLaunchURL()` を先に通す。
- **補助: Googleマップアプリを開く**（`geo:` URI）。ユーザーが地図アプリで確認したい場合の導線。

**Phase 2（development build移行後）**
- **共有インテント（ACTION_SEND）**: `expo-share-intent` 9.0.0（SDK 58対応）で「Googleマップ等から直接共有」を実現。expo-linking必須・plugin/scheme設定・dev build必須。
- カスタムスキームでの深いリンク（`yoridorimidori://`）。

**各経路の長所・短所**

| 経路 | 長所 | 短所 |
| --- | --- | --- |
| 地図タップ | 確実・オフラインでも可・実装簡単 | 目的地が地図上で見つけにくいことがある |
| 場所検索（geocode） | APIキー不要・Expo Go可 | 結果1件・ネットワーク必須・レート注意・Web非対応 |
| クリップボード | 共有テキストをそのまま利用可・Expo Go可 | 形式が非公式（パーサ必要）・Androidはフォーカス中のみ読取 |
| ディープリンク（exp://） | Expo Goで検証可・外部から起動可能 | Expo GoのURLは開発サーバー依存・カスタムスキームはdev build必須 |
| 共有インテント | UX最良（共有メニューから直接） | dev build必須・expo-share-intent依存・実機検証要 |
| 短縮リンク解決 | 共有リンクから直接取り込める可能性 | 非公式・ネットワーク必須・形式未確認・依存リスク大 |

---

## 9. 未確認事項一覧

1. **expo-location geocodeの数値レート制限**（公式に明記なし。実機で連続呼び出し時のエラー発生条件を確認）。
2. **オフライン時・Google Play services非搭載端末でのgeocode挙動**（例外/空配列の別）。
3. **iOSのgeocode実装（CLGeocoderか）と返却件数**。
4. **Googleマップの共有テキストの正確な形式**（端末言語/バージョン依存の可能性）。ピン共有時に緯度経度が本文に含まれるか。
5. **`maps.app.goo.gl` 短縮リンクのHTTPリダイレクト挙動**（`Location` ヘッダ、展開先URLに緯度経度が含まれるか）。実リンクで `redirect: 'manual'` により検証する必要。
6. **ACTION_SEND（共有メニュー）がGoogleマップから `text/plain` で届くか**（実機未確認）。
7. **expo-share-intent 9.0.0 の実機動作・EAS Build（prebuild）での適用**。`useShareIntent` の型定義の精読。
8. **`Linking.openURL('geo:...')` / `expo-intent-launcher` でGoogleマップアプリが確実に起動するか**（公式例なし）。
9. **物理Android端末で `exp://.../--/...` ディープリンクが開けるか**（公式例はiOS/シミュレータ中心）。
10. **expo-clipboardのAndroid 10+制限の公式ドキュメント記載**（Androidプラットフォーム仕様として確認。expo-clipboard固有の記載は未確認）。
11. **Expo Go 各パッケージ（location/clipboard/linking）の同梱実バージョン**（未確認）。
12. **Webプレビュー時の地名検索代替**（geocodeがWeb非対応。Webでは使えない＝未確認ではなく仕様）。

---

## 10. 情報源一覧（すべて 2026-10-30 取得）

| 情報源 | URL | 確認した内容 |
| --- | --- | --- |
| expo-location 公式 | https://docs.expo.dev/versions/latest/sdk/location.md | geocode/reverseGeocode、Expo Go対応、Android権限、レート注意、型 |
| expo-location 型定義 | https://unpkg.com/expo-location@58.0.20/build/Location.d.ts / https://unpkg.com/expo-location@58.0.20/build/Location.types.d.ts | 正確なシグネチャ、GeocodedLocation/Address全フィールド |
| expo-location Android実装 | https://unpkg.com/expo-location@58.0.20/android/src/main/java/expo/modules/location/LocationModule.kt | `android.location.Geocoder`、maxResults=1、権限チェック、バックグラウンドpause |
| Android Geocoder | https://developer.android.com/reference/android/location/Geocoder | `isPresent()`、ネットワーク依存、バックエンド無し時は空/null、保証なし |
| expo-clipboard 公式 | https://docs.expo.dev/versions/latest/sdk/clipboard.md | Expo Go対応、API、isSensitive |
| expo-clipboard 型定義 | https://unpkg.com/expo-clipboard@58.0.4/build/Clipboard.d.ts / .../Clipboard.types.d.ts | getStringAsync/setStringAsync/hasStringAsync、GetStringOptions等 |
| Android 10 privacy | https://developer.android.com/about/versions/10/privacy/changes | Android 10+のクリップボード読取制限（フォーカス必須） |
| expo-linking 公式 | https://docs.expo.dev/versions/latest/sdk/linking.md | API一覧、Expo Go、scheme、parse/createURL、unwrapDevLaunchURL |
| expo-linking 型定義/実装 | https://unpkg.com/expo-linking@58.0.15/build/Linking.d.ts / .../createURL.d.ts / .../createURL.js / .../devLaunchURL.d.ts | 正確な型、`/--/`のparse実装、launcherコマンド解決 |
| Linking into your app | https://docs.expo.dev/linking/into-your-app.md | `exp://.../--/...` の公式書式、`/--/`の意味、scheme追加→dev build |
| Expo Go FAQ | https://docs.expo.dev/develop/development-builds/faq.md | Expo Goの固定ネイティブ・変更不可・App Links不可 |
| Android intents（Maps） | https://developer.android.com/guide/components/intents-common#Maps | `geo:` URIの公式形式 |
| Google Maps URLs | https://developers.google.com/maps/documentation/urls/get-started | `api=1`、`query=lat,lng`、directions、URL長 |
| expo-share-intent npm | https://registry.npmjs.org/-/package/expo-share-intent/dist-tags / https://registry.npmjs.org/expo-share-intent/9.0.0 | latest 9.0.0、peerDependencies（expo ^58, expo-linking >=58.0.13） |
| expo-share-intent README | https://raw.githubusercontent.com/achorein/expo-share-intent/main/README.md | SDK58対応表（9.0+）、plugin設定、dev build必須、API、MIME |
| expo-intent-launcher 公式 | https://docs.expo.dev/versions/latest/sdk/intent-launcher.md / https://unpkg.com/expo-intent-launcher@58.0.3/build/IntentLauncher.d.ts | startActivityAsync、IntentLauncherParams、openApplication、Expo Go対応 |
| expo-web-browser 公式 | https://docs.expo.dev/versions/latest/sdk/webbrowser.md | openBrowserAsyncがCustom Tabs/SFSafariViewController、Expo Go対応 |
| Config plugin mods | https://docs.expo.dev/config-plugins/mods.md | AndroidManifest/MainActivityを変更する手段 |
| Android Activity | https://developer.android.com/reference/android/app/Activity | getIntent()/onNewIntent()、setIntentの注意 |
| Android intents guide | https://developer.android.com/guide/components/intents-filters | intent-filter、ACTION_SEND |
| SDK 58 bundled versions | https://unpkg.com/expo@58.0.21/bundledNativeModules.json | expo-location/clipboard/linking/webbrowser/intent-launcherの実バージョン |

---

## 8. 地図の代替案（課金回避・2026-10-30 追加）

Google Maps SDK は API キーと従量課金（無料枠あり）が必要。本アプリは **OpenStreetMap のラスタータイル**を採用した（無料・キー不要）。

| 方式 | コスト | キー | 備考 |
|---|---|---|---|
| **OSM ラスタータイル（採用）** | 無料 | 不要 | `tile.openstreetmap.org`。帰属表示必須・大量アクセス禁止。プロトタイプ〜小規模向け |
| MapLibre GL + 無料タイル | 無料枠あり | 不要/キー | ベクター地図。`@maplibre/maplibre-react-native` は dev build 必須 |
| MapTiler / Stadia Maps / Thunderforest | 無料枠あり（要登録） | 必要 | 商用利用可・SLA あり。タイル品質・制限が明確 |
| 自前タイルサーバ（OSM データ + TileServer GL 等） | サーバ費用 | 不要 | 完全自前。運用コスト大 |
| Google Maps | 従量課金（無料枠） | 必要 | 本アプリでは不採用（キー無しビルドでクラッシュするため） |

- 本アプリの地図は「目的地選択の補助」用途のため、OSM ラスターで十分。
- 利用が増えた場合は、上記の無料枠プロバイダへ切り替える（`osmTileUrl` の URL テンプレートを差し替えるだけで対応可能な設計）。

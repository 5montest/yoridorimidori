# UI実装 前提API調査ノート（react-native-svg / Animated / AppState / performance）

- 調査日: **2026-10-30**（Asia/Tokyo）
- 目的: UI実装（T22: 鳥の描画と回転）の前に、architecture.md §18 の未確認項目を一次情報で確定する。
- 対象環境: **Expo SDK 58 / React Native 0.88.1 / React 19.3.0**（Expo Go SDK 58もRN 0.88.1を同梱。前回調査 `docs/research/library-api-notes.md` §1参照）
- 情報源: npmレジストリ実データ、unpkgで取得した**公開パッケージ内の型定義・実装ソース**、React Native公式ドキュメント、Expo公式ドキュメント。すべて確認日 2026-10-30。
- 制約: 本セッションでは `web_search` / `web_fetch` がAPIキー未設定で利用できなかったため、Node.jsのHTTPSクライアントで一次情報URLを直接取得した。**推測は排除**し、一次情報で確定できない事項は「未確認」と明記した。
- シンボル凡例: `NumberProp = string | number`（react-native-svgの型定義）。`ColorValue` はRNの公開型。

---

## 1. react-native-svg 15.16.0

### 1.1 バージョン・Expo SDK 58での扱い・Expo Go

- 確認日: 2026-10-30
- 情報源URL:
  - https://registry.npmjs.org/-/package/react-native-svg/dist-tags
  - https://unpkg.com/expo@58.0.21/bundledNativeModules.json
  - https://docs.expo.dev/versions/latest/sdk/svg.md
- 確認できた事実:
  - npm `latest` = **15.16.0**（指定どおり）。
  - **Expo SDK 58 の `npx expo install react-native-svg` は 15.16.0 を入れる**（`bundledNativeModules.json` の値が `15.16.0`）。
  - Expo公式ドキュメントの対応プラットフォーム: `android`, `ios`, `macos`, `web`, `tvos`, `expo-go`。ページ冒頭表記は「**Android, iOS, macOS, tvOS, Web, Included in Expo Go**」→ **Expo Goで動く**（SDK 58のExpo Goに同梱）。
  - インストールは `npx expo install react-native-svg`。**config pluginの記載は無い**（Expoページにpluginのセクションなし）。
- 未確認・不明点:
  - Expo Goに同梱されているreact-native-svgの実バージョン（Expo docsに明記なし。`npx expo install`の解決値は15.16.0）。
  - Expo Go実機でのSVG描画性能（多数要素・アニメーション時のFPS）は未測定。

### 1.2 エクスポート（import形式）

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/react-native-svg@15.16.0/lib/typescript/ReactNativeSVG.d.ts
  - https://unpkg.com/react-native-svg@15.16.0/lib/typescript/index.d.ts
  - https://docs.expo.dev/versions/latest/sdk/svg.md
- 確認できた事実:
  - デフォルトエクスポートは `Svg`（`export { default } from './elements'`）。
  - 名前付きで `Svg`, `Path`, `Circle`, `G`, `Polygon`, `Rect`, `Ellipse`, `Line`, `Polyline`, `Defs`, `LinearGradient`, `RadialGradient`, `Text`, `TSpan`, `ClipPath`, `Mask`, `Marker`, `Pattern`, `Symbol`, `Use`, `Image`, `ForeignObject` 等をexport。
  - Props型もexport: `SvgProps`, `PathProps`, `CircleProps`, `GProps`, `PolygonProps` ほか（`export type { ... } from './elements/...'`）。
  - 公式の使用例（Expoドキュメント）: `import Svg, { Circle, Rect, SvgProps } from 'react-native-svg';`
- 未確認・不明点: なし（型定義ファイルと公式使用例で一致）。

### 1.3 各コンポーネントの正確な props（型定義で確定）

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/react-native-svg@15.16.0/lib/typescript/elements/Svg.d.ts
  - https://unpkg.com/react-native-svg@15.16.0/lib/typescript/elements/Path.d.ts
  - https://unpkg.com/react-native-svg@15.16.0/lib/typescript/elements/Circle.d.ts
  - https://unpkg.com/react-native-svg@15.16.0/lib/typescript/elements/G.d.ts
  - https://unpkg.com/react-native-svg@15.16.0/lib/typescript/elements/Polygon.d.ts
  - https://unpkg.com/react-native-svg@15.16.0/lib/typescript/lib/extract/types.d.ts
- 確認できた事実:

  **Svg**（`SvgProps extends GProps, ViewProps, HitSlop`）
  - `width?: NumberProp`
  - `height?: NumberProp`
  - `viewBox?: string`（例: `"0 0 100 100"`）
  - `preserveAspectRatio?: string`（既定値はライブラリ側で設定）
  - `color?: ColorValue`
  - `title?: string`
  - G のprops（後述）＋ View のprops（`style`, `onLayout` 等）も継承。
  - メソッド: `measureInWindow(callback)`, `measure(callback)`, `measureLayout(...)`, `setNativeProps(...)`, `toDataURL(callback, options?)`。

  **Path**（`PathProps extends CommonPathProps`）
  - `d?: string`（SVGパス文字列）
  - `opacity?: NumberProp`
  - 共通props（後述）をすべて持つ。

  **Circle**（`CircleProps extends CommonPathProps`）
  - `cx?: NumberProp` / `cy?: NumberProp` / `r?: NumberProp`
  - `opacity?: NumberProp`
  - 既定値（static defaultProps）: `cx: 0, cy: 0, r: 0`

  **G**（`GProps extends CommonPathProps, FontProps`）
  - `children?: ReactNode`
  - `opacity?: NumberProp`
  - 共通props（`transform`, `fill`, `stroke` 等）を継承 → **G要素にtransformをかけられる**。

  **Polygon**（`PolygonProps extends CommonPathProps`）
  - `points?: string | ReadonlyArray<NumberProp>`（例: `"40,5 70,80 25,95"` または `[40,5,70,80,25,95]`）
  - `opacity?: NumberProp`

  **共通props（`CommonPathProps`）の内訳**
  - 色: `color?: ColorValue`
  - 塗り: `fill?: ColorValue`, `fillOpacity?: NumberProp`, `fillRule?: 'evenodd' | 'nonzero'`
  - 線: `stroke?: ColorValue`, `strokeWidth?: NumberProp`, `strokeOpacity?: NumberProp`, `strokeDasharray?: ReadonlyArray<NumberProp> | NumberProp`, `strokeDashoffset?: NumberProp`, `strokeLinecap?: 'butt' | 'square' | 'round'`, `strokeLinejoin?: 'miter' | 'bevel' | 'round'`, `strokeMiterlimit?: NumberProp`
  - 変形: `transform`（次節で詳述）＋非推奨の `rotation` / `translateX` / `translateY` / `scale` / `origin` 等
  - クリップ: `clipRule?: 'evenodd' | 'nonzero'`, `clipPath?: string`
  - マーカー: `marker`, `markerStart`, `markerMid`, `markerEnd`
  - マスク/フィルタ: `mask?: string`, `filter?: string`
  - 定義: `id?: string`
  - タッチ: `onPress`, `onPressIn`, `onPressOut`, `onLongPress`, `disabled` 等（`TouchableProps`）
  - アクセシビリティ: `accessibilityLabel?: string`, `accessible?: boolean`, `testID?: string`
  - レイアウト: `onLayout?: (event: LayoutChangeEvent) => void`
  - `pointerEvents`（`ResponderProps`）
  - 注意: **`opacity` は `CommonPathProps` には含まれず**、Path/Circle/G/Polygon各コンポーネント側で定義されている。
- 未確認・不明点:
  - `fill`/`stroke` の既定値（SVG仕様上は fill=black, stroke=none）はreact-native-svg公式ドキュメントに明記が無いため未確認。実装では `fill="none"` を明示するのが安全（公式USAGE.mdにも `fill="none"` の例あり）。
  - `ColorValue` のうち `currentColor` 等の文字列解決の全パターンは未確認（USAGE.mdに `stroke="currentColor"` の例はある）。

### 1.4 `transform` prop が受け付ける形式（最重要）

- 確認日: 2026-10-30
- 情報源URL:
  - 型: https://unpkg.com/react-native-svg@15.16.0/lib/typescript/lib/extract/types.d.ts
  - 実装: https://unpkg.com/react-native-svg@15.16.0/src/lib/extract/extractTransform.ts
  - RNのtransform仕様: https://reactnative.dev/docs/transforms
- 確認できた事実:
  - 型は `transform?: ColumnMajorTransformMatrix | string | TransformsStyle['transform']`。
    1. **6要素の数値配列**（`ColumnMajorTransformMatrix = [number, number, number, number, number, number]`、列優先行列 `[a, b, c, d, tx, ty]`）
    2. **SVG構文の文字列**（例: `"rotate(45 50 50)"`, `"translate(10,20) scale(2)"`）
    3. **React Nativeのtransform配列**（例: `[{ rotate: '45deg' }]`、`[{ translateX: 10 }, { scale: 2 }]`）。RN側の型は「配列 of オブジェクト」または「スペース区切りの文字列」（RN公式Transformsドキュメント）。
  - 実装ソース（`extractTransform.ts`）でも上記すべてを分岐処理していることを確認:
    - 配列かつ先頭が数値 → 6要素行列として適用
    - 配列（オブジェクト） → `stringifyTransformArrayProps` で `translate(x, 0)` / `rotate(deg)` / `scale(...)` / `skewX(...)` 等のSVG文字列に変換してからパース
    - 文字列 → SVG transform パーサでパース
    - 旧props（`rotation`, `translateX`, ...） → `props2transform` で変換
  - **回転は文字列で指定**（`deg` / `rad` の接尾辞が必要）。RN transform形式では `[{rotate: '45deg'}]`、SVG形式では `"rotate(45)"`（度）。
  - 変換実装内で「角度の正規化」「matrixの合成」が行われる（`Matrix2D.ts`: `append`, `appendTransform`, `toArray`）。
- 未確認・不明点:
  - react-native-svg公式サイト（USAGE.md等）に「RN形式のtransform配列」が明示的に記載されているかは確認できていない（型定義と実装ではサポート）。→ 実装では**SVG文字列形式**か**6要素matrix**を使うのが最も確実。
  - `transformOrigin` に相当する指定方法（react-native-svgでは旧 `originX/originY` が非推奨、`transform` 内の回転中心指定はSVG構文の `rotate(angle cx cy)` で可能）の公式推奨は未確認。

### 1.5 Animated値との組み合わせ（T22の設計判断に直結）

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/react-native-svg@15.16.0/src/lib/extract/extractTransform.ts
  - https://unpkg.com/react-native-svg@15.16.0/lib/typescript/lib/extract/types.d.ts
  - https://docs.expo.dev/versions/latest/sdk/svg.md （「support for interactivity and animation」とあるが具体APIの記載なし）
- 確認できた事実:
  - react-native-svgのtransform抽出実装は、受け取った値を**数値/文字列として行列化**する（`stringifyTransformArrayProps` は `${value}` で文字列化）。
  - 型上は `TransformsStyle['transform']` が `AnimatedNode` を許容するが（RNの型が `rotate: string | AnimatedNode` のため）、**SVG側の抽出処理はAnimatedNodeを解釈しない**。Animated値を渡すと文字列化されてパースに失敗する（`console.error` して identity になる分岐あり）。→ **SVG要素の `transform` prop をAnimatedで駆動するのは不適切**。
  - Expoドキュメントには「interactivity and animation をサポート」とあるが、**AnimatedをSVG propsに直接渡す公式API・公式例は確認できなかった**。
  - したがってT22では **`<Svg>` 全体を `<Animated.View>` で包み、View側の `transform: [{ rotate: ... }]` をアニメーションする**構成をとる（Viewの回転は §2 で確定）。SVG内部の図形は静的描画。
- 未確認・不明点:
  - SVG要素のtransformにAnimated値を渡した場合の実機挙動（実際に無視される/警告が出る等）は未検証。**仕様として意図されていない**というのがソースからの結論。
  - react-native-svgが独自にサポートするAnimated連携（`Animated.createAnimatedComponent(Path)` 等）の公式成否は未確認。T22では使わない。

---

## 2. React Native 0.88.1 `Animated`

### 2.1 型定義の所在（前提）

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/react-native@0.88.1/package.json （`exports["."].types = "./types_generated/index.d.ts"`）
  - https://unpkg.com/react-native@0.88.1/types_generated/index.d.ts
- 確認できた事実:
  - RN 0.88.1は**パッケージ内にTypeScript型を同梱**（`types_generated/`）。`@types/react-native` は不要。
  - 公開export: `Animated`（`export { default as Animated } from "./Libraries/Animated/Animated"`）、`Easing`、`useAnimatedValue`、`AppState`、型 `AppStateStatus`, `EventSubscription` など。
  - Expo Go SDK 58はRN 0.88.1を同梱（前回調査のversions APIで確認: `facebookReactNativeVersion: 0.88.1`）。
- 未確認・不明点: なし。

### 2.2 `Animated.Value`

- 確認日: 2026-10-30
- 情報源URL: https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/nodes/AnimatedValue.d.ts
- 確認できた事実:
  - `new Animated.Value(value: number, config?: AnimatedValueConfig)`
    - `AnimatedValueConfig = Readonly<Omit<AnimatedNodeConfig, "useNativeDriver"> & { useNativeDriver: boolean }>`（configを渡す場合 `useNativeDriver` が必須という型）
    - 通常は `new Animated.Value(0)` のようにconfig省略で使う。
  - メソッド:
    - `setValue(value: number): void` — アニメーションを止めて値を即時設定
    - `addListener(callback: ({ value: number }) => unknown): string` — 更新を非同期に受ける。戻り値のIDを `removeListener(id)` に渡す
    - `removeListener(id: string): void`
    - `stopAnimation(callback?: (value: number) => void): void`
    - `resetAnimation(callback?: (value: number) => void): void`
    - `setOffset(offset: number)`, `flattenOffset()`, `extractOffset()`
    - `interpolate<OutputT>(config): AnimatedInterpolation<OutputT>`（§2.5）
  - `Animated.Value` のインスタンスは `AnimatedValue` 型。1つのValueは**同時に1つの駆動源**（新しいアニメーション/setValueで前の駆動は止まる）。
- 未確認・不明点:
  - `useNativeDriver` を `new Animated.Value()` のconfigに渡した場合の挙動（型上は要求されるが、通常は渡さずアニメーション側で指定）は未確認。

### 2.3 `Animated.timing` / `Animated.spring` / `CompositeAnimation`

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/AnimatedImplementation.d.ts
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/animations/TimingAnimation.d.ts
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/animations/SpringAnimation.d.ts
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/animations/Animation.d.ts
- 確認できた事実:
  - `Animated.timing(value: AnimatedValue | AnimatedValueXY | AnimatedColor, config: TimingAnimationConfig): CompositeAnimation`
    - `TimingAnimationConfig`:
      - `toValue: number | AnimatedValue | {x:number;y:number} | AnimatedValueXY | RgbaValue | AnimatedColor | AnimatedInterpolation<number>`
      - `easing?: (value: number) => number`
      - `duration?: number`
      - `delay?: number`
      - 加えて `AnimationConfig` の全フィールド（下記）
  - `Animated.spring(value, config: SpringAnimationConfig): CompositeAnimation`
    - `toValue` 同上
    - `overshootClamping?: boolean`
    - `restDisplacementThreshold?: number`
    - `restSpeedThreshold?: number`
    - `velocity?: number | {x:number;y:number}`
    - `bounciness?: number`, `speed?: number`, `tension?: number`, `friction?: number`, `stiffness?: number`, `damping?: number`, `mass?: number`, `delay?: number`
    - 加えて `AnimationConfig`
  - `AnimationConfig`（timing/spring共通、**`useNativeDriver` は必須**）:
    - `useNativeDriver: boolean`
    - `isInteraction?: boolean`
    - `platformConfig?: PlatformConfig`
    - `onComplete?: EndCallback`
    - `iterations?: number`
    - `isLooping?: boolean`
    - `debugID?: string`
  - `CompositeAnimation`:
    - `start(callback?: EndCallback): void`
    - `stop(): void`
    - `reset(): void`
  - `EndCallback = (result: EndResult) => void`、`EndResult = { finished: boolean; value?: number; offset?: number }`
  - 合成: `Animated.sequence(animations)`, `Animated.parallel(animations, config?)`, `Animated.delay(time)`, `Animated.loop(animation, config?)`, `Animated.stagger(time, animations)`。
- 未確認・不明点: なし（型定義で確定）。

### 2.4 `interpolate`

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/nodes/AnimatedInterpolation.d.ts
  - https://reactnative.dev/docs/animations （Interpolation節）
- 確認できた事実:
  - `value.interpolate<OutputT extends number | string | NativeColorValue>(config: InterpolationConfigType<OutputT>): AnimatedInterpolation<OutputT>`
  - `InterpolationConfigType<OutputT>`:
    - `inputRange: ReadonlyArray<number>`（**必須**）
    - `outputRange: ReadonlyArray<OutputT>`（**必須**）
    - `easing?: (input: number) => number`
    - `extrapolate?: 'extend' | 'identity' | 'clamp'`
    - `extrapolateLeft?: 'extend' | 'identity' | 'clamp'`
    - `extrapolateRight?: 'extend' | 'identity' | 'clamp'`
  - `OutputT` は `number | string | NativeColorValue`。**回転角は文字列の `'0deg'` 〜 `'360deg'` で出力するのが公式パターン**（RN公式ドキュメントのInterpolation節に「animate a rotation」の例として `value.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] })` が記載）。
  - 出力が文字列の `AnimatedInterpolation<string>` は `AnimatedNode` を継承している。
- 未確認・不明点: なし。

### 2.5 `Animated.View` と style の型（`WithAnimatedObject` 相当）

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/components/AnimatedView.d.ts
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/createAnimatedComponent.d.ts
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/StyleSheet/private/_TransformStyle.d.ts
- 確認できた事実:
  - `Animated.View` の型は `AnimatedComponentType<ViewProps, ...>`。propsは `AnimatedProps<ViewProps>` で、各propは `WithAnimatedValue<T>` に変換される。
  - `WithAnimatedValue<T>` の定義（`createAnimatedComponent.d.ts`）:
    - 配列 → `ReadonlyArray<WithAnimatedValue<P>>`（要素ごとに再帰）
    - オブジェクト → `{ readonly [K in keyof T]: WithAnimatedValue<T[K]> }`
    - primitive → `T | AnimatedNode | AnimatedValue | AnimatedInterpolation<...> | ...`
  - したがって **`style` に配列 `[静的スタイル, { transform: [...] }]` を渡せ、配列内のtransform値だけをAnimatedにできる**。
  - RNのtransform型（`____TransformStyle_Internal`）:
    - `transform?: ReadonlyArray<Readonly<MaximumOneOf<...>>> | string | undefined`
    - `rotate: string | AnimatedNode`、`translateX: number | string | AnimatedNode`、`scale: number | AnimatedNode`、`matrix: ReadonlyArray<number | AnimatedNode> | AnimatedNode` など
    - `transformOrigin?: [string | number, string | number, string | number] | string`
  - **`rotate` に `AnimatedInterpolation<string>` を渡すには、interpolateの出力型を `string` にする**（`AnimatedInterpolation<number>` は `string` に代入不可）。`AnimatedInterpolation<string>` は `AnimatedNode` のサブクラスなので `rotate: string | AnimatedNode` に適合する。
- 未確認・不明点:
  - 型名 `Animated.WithAnimatedObject` はRNの公開型としては確認できず、実体は `WithAnimatedValue`（型定義上）。ドキュメント上の名称は未確認。

### 2.6 `useNativeDriver: true` の制約（公式ドキュメント）

- 確認日: 2026-10-30
- 情報源URL: https://reactnative.dev/docs/animations （Using the native driver / Caveats）
- 確認できた事実:
  - **`useNativeDriver: true` を指定する**と、アニメーション定義がネイティブ側に送られ、UIスレッドで実行される（JSスレッドがブロックされても継続）。
  - 指定しない場合は既定 `false`（レガシー互換）だが、**警告が出て、TypeScriptでは型エラーになる**（`AnimationConfig.useNativeDriver` が必須のため）。
  - **ネイティブドライバでアニメーションできるのは非レイアウトプロパティのみ**。`transform` と `opacity` はOK。**Flexboxやpositionなどのレイアウトプロパティは不可**。
  - **1つのAnimated.Valueは1つのドライバのみと互換**。native driverで開始した値には、以後もnative driverでのみアニメーションさせる。
  - `Animated.event` もnative driver対応（例: `Animated.ScrollView` の `onScroll` + `useNativeDriver: true`）。ただし「direct eventsのみ、bubbling events不可（PanResponderは不可）」。
  - 長い/ループアニメーション中に `VirtualizedList` の行レンダリングを妨げる場合がある → `isInteraction: false` で回避。
  - `rotateX` / `rotateY` 等を使う場合、`transform` 配列に `{ perspective: 1000 }` を入れないとAndroidで描画されないことがある（**2Dの `rotate` のみなら不要**）。
  - なお、`transform` は「配列 of オブジェクト」または「スペース区切り文字列」を受け付ける。`rotate` は `'45deg'` / `'0.785398rad'` の文字列。
- 未確認・不明点:
  - **ネイティブドライバ + 文字列補間（`'0deg'`→`'360deg'`）が公式に保証されているか**についての明記は見つからない（transformはネイティブドライバ対象プロパティなので実用上可能とされるが、明記なし）。実機での動作確認を推奨。
  - rotateの**正方向（時計回り/反時計回り）**はRN公式ドキュメントに明記なし。T22では方位角→回転角の符号を実機で確認する必要あり（**未確認**）。

### 2.7 StyleSheet.create とアニメーション値の併用

- 確認日: 2026-10-30
- 情報源URL:
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/StyleSheet/StyleSheet.d.ts
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/createAnimatedComponent.d.ts
  - https://reactnative.dev/docs/animations
- 確認できた事実:
  - `StyleSheet.create` の返り値はregistered style（型上は `ViewStyle` などの不透明な値）だが、`Animated.View` の `style` propは `WithAnimatedValue` で再帰変換されるため、**`style={[styles.container, { transform: [{ rotate: animatedRotate }] }]}` の形で型上は受け付けられる**（配列の要素ごとに変換される）。
  - 公式ドキュメントのAnimated例はすべてinline style（`style={{ opacity: fadeAnim }}` 等）で、**StyleSheet.createとAnimated値を併用した公式例は確認できなかった**。
- 未確認・不明点:
  - StyleSheet.create由来の登録スタイルと動的transformを併用した場合の実行時挙動（公式exampleなし）。型上は可能だが、T22では「静的スタイルはStyleSheet.create、transformはstyle配列の2要素目にinline」という形で実装するのが安全。

---

## 3. `performance.now()` はRN 0.88.1で利用可能か

- 確認日: 2026-10-30
- 情報源URL:
  - https://reactnative.dev/docs/global-performance （RN公式「performance」グローバルAPIページ）
  - https://unpkg.com/react-native@0.88.1/src/private/webapis/performance/Performance.js
  - https://unpkg.com/react-native@0.88.1/src/private/setup/setUpPerformance.js
  - https://unpkg.com/react-native@0.88.1/src/private/setup/setUpDefaultReactNativeEnvironment.js
  - https://unpkg.com/react-native@0.88.1/src/setup-env.js
  - https://unpkg.com/react-native@0.88.1/ReactCommon/react/nativemodule/webperformance/NativePerformance.cpp
  - https://unpkg.com/react-native@0.88.1/ReactCommon/react/timing/primitives.h
- 確認できた事実:
  - RN公式ドキュメントの「Globals」に **`performance` ページが存在**し、`now()` メソッド・`timeOrigin`・`mark()`/`measure()`等が記載されている（`now()` はMDNのperformance.nowを参照）。
  - RN 0.88.1のソース:
    - `setUpPerformance.ts` が `global.performance = new Performance()` を設定（`setUpDefaultReactNativeEnvironment` から呼ばれ、`react-native/setup-env` → `InitializeCore` 経由で起動時に実行される）。
    - `Performance` クラスは `now: () => DOMHighResTimeStamp = now` を公開（`NativePerformance.now()` を呼ぶ）。
    - `NativePerformance::now()` は `HighResTimeStamp::now()` を呼び、`HighResTimeStamp` は **`std::chrono::steady_clock` ベース**（`primitives.h` で確認）。
    - ネイティブ実装コメント: 「これは spec-compliant ではない。アプリ起動からではなく **システム起動（boot）からの経過時間** を返す」。
  - したがって **`performance.now()` はRN 0.88.1（Hermes）で利用可能**。Hermes固有のAPIではなく、RNが全エンジン向けに提供するグローバル。戻り値はミリ秒（浮動小数）、単調増加時計由来で、**エポック基準ではない**（`Date.now()` とは基準が異なる）。
  - TypeScript: RNの型宣言（`src/types/globals.d.ts`）には `performance` の宣言が無いが、**Expo SDK 58の `tsconfig.base` が `lib: ["DOM", "ESNext"]`** のため、DOM libの `performance.now(): DOMHighResTimeStamp`（number）で型チェックが通る。
- 未確認・不明点:
  - Expo Go実機／エミュレータでの実測値（起動直後から呼べるか、Jest環境での有無）は未確認。特にJest（jest-expo）環境ではRNのセットアップが走らないため `performance` が未定義の可能性がある → 単体テストではClockポートを注入してモックする設計（architecture.mdの方針）が安全。
  - 代替として `Date.now()`（壁時計・非単調）、`global.__BUNDLE_START_TIME__`（RN内部定数）等が使えるかは未確認。**performance.now()が使えるため代替は不要**。

---

## 4. `AppState`

- 確認日: 2026-10-30
- 情報源URL:
  - https://reactnative.dev/docs/appstate
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/AppState/AppState.d.ts
  - https://unpkg.com/react-native@0.88.1/types_generated/Libraries/vendor/emitter/EventEmitter.d.ts
  - https://unpkg.com/react-native@0.88.1/types_generated/index.d.ts （型export）
- 確認できた事実:
  - `AppState.addEventListener<K extends AppStateEvent>(type: K, handler: (...args) => void): EventSubscription`
    - `type: 'change'` の場合、handlerは `(state: AppStateStatus) => void`。
  - `AppStateEvent = 'change' | 'memoryWarning' | 'blur' | 'focus'`
    - `memoryWarning` はiOSのみ、`focus`/`blur` はAndroidのみ（公式ドキュメントに明記）。
  - `EventSubscription` は `{ remove(): void }`。**`addEventListener` の戻り値に対して `remove()` を呼ぶ**のが解除方法（'react-native' から型 `EventSubscription` もexportされている）。
  - `AppStateStatus = 'inactive' | 'background' | 'active' | 'extension' | 'unknown'`（`@platform ios inactive`）
  - `AppState.currentState`:
    - 公式ドキュメントの型表記は `AppStateStatus`。
    - **実際の型定義は `currentState: null | undefined | string`**（`AppStateStatus` より広い）。
    - 公式ドキュメント注記: **legacy architectureでは起動時に `null`**（ネイティブから非同期取得されるまで）。
- 未確認・不明点:
  - New Architecture（RN 0.88の既定）で起動直後に `currentState` が必ず入っているかは公式ドキュメントに明記なし＝未確認。**起動直後は `null`/`undefined` を許容するコード**にする必要がある。
  - `AppState` の `change` イベントがバックグラウンド復帰時に必ず発火するか（端末依存）は未確認。
  - 位置情報センサーとの連動（バックグラウンド時にwatchを止める等）の公式推奨パターンは未確認。T22では「方位/位置の購読解除・再購読」のために `AppState` を使う設計が考えられる。

---

## 5. T22 実装で使うべき確定APIの最小セット（型契約レベル）

以下は**確定した型・APIのみ**で構成した最小セット（実装コードではなく型契約のメモ）。詳細は各節のURLを参照。

```ts
// --- imports（すべて一次情報で確認済み） ---
import Svg, {
  Path, Circle, G, Polygon,
  type SvgProps, type PathProps, type CircleProps, type GProps, type PolygonProps,
} from 'react-native-svg';
import {
  Animated,
  Easing,
  AppState,
  useAnimatedValue,
  type AppStateStatus,
  type EventSubscription,
} from 'react-native';

// --- SVGの確定props（型） ---
type SvgPropsConfirmed = Pick<SvgProps, 'width' | 'height' | 'viewBox' | 'preserveAspectRatio' | 'color' | 'title'>;
// width/height: string | number（"100%"も可）/ viewBox: string（例 "0 0 100 100"）
type PathPropsConfirmed = Pick<PathProps, 'd' | 'fill' | 'fillOpacity' | 'fillRule' | 'stroke' | 'strokeWidth' | 'strokeOpacity' | 'strokeLinecap' | 'strokeLinejoin' | 'strokeDasharray' | 'opacity' | 'transform'>;
type CirclePropsConfirmed = Pick<CircleProps, 'cx' | 'cy' | 'r' | 'fill' | 'stroke' | 'strokeWidth' | 'opacity' | 'transform'>;
type GPropsConfirmed = Pick<GProps, 'transform' | 'fill' | 'stroke' | 'strokeWidth' | 'opacity' | 'children'>;
type PolygonPropsConfirmed = Pick<PolygonProps, 'points' | 'fill' | 'stroke' | 'strokeWidth' | 'opacity' | 'transform'>;
// transform: ColumnMajorTransformMatrix | string | TransformsStyle['transform']
//   = [number,number,number,number,number,number] | "rotate(45 50 50)" | [{ rotate: '45deg' }]

// --- Animated（確定） ---
const spin: Animated.Value = useAnimatedValue(0);        // または useRef(new Animated.Value(0)).current
// useAnimatedValue(initialValue: number, config?: Animated.AnimatedConfig): Animated.Value

const rotate: AnimatedInterpolation<string> = spin.interpolate({
  inputRange: [0, 360],
  outputRange: ['0deg', '360deg'],   // 回転は文字列で出力（公式パターン）
});

Animated.timing(spin, {
  toValue: targetDeg,                 // number
  duration: 300,                      // optional
  easing: Easing.out(Easing.quad),    // optional
  useNativeDriver: true,              // 必須（型・公式）
}).start(({ finished }) => { /* EndResult: { finished: boolean; value?: number } */ });

// センサー値で直接更新する場合（アニメーションさせない場合）
spin.setValue(deg);

// --- 回転は「外側のAnimated.View」にかける（SVG propsにはAnimated値を渡さない） ---
// <Animated.View style={[styles.bird, { transform: [{ rotate }] }]}>
//   <Svg width={size} height={size} viewBox="0 0 100 100"> ... </Svg>
// </Animated.View>
// rotate の正方向（時計回り/反時計回り）は未確認 → 実機で符号を確認

// --- AppState（確定） ---
const sub: EventSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') { /* 再購読・再同期 */ } else { /* 購読解除・タイマー停止 */ }
});
// cleanup: sub.remove()
// AppState.currentState: null | undefined | string（起動直後はnull許容。legacy architectureの注記あり）

// --- 時計（確定） ---
const nowMs: number = performance.now();   // ms・単調（steady_clock由来）・エポック基準ではない
// 型はDOM lib（Expo tsconfig.base の lib:["DOM","ESNext"]）由来。RN独自のglobal型宣言は無い。
```

### T22での組み立て方針（一次情報から導かれる確定事実のみ）

1. **鳥の描画**: `Svg` + `Path`（`d`）+ `Circle`/`Polygon` で構成。`width`/`height` は数値または `"100%"` 等の文字列、`viewBox="0 0 100 100"` を指定（Expoドキュメント: Androidでの見た目のためviewBoxを消さないこと）。
2. **回転**: `Animated.Value`（角度の数値）→ `interpolate` で `['0deg','360deg']` の文字列へ → `Animated.View` の `transform: [{ rotate }]`。**SVG内部要素のtransformは静的指定のみ**（SVG文字列 or 6要素matrix）。
3. **更新**: 方位が1Hz程度で更新されるなら `spin.setValue(deg)` で十分（アニメーション不要）。滑らかに見せたい場合のみ `Animated.timing(..., useNativeDriver: true)`。
4. **駆動**: `useNativeDriver: true` を使う（transformは非レイアウトプロパティなので対象）。
5. **時計**: フレーム間隔・鮮度計測は `performance.now()`（単調）。`Date.now()` は壁時計なので鮮度計算に使うなら単調性に注意。

---

## 6. 情報源一覧（すべて 2026-10-30 取得）

| 情報源 | URL | 確認した内容 |
| --- | --- | --- |
| react-native-svg npm dist-tags | https://registry.npmjs.org/-/package/react-native-svg/dist-tags | 最新版 15.16.0 |
| Expo SDK 58 bundledNativeModules | https://unpkg.com/expo@58.0.21/bundledNativeModules.json | `react-native-svg = 15.16.0`、RN 0.88.1、React 19.3.0 |
| Expo公式 react-native-svg | https://docs.expo.dev/versions/latest/sdk/svg.md | Expo Go同梱・対応PF・インストール方法 |
| react-native-svg 型定義 | https://unpkg.com/react-native-svg@15.16.0/lib/typescript/elements/*.d.ts , https://unpkg.com/react-native-svg@15.16.0/lib/typescript/lib/extract/types.d.ts | Svg/Path/Circle/G/Polygonのprops、transform型 |
| react-native-svg 実装 | https://unpkg.com/react-native-svg@15.16.0/src/lib/extract/extractTransform.ts , https://unpkg.com/react-native-svg@15.16.0/src/lib/Matrix2D.ts | transformの受理形式・変換処理 |
| react-native-svg エクスポート | https://unpkg.com/react-native-svg@15.16.0/lib/typescript/ReactNativeSVG.d.ts | default Svg、named exports、Props型export |
| RN 0.88.1 型定義 | https://unpkg.com/react-native@0.88.1/types_generated/Libraries/Animated/*.d.ts , .../Libraries/AppState/AppState.d.ts , .../Libraries/StyleSheet/private/_TransformStyle.d.ts , .../index.d.ts | Animated/AppState/transform型、useAnimatedValue、EventSubscription export |
| RN公式 Animations | https://reactnative.dev/docs/animations | timing/spring/interpolate、useNativeDriver制約、rotateの文字列補間例 |
| RN公式 Transforms | https://reactnative.dev/docs/transforms | transformの配列/文字列形式、deg/rad、transformOrigin |
| RN公式 AppState | https://reactnative.dev/docs/appstate | addEventListener/currentState/イベント、legacy architectureの注記 |
| RN公式 performance | https://reactnative.dev/docs/global-performance | `performance` グローバルと `now()` の存在 |
| RN 0.88.1 performance実装 | https://unpkg.com/react-native@0.88.1/src/private/setup/setUpPerformance.js , .../src/private/webapis/performance/Performance.js , .../ReactCommon/react/nativemodule/webperformance/NativePerformance.cpp , .../ReactCommon/react/timing/primitives.h | `global.performance` 設定、`now()`がsteady_clock由来、boot基準 |
| RN 0.88.1 JS環境 | https://reactnative.dev/docs/javascript-environment | Hermesが既定エンジン |
| Expo tsconfig base | https://unpkg.com/expo@58.0.21/tsconfig.base.json | `lib: ["DOM","ESNext"]`（performance型の根拠） |

---

## 7. 未確認・不明点一覧（T22実装前に追加確認したい順）

1. **rotateの正方向**（RN `transform: [{rotate:'45deg'}]` が時計回りか反時計回りか）— RN公式ドキュメントに明記なし。**実機で符号を確認**（方位角→回転角の変換に直結）。
2. **ネイティブドライバ + 文字列補間（`'0deg'`〜`'360deg'`）の公式保証** — transformはネイティブドライバ対象だが、文字列interpolateの明記なし。Expo Go実機で動作確認推奨。
3. **Expo Go実機でのperformance.now()** — RN 0.88.1のソース上は起動時に設定されるが、実測は未確認。
4. **Jest（jest-expo）環境でのperformance有無** — RNのセットアップが走らないため未定義の可能性。テストではClockポート注入を推奨。
5. **AppState.currentStateの起動直後の値（New Architecture時）** — legacy向けのnull注記のみ。`null | undefined` を許容する実装にする。
6. **SVG要素のtransformにAnimated値を渡した場合の実機挙動** — ソース上は不適切（文字列化される）。T22では外側Animated.View方式にするため回避。
7. **react-native-svgの`fill`/`stroke`既定値** — 公式ドキュメントに明記なし（SVG仕様準拠と推測されるが未確認）。`fill="none"`を明示する。
8. **Expo Go同梱のreact-native-svg実バージョン** — Expo docsに明記なし（`npx expo install` の解決値は15.16.0）。

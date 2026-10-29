/**
 * 画像アセットのモジュール宣言（TypeScript 用）。
 *
 * Metro（Expo）は画像をアセット ID（number）に変換するため、
 * `import image from './foo.png'` の型を number として宣言する。
 * `expo-env.d.ts` は `expo start` 実行時に生成されるが、CI/Jest では存在しないことがあるため
 * リポジトリ側で明示的に宣言する。
 */
declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.jpg' {
  const asset: number;
  export default asset;
}

declare module '*.jpeg' {
  const asset: number;
  export default asset;
}

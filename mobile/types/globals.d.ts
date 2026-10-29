/**
 * グローバル宣言（TypeScript）。
 *
 * `require` は Metro（React Native）が提供する CommonJS 関数。
 * ネイティブモジュールを「存在すれば使う」形で遅延読み込みする箇所でのみ使用する
 * （`@types/node` を追加しない方針のため、ここで最小限の型を宣言する）。
 */
declare function require(id: string): unknown;

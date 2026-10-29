/**
 * Expo アプリ設定（app.json を拡張する動的設定）。
 *
 * - `GOOGLE_MAPS_API_KEY` が環境変数にある場合のみ `react-native-maps` の config plugin を有効化し、
 *   APK に Google Maps の API キーを埋め込む。
 * - キーが無い場合は `extra.hasGoogleMapsKey = false` を埋め込み、地図画面はフォールバック表示にする
 *   （カスタムビルドでキー無しのまま MapView を描画するとネイティブクラッシュするため）。
 * - `expo-share-intent` の plugin を追加し、Google マップ等からの共有（text/*）を受け取れるようにする。
 *   （Expo Go では利用不可。development build / APK でのみ動作する）
 *
 * 使い方:
 *   $env:GOOGLE_MAPS_API_KEY = "<key>"; npx expo prebuild --clean; .\gradlew.bat assembleDebug
 */
const appJson = require('./app.json');

const mapsApiKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
const hasGoogleMapsKey = mapsApiKey.length > 0;

module.exports = ({ config }) => {
  const base = config ?? appJson.expo;
  const plugins = [...(base.plugins ?? [])];

  if (hasGoogleMapsKey) {
    plugins.push(['react-native-maps', { androidGoogleMapsApiKey: mapsApiKey }]);
  }
  plugins.push(['expo-share-intent', { androidIntentFilters: ['text/*'] }]);

  return {
    ...base,
    plugins,
    extra: {
      ...(base.extra ?? {}),
      hasGoogleMapsKey,
    },
  };
};

/**
 * Expo アプリ設定（app.json を拡張する動的設定）。
 *
 * - 地図は **OpenStreetMap のラスタータイル**（`OsmMapView`）を使うため、Google Maps の API キーは不要。
 * - `expo-share-intent` の plugin を追加し、Google マップ等からの共有（text/*）を受け取れるようにする。
 *   （Expo Go では利用不可。development build / APK でのみ動作する）
 *
 * 使い方:
 *   npx expo prebuild --clean
 *   cd android; .\gradlew.bat assembleDebug
 */
const appJson = require('./app.json');

module.exports = ({ config }) => {
  const base = config ?? appJson.expo;
  const plugins = [...(base.plugins ?? [])];

  plugins.push(['expo-share-intent', { androidIntentFilters: ['text/*'] }]);

  return {
    ...base,
    plugins,
  };
};

import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Constants from 'expo-constants';
import type { GeoPoint } from '../../domain/types';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';
import { PrimaryButton } from '../components/PrimaryButton';

/** 初期中心が無いときの既定領域（東京駅周辺）。 */
const DEFAULT_REGION = {
  latitude: 35.681236,
  longitude: 139.767125,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

/** 現在地だけ分かっているときの拡大率（度）。 */
const SINGLE_POINT_DELTA = 0.01;

/**
 * 地図を描画できるか。
 *
 * - **Expo Go**（`storeClient`）は Expo Go 自身が Google Maps のキーを持つため描画できる。
 * - **カスタムビルド（APK）** は `GOOGLE_MAPS_API_KEY` を指定してビルドした場合のみ描画できる。
 *   キー無しで `MapView` を描画すると `IllegalStateException: API key not found` で**アプリが落ちる**ため、
 *   `app.config.js` の `extra.hasGoogleMapsKey` を見て事前に分岐する。
 */
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';
const HAS_MAPS_KEY: boolean = (() => {
  if (IS_EXPO_GO) {
    return true;
  }
  const extra = Constants.expoConfig?.extra as { readonly hasGoogleMapsKey?: boolean } | undefined;
  return extra?.hasGoogleMapsKey === true;
})();

export interface MapScreenProps {
  /** 地図の初期中心（現在地。無ければ既定領域）。 */
  readonly initialPoint: GeoPoint | null;
  /** 選択中の地点（未選択なら `null`）。 */
  readonly selectedPoint: GeoPoint | null;
  /** 選択地点の場所名（逆ジオコーディング結果。取得前は `null`）。 */
  readonly selectedLabel: string | null;
  /** 場所名を取得中か。 */
  readonly resolving: boolean;
  /** 地図タップで地点を選択（座標は内部表現。UI には出さない）。 */
  readonly onPick: (point: GeoPoint) => void;
  /** 「この場所を目的地にする」。 */
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

/**
 * 地図で選ぶ画面（S4）。F2 / U07。
 *
 * - `MapView` の `onPress`（**確定済み API**: `event.nativeEvent.coordinate`）で地点を選ぶ。
 * - **`react-native-maps` を import する唯一のファイル**。
 * - 使用 props は確定済みのものだけ（notes §3.3 / §3.4）: `initialRegion` / `showsCompass` /
 *   `showsMyLocationButton` / `liteMode`、`Marker` の `coordinate` / `title` / `identifier`。
 * - `showsUserLocation` は使わない（権限なしで無言失敗するため。ADR-10）。
 * - 座標は UI に出さない（UX-1）。確定操作は「この場所を目的地にする」。
 * - **API キーが無いビルドでは地図を描画せず**、フォールバック案内を表示する（クラッシュ防止）。
 */
export function MapScreen({
  initialPoint,
  selectedPoint,
  selectedLabel,
  resolving,
  onPick,
  onConfirm,
  onBack,
}: MapScreenProps): ReactElement {
  if (!HAS_MAPS_KEY) {
    return <MapUnavailable onBack={onBack} />;
  }

  const region =
    selectedPoint !== null
      ? {
          latitude: selectedPoint.latitude,
          longitude: selectedPoint.longitude,
          latitudeDelta: SINGLE_POINT_DELTA,
          longitudeDelta: SINGLE_POINT_DELTA,
        }
      : initialPoint !== null
        ? {
            latitude: initialPoint.latitude,
            longitude: initialPoint.longitude,
            latitudeDelta: SINGLE_POINT_DELTA,
            longitudeDelta: SINGLE_POINT_DELTA,
          }
        : DEFAULT_REGION;

  const labelText = resolving
    ? UI_TEXT.mapPick.resolving
    : (selectedLabel ?? (selectedPoint === null ? UI_TEXT.mapPick.noSelection : ''));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.backIcon, pressed ? styles.pressed : null]}
        >
          <Text style={styles.backIconText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{UI_TEXT.mapPick.title}</Text>
      </View>

      <View style={styles.mapArea}>
        <MapView
          style={styles.map}
          initialRegion={region}
          showsCompass
          showsMyLocationButton={false}
          showsUserLocation={false}
          liteMode={false}
          onPress={(event) => {
            const coordinate = event.nativeEvent.coordinate;
            onPick({ latitude: coordinate.latitude, longitude: coordinate.longitude });
          }}
        >
          {initialPoint === null ? null : (
            <Marker
              coordinate={initialPoint}
              title={UI_TEXT.mapScreen.currentLocationMarker}
              identifier="current-location"
            />
          )}
          {selectedPoint === null ? null : (
            <Marker
              coordinate={selectedPoint}
              title={selectedLabel ?? UI_TEXT.mapPick.selectedLabel}
              identifier="selected-point"
            />
          )}
        </MapView>
        <View style={styles.instructionBar} pointerEvents="none">
          <Text style={styles.instruction}>{UI_TEXT.mapPick.instruction}</Text>
        </View>
      </View>

      <View style={styles.bottomBar}>
        <Text style={styles.selectedLabel}>
          {`${UI_TEXT.mapPick.selectedLabel}: ${labelText}`}
        </Text>
        <PrimaryButton
          label={UI_TEXT.mapPick.confirm}
          onPress={onConfirm}
          disabled={selectedPoint === null || resolving}
        />
      </View>
    </View>
  );
}

/** 地図が使えないビルド向けのフォールバック（クラッシュさせない）。 */
function MapUnavailable({ onBack }: { readonly onBack: () => void }): ReactElement {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.backIcon, pressed ? styles.pressed : null]}
        >
          <Text style={styles.backIconText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{UI_TEXT.mapPick.title}</Text>
      </View>
      <View style={styles.fallbackCard}>
        <Text style={styles.fallbackTitle}>{UI_TEXT.mapPick.unavailableTitle}</Text>
        <Text style={styles.fallbackBody}>{UI_TEXT.mapPick.unavailableBody}</Text>
        <PrimaryButton label={UI_TEXT.mapPick.back} onPress={onBack} variant="secondary" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  backIcon: {
    minWidth: TAP_TARGET_MIN,
    minHeight: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIconText: {
    fontSize: FONT_SIZE.heading,
    color: COLORS.primary,
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  mapArea: {
    flex: 1,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  instructionBar: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  instruction: {
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  bottomBar: {
    gap: SPACING.sm,
  },
  selectedLabel: {
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
  },
  fallbackCard: {
    flex: 1,
    justifyContent: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  fallbackTitle: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  fallbackBody: {
    fontSize: FONT_SIZE.bodyLarge,
    lineHeight: 24,
    color: COLORS.text,
  },
  pressed: {
    opacity: 0.8,
  },
});

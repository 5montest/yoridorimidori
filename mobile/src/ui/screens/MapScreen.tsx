import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { formatBearingDeg, formatDistanceM } from '../../domain/format';
import { regionForPoints, type MapRegion } from '../../domain/mapRegion';
import type { GeoPoint, NavState } from '../../domain/types';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

/** 目的地未選択時に現在地だけを表示するときの拡大率（度）。 */
const SINGLE_POINT_DELTA = 0.01;
/** 2 点とも無い/不正なときの既定領域（東京駅周辺）。 */
const DEFAULT_REGION: MapRegion = {
  latitude: 35.681236,
  longitude: 139.767125,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export interface MapScreenProps {
  /** 現在地（未取得なら `null`）。 */
  readonly currentPoint: GeoPoint | null;
  readonly destinationName: string | null;
  readonly destinationPoint: GeoPoint | null;
  /** 表示用の派生値（距離・相対方位は domain の結果を表示するだけ）。 */
  readonly nav: NavState;
  readonly onBack: () => void;
}

/**
 * 地図画面（Android / iOS）。§9.6 / FR-11 / ADR-10 / T27。
 *
 * - `react-native-maps` を import する**唯一のファイル**。
 * - 使用 props は確定済みのものだけ（notes §3.3 / §3.4）:
 *   `MapView` の `initialRegion` / `showsCompass` / `showsMyLocationButton` / `liteMode`、
 *   `Marker` の `coordinate` / `title` / `identifier`。
 * - **`showsUserLocation` は常に false**（権限が無いと無言で失敗するため）。現在地は自前 `Marker`。
 * - Google プロバイダの明示指定はしない（Expo Go では不要・カスタムビルド時のみ有効）。
 *   `provider` prop は渡さない（Android は既定で Google マップ）。
 * - 現在地が無いときは地図を描画せずフォールバック文言を出す。
 * - 地図が空白（API キー未設定）でも壊れないよう注記と戻る導線を常設する。
 */
export function MapScreen({
  currentPoint,
  destinationName,
  destinationPoint,
  nav,
  onBack,
}: MapScreenProps): ReactElement {
  if (currentPoint === null) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{UI_TEXT.mapScreen.title}</Text>
        <Text style={styles.fallback}>{UI_TEXT.mapScreen.noLocation}</Text>
        <MapSummary nav={nav} destinationName={destinationName} />
        <BackButton onPress={onBack} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView
        style={styles.map}
        initialRegion={computeInitialRegion(currentPoint, destinationPoint)}
        showsCompass
        showsMyLocationButton={false}
        showsUserLocation={false}
        liteMode={false}
      >
        <Marker
          coordinate={currentPoint}
          title={UI_TEXT.mapScreen.currentLocationMarker}
          identifier="current-location"
        />
        {destinationPoint === null ? null : (
          <Marker
            coordinate={destinationPoint}
            title={destinationName ?? UI_TEXT.mapScreen.destinationMarker}
            identifier="destination"
          />
        )}
      </MapView>

      <View style={styles.noteBar} pointerEvents="none">
        <Text style={styles.note}>{UI_TEXT.mapScreen.apiKeyNote}</Text>
      </View>

      <View style={styles.bottomBar}>
        <MapSummary nav={nav} destinationName={destinationName} />
        {destinationPoint === null ? (
          <Text style={styles.note}>{UI_TEXT.mapScreen.noDestination}</Text>
        ) : null}
        <BackButton onPress={onBack} />
      </View>
    </View>
  );
}

/** 現在地・目的地を 1 画面に収める領域。片方だけなら現在地を中心にする。 */
function computeInitialRegion(
  currentPoint: GeoPoint,
  destinationPoint: GeoPoint | null,
): MapRegion {
  if (destinationPoint === null) {
    return {
      latitude: currentPoint.latitude,
      longitude: currentPoint.longitude,
      latitudeDelta: SINGLE_POINT_DELTA,
      longitudeDelta: SINGLE_POINT_DELTA,
    };
  }
  return regionForPoints(currentPoint, destinationPoint) ?? DEFAULT_REGION;
}

interface MapSummaryProps {
  readonly nav: NavState;
  readonly destinationName: string | null;
}

/** 方位サマリ（地図が読めない場合でも数値で状況が分かるようにする）。 */
function MapSummary({ nav, destinationName }: MapSummaryProps): ReactElement {
  const bearingText =
    nav.status === 'arrived' ? UI_TEXT.noValue : formatBearingDeg(nav.relativeBearingDeg);
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryText}>
        {`${UI_TEXT.mapScreen.destinationLabel}: ${
          destinationName ?? UI_TEXT.main.destinationEmpty
        }`}
      </Text>
      <Text style={styles.summaryText}>
        {`${UI_TEXT.mapScreen.distanceLabel}: ${formatDistanceM(nav.distanceM)}`}
      </Text>
      <Text style={styles.summaryText}>
        {`${UI_TEXT.mapScreen.relativeBearingLabel}: ${bearingText}`}
      </Text>
    </View>
  );
}

interface BackButtonProps {
  readonly onPress: () => void;
}

function BackButton({ onPress }: BackButtonProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
    >
      <Text style={styles.backButtonText}>{UI_TEXT.mapScreen.back}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  map: {
    flex: 1,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  fallback: {
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
  },
  noteBar: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    top: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  note: {
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  summary: {
    gap: 2,
  },
  summaryText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});

import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GeoPoint } from '../../domain/types';
import { clampZoom } from '../../domain/tileMath';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';
import { OsmMapView } from '../components/OsmMapView';
import { PrimaryButton } from '../components/PrimaryButton';

/** 初期中心が無いときの既定位置（東京駅周辺）。 */
const DEFAULT_CENTER: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };

/** 初期ズーム。 */
const DEFAULT_ZOOM = 15;

/** UI で許可するズーム範囲（広域〜街区）。 */
const MIN_UI_ZOOM = 10;
const MAX_UI_ZOOM = 18;

export interface MapScreenProps {
  /** 地図の初期中心（現在地。無ければ既定位置）。 */
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
 * 地図で選ぶ画面（S4）。
 *
 * - **OpenStreetMap のラスタータイル**（`OsmMapView`）で描画する。Google Maps の API キー・従量課金は不要。
 * - タップ位置を `screenPointToGeo`（純粋関数）で座標に変換し、`onPick` に渡す。
 * - 選択後はマーカー表示＋逆ジオコーディングした場所名を表示し、「この場所を目的地にする」で確定。
 * - 座標は UI に出さない（UX-1）。
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
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const center: GeoPoint = selectedPoint ?? initialPoint ?? DEFAULT_CENTER;
  const labelText = resolving
    ? UI_TEXT.mapPick.resolving
    : (selectedLabel ?? (selectedPoint === null ? UI_TEXT.mapPick.noSelection : ''));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={UI_TEXT.mapPick.back}
          onPress={onBack}
          style={({ pressed }) => [styles.backIcon, pressed ? styles.pressed : null]}
        >
          <Text style={styles.backIconText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{UI_TEXT.mapPick.title}</Text>
      </View>

      <View style={styles.mapArea}>
        <OsmMapView
          center={center}
          zoom={zoom}
          onCenterChange={onPick}
          onZoomChange={setZoom}
        />

        <View style={styles.instructionBar} pointerEvents="none">
          <Text style={styles.instruction}>{UI_TEXT.mapPick.instruction}</Text>
        </View>

        <View style={styles.zoomControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={UI_TEXT.mapPick.zoomIn}
            onPress={() => setZoom((current) => clampZoom(Math.min(MAX_UI_ZOOM, current + 1)))}
            style={({ pressed }) => [styles.zoomButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.zoomText}>＋</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={UI_TEXT.mapPick.zoomOut}
            onPress={() => setZoom((current) => clampZoom(Math.max(MIN_UI_ZOOM, current - 1)))}
            style={({ pressed }) => [styles.zoomButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.zoomText}>−</Text>
          </Pressable>
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
  zoomControls: {
    position: 'absolute',
    right: SPACING.sm,
    top: SPACING.xxl,
    gap: SPACING.xs,
  },
  zoomButton: {
    width: TAP_TARGET_MIN,
    height: TAP_TARGET_MIN,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    fontSize: FONT_SIZE.heading,
    color: COLORS.text,
    fontWeight: '700',
  },
  bottomBar: {
    gap: SPACING.sm,
  },
  selectedLabel: {
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
  },
  pressed: {
    opacity: 0.8,
  },
});

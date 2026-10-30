import { useMemo, useState, type ReactElement } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GeoPoint } from '../../domain/types';
import { geoToScreenPoint, visibleTiles } from '../../domain/tileMath';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';
import { MapIcon } from './icons';

/** OSM タイル取得時の User-Agent（OSM タイル利用ポリシー: 識別可能な UA を推奨）。 */
const TILE_USER_AGENT = 'yoridorimidori/0.1 (prototype; https://example.invalid/yoridorimidori)';

/** プレビューのズーム（周辺の街が分かる程度）。 */
const PREVIEW_ZOOM = 15;

export interface MapPreviewCardProps {
  /** プレビューの中心（現在地）。無ければプレースホルダー表示。 */
  readonly center: GeoPoint | null;
  /** カードのタイトル（例:「地図から選ぶ」）。 */
  readonly title: string;
  /** 補足（例:「地図上で地点を選びます」）。 */
  readonly hint: string;
  readonly onPress: () => void;
}

/**
 * 目的地選択（S3）の「地図から選ぶ」カード。
 *
 * - 現在地周辺の **OSM タイルを静止画プレビュー**として表示し、中央にピンを置く。
 * - カード全体がボタン（タップで S4 の地図選択へ）。タイルは `pointerEvents="none"`。
 * - 現在地が無い・タイル取得に失敗しても、ラベル付きのプレースホルダーで操作は可能。
 */
export function MapPreviewCard({ center, title, hint, onPress }: MapPreviewCardProps): ReactElement {
  const [layout, setLayout] = useState<{ readonly width: number; readonly height: number }>({
    width: 0,
    height: 0,
  });

  const tiles = useMemo(
    () => (center === null ? [] : visibleTiles(center, PREVIEW_ZOOM, layout.width, layout.height)),
    [center, layout.width, layout.height],
  );

  const pin =
    center === null
      ? null
      : geoToScreenPoint(center, center, PREVIEW_ZOOM, layout.width, layout.height);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setLayout((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      }}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      {center === null ? (
        <View style={styles.placeholder}>
          <MapIcon size={30} color={COLORS.textMuted} />
        </View>
      ) : (
        <View style={styles.tileLayer} pointerEvents="none">
          {layout.width > 0
            ? tiles.map((tile) => (
                <Image
                  key={tile.key}
                  source={{ uri: tile.url, headers: { 'User-Agent': TILE_USER_AGENT } }}
                  style={[
                    styles.tile,
                    { left: tile.left, top: tile.top, width: tile.size, height: tile.size },
                  ]}
                />
              ))
            : null}
          {pin === null ? null : (
            <View style={[styles.pin, { left: pin.x - 11, top: pin.y - 22 }]}>
              <View style={styles.pinHead} />
              <View style={styles.pinTip} />
            </View>
          )}
        </View>
      )}

      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.overlayText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 140,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  pressed: {
    opacity: 0.9,
  },
  tileLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tile: {
    position: 'absolute',
  },
  placeholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    position: 'absolute',
    width: 22,
    alignItems: 'center',
  },
  pinHead: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.primary,
    marginTop: -1,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(247, 243, 232, 0.96)',
  },
  overlayText: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
  },
  hint: {
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
  },
  chevron: {
    fontSize: FONT_SIZE.title,
    color: COLORS.textMuted,
  },
});

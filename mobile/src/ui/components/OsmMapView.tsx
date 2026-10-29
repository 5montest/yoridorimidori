import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { GeoPoint } from '../../domain/types';
import { geoToScreenPoint, screenPointToGeo, visibleTiles } from '../../domain/tileMath';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

/** OSM タイル取得時の User-Agent（OSM タイル利用ポリシー: 識別可能な UA を推奨）。 */
const TILE_USER_AGENT = 'yoridorimidori/0.1 (prototype; https://example.invalid/yoridorimidori)';

export interface OsmMapViewProps {
  /** 地図の中心。 */
  readonly center: GeoPoint;
  /** ズーム（整数）。 */
  readonly zoom: number;
  /** 選択中の地点（マーカー表示）。 */
  readonly selected: GeoPoint | null;
  /** タップされた地点（地理座標）。 */
  readonly onPress: (point: GeoPoint) => void;
}

/**
 * OpenStreetMap のラスタータイルを使う地図ビュー（S4）。
 *
 * - **Google Maps は使わない**（API キー不要・従量課金なし）。タイルは `tile.openstreetmap.org`。
 * - 表示範囲のタイルを `visibleTiles`（純粋関数）で計算し、`Image` を絶対配置で並べる。
 * - タップ位置は `screenPointToGeo`（純粋関数）で地理座標に変換して `onPress` に渡す。
 * - タイル取得に失敗した場合は案内を出す（オフライン時など）。地図が無くてもタップ選択は可能。
 * - 帰属表示（© OpenStreetMap contributors）を常時表示する（OSM の利用条件）。
 */
export function OsmMapView({ center, zoom, selected, onPress }: OsmMapViewProps): ReactElement {
  const [layout, setLayout] = useState<{ readonly width: number; readonly height: number }>({
    width: 0,
    height: 0,
  });
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(() => new Set<string>());

  const tiles = useMemo(
    () => visibleTiles(center, zoom, layout.width, layout.height),
    [center, zoom, layout.width, layout.height],
  );

  // 中心・ズームが変わったら失敗状態をリセットする。
  useEffect(() => {
    setFailedKeys(new Set<string>());
  }, [center.latitude, center.longitude, zoom]);

  const markerPosition =
    selected === null
      ? null
      : geoToScreenPoint(selected, center, zoom, layout.width, layout.height);

  const allTilesFailed = tiles.length > 0 && tiles.every((tile) => failedKeys.has(tile.key));

  const handleLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }): void => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const handlePress = (event: { nativeEvent: { locationX: number; locationY: number } }): void => {
    if (layout.width === 0 || layout.height === 0) {
      return;
    }
    const { locationX, locationY } = event.nativeEvent;
    onPress(screenPointToGeo({ x: locationX, y: locationY }, center, zoom, layout.width, layout.height));
  };

  return (
    <View style={styles.container} onLayout={handleLayout} testID="osm-map-view">
      <View
        accessible={false}
        onStartShouldSetResponder={() => true}
        onResponderRelease={handlePress}
        style={StyleSheet.absoluteFill}
      >
        {layout.width > 0 && layout.height > 0
          ? tiles.map((tile) => (
              <Image
                key={tile.key}
                source={{ uri: tile.url, headers: { 'User-Agent': TILE_USER_AGENT } }}
                style={[
                  styles.tile,
                  { left: tile.left, top: tile.top, width: tile.size, height: tile.size },
                ]}
                resizeMode="cover"
                onError={() => {
                  setFailedKeys((current) => {
                    if (current.has(tile.key)) {
                      return current;
                    }
                    const next = new Set(current);
                    next.add(tile.key);
                    return next;
                  });
                }}
              />
            ))
          : null}

        {markerPosition === null ? null : (
          <View
            pointerEvents="none"
            style={[
              styles.marker,
              { left: markerPosition.x - MARKER_SIZE / 2, top: markerPosition.y - MARKER_SIZE },
            ]}
          >
            <View style={styles.markerPin} />
            <View style={styles.markerShadow} />
          </View>
        )}
      </View>

      {allTilesFailed ? (
        <View style={styles.errorBanner} pointerEvents="none">
          <Text style={styles.errorText}>{UI_TEXT.mapPick.tileError}</Text>
        </View>
      ) : null}

      <Text style={styles.attribution} pointerEvents="none">
        {UI_TEXT.mapPick.attribution}
      </Text>
    </View>
  );
}

const MARKER_SIZE = 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
  },
  tile: {
    position: 'absolute',
  },
  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    alignItems: 'center',
  },
  markerPin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  markerShadow: {
    width: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    marginTop: 1,
  },
  attribution: {
    position: 'absolute',
    right: SPACING.xs,
    bottom: 2,
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    paddingHorizontal: 4,
  },
  errorBanner: {
    position: 'absolute',
    left: SPACING.sm,
    right: SPACING.sm,
    bottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  errorText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
});

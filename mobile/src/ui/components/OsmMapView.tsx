import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type PanResponderGestureState,
} from 'react-native';
import type { GeoPoint } from '../../domain/types';
import { clampZoom, screenPointToGeo, visibleTiles } from '../../domain/tileMath';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

/** OSM タイル取得時の User-Agent（OSM タイル利用ポリシー: 識別可能な UA を推奨）。 */
const TILE_USER_AGENT = 'yoridorimidori/0.1 (prototype; https://example.invalid/yoridorimidori)';

/** ドラッグ中に表示しておく余白（px）。画面外のタイルも先に読み込んでおく。 */
const TILE_PADDING_PX = 256;

/** ピンチの倍率上限（タイルの余白を超えない範囲）。 */
const MIN_PINCH_SCALE = 0.5;
const MAX_PINCH_SCALE = 2;

/** ダブルタップ判定の時間（ms）。 */
const DOUBLE_TAP_MS = 300;

/** ドラッグとみなす移動量（px）。 */
const DRAG_THRESHOLD_PX = 4;

export interface OsmMapViewProps {
  /** 地図の中心。 */
  readonly center: GeoPoint;
  /** ズーム（整数）。 */
  readonly zoom: number;
  /** 地図を動かしたときの新しい中心（ドラッグ終了時に呼ばれる）。 */
  readonly onCenterChange: (point: GeoPoint) => void;
  /** ズーム変更（ピンチ・ダブルタップ）。 */
  readonly onZoomChange: (zoom: number) => void;
}

/**
 * OpenStreetMap のラスタータイルを使う地図ビュー（S4）。
 *
 * 操作（Google マップ等と同じ「地図を動かして中央ピンを合わせる」方式）:
 * - **1 本指ドラッグ**: 地図が指に追従してスクロール。離すと中央の座標を `onCenterChange` に渡す。
 * - **ピンチ**: 2 本指の開閉でズーム（離したときに整数ズームへ確定）。
 * - **ダブルタップ**: ズームイン。
 * - 中央に**固定ピン**を表示する。ピンの先端が「選ばれる地点」。
 *
 * - Google Maps は使わない（API キー不要・従量課金なし）。タイルは `tile.openstreetmap.org`。
 * - タイル計算・座標変換は `domain/tileMath.ts` の純粋関数を使う。
 * - 帰属表示（© OpenStreetMap contributors）を常時表示する（OSM の利用条件）。
 */
export function OsmMapView({
  center,
  zoom,
  onCenterChange,
  onZoomChange,
}: OsmMapViewProps): ReactElement {
  const [layout, setLayout] = useState<{ readonly width: number; readonly height: number }>({
    width: 0,
    height: 0,
  });
  const [drag, setDrag] = useState<{ readonly dx: number; readonly dy: number }>({ dx: 0, dy: 0 });
  const [pinchScale, setPinchScale] = useState(1);
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(() => new Set<string>());

  // PanResponder は 1 度だけ作るため、最新値を ref で参照する。
  const centerRef = useRef(center);
  centerRef.current = center;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const pinchRef = useRef<{ readonly startDistance: number; scale: number } | null>(null);
  const movedRef = useRef(false);
  const lastTapRef = useRef(0);

  const tiles = useMemo(
    () => visibleTiles(center, zoom, layout.width, layout.height, undefined, TILE_PADDING_PX),
    [center, zoom, layout.width, layout.height],
  );

  // 中心・ズームが変わったら失敗状態とドラッグ状態をリセットする。
  useEffect(() => {
    setFailedKeys(new Set<string>());
    setDrag({ dx: 0, dy: 0 });
  }, [center.latitude, center.longitude, zoom]);

  const allTilesFailed = tiles.length > 0 && tiles.every((tile) => failedKeys.has(tile.key));

  const handleLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }): void => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const markFailed = (key: string): void => {
    setFailedKeys((current) => {
      if (current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          pinchRef.current = null;
          movedRef.current = false;
        },
        onPanResponderMove: (event, gestureState: PanResponderGestureState) => {
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            const first = touches[0];
            const second = touches[1];
            if (first === undefined || second === undefined) {
              return;
            }
            const distance = Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
            if (pinchRef.current === null) {
              pinchRef.current = { startDistance: distance, scale: 1 };
            } else if (pinchRef.current.startDistance > 0) {
              const rawScale = distance / pinchRef.current.startDistance;
              const scale = Math.min(MAX_PINCH_SCALE, Math.max(MIN_PINCH_SCALE, rawScale));
              pinchRef.current.scale = scale;
              setPinchScale(scale);
            }
            return;
          }
          if (Math.abs(gestureState.dx) > DRAG_THRESHOLD_PX || Math.abs(gestureState.dy) > DRAG_THRESHOLD_PX) {
            movedRef.current = true;
          }
          setDrag({ dx: gestureState.dx, dy: gestureState.dy });
        },
        onPanResponderRelease: (_event, gestureState: PanResponderGestureState) => {
          const pinch = pinchRef.current;
          pinchRef.current = null;
          setPinchScale(1);
          if (pinch !== null) {
            const steps = Math.round(Math.log2(pinch.scale));
            if (steps !== 0) {
              onZoomChange(clampZoom(zoomRef.current + steps));
            }
            setDrag({ dx: 0, dy: 0 });
            return;
          }

          const { width, height } = layoutRef.current;
          if (movedRef.current && width > 0 && height > 0) {
            const nextCenter = screenPointToGeo(
              { x: width / 2 - gestureState.dx, y: height / 2 - gestureState.dy },
              centerRef.current,
              zoomRef.current,
              width,
              height,
            );
            setDrag({ dx: 0, dy: 0 });
            onCenterChange(nextCenter);
            return;
          }

          // タップ: ダブルタップでズームイン。
          const now = Date.now();
          if (now - lastTapRef.current < DOUBLE_TAP_MS) {
            lastTapRef.current = 0;
            onZoomChange(clampZoom(zoomRef.current + 1));
          } else {
            lastTapRef.current = now;
          }
          setDrag({ dx: 0, dy: 0 });
        },
        onPanResponderTerminate: () => {
          pinchRef.current = null;
          setPinchScale(1);
          setDrag({ dx: 0, dy: 0 });
        },
      }),
    [onCenterChange, onZoomChange],
  );

  return (
    <View style={styles.container} onLayout={handleLayout} testID="osm-map-view" {...panResponder.panHandlers}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: drag.dx }, { translateY: drag.dy }, { scale: pinchScale }] },
        ]}
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
                onError={() => markFailed(tile.key)}
              />
            ))
          : null}
      </View>

      {/* 中央固定ピン（先端が選択地点） */}
      <View pointerEvents="none" style={styles.centerPin}>
        <View style={styles.centerPinHead} />
        <View style={styles.centerPinTip} />
      </View>
      <View pointerEvents="none" style={styles.centerDot} />

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

const PIN_WIDTH = 28;
const PIN_HEIGHT = 38;

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
  centerPin: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: PIN_WIDTH,
    height: PIN_HEIGHT,
    marginLeft: -PIN_WIDTH / 2,
    marginTop: -PIN_HEIGHT,
    alignItems: 'center',
  },
  centerPinHead: {
    width: PIN_WIDTH,
    height: PIN_WIDTH,
    borderRadius: PIN_WIDTH / 2,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  centerPinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.primary,
    marginTop: -1,
  },
  centerDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 8,
    height: 8,
    marginLeft: -4,
    marginTop: -4,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
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

import { useEffect, useRef, type ReactElement } from 'react';
import { Animated, Easing, StyleSheet, useAnimatedValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { nextContinuousAngleDeg, reduceContinuousAngle } from '../../domain/rotation';
import { birdAccessibilityLabel } from '../labels';
import { TOUCAN_PATHS, TOUCAN_VIEWBOX } from './toucanPaths';

/** 回転アニメーションの時間（ms）。§9.3 / NFR-07。 */
const ROTATION_DURATION_MS = 250;
/** 累積回転角を収める範囲（`interpolate` の inputRange と一致させる）。§9.3 / §18-2。 */
const CONTINUOUS_ANGLE_LIMIT_DEG = 720;

export interface BirdProps {
  /** 表示用の相対方位（`NavState.relativeBearingDeg`。**UI では再計算しない**）。 */
  readonly relativeBearingDeg: number | null;
  /** 到着時は上向き（0°）固定。§9.5 / ADR-03。 */
  readonly arrived: boolean;
  /** 描画サイズ（正方形・pt）。 */
  readonly size?: number;
}

/**
 * オオハシ（トゥーカン）のマスコット。§9.3 / T22。
 *
 * - パスデータは designer 提供の `toucanPaths.ts`（viewBox `0 0 100 100`・クチバシ上向き）。
 * - 回転は**外側の `Animated.View` の `transform: rotate`** で行う。
 *   `react-native-svg` の props に `Animated.Value` を渡さない（文字列化され解釈されない。§18-1）。
 * - `nextContinuousAngleDeg` で最短経路の累積角度を求め、`reduceContinuousAngle` で ±720° に収める。
 * - ニュートラル（相対方位 null）・到着時は目標 0°（上向き）。
 * - 初回マウントはアニメーションせず即時設定（ちらつき防止）。
 * - 回転の正方向（`+` = 時計回り）は実機の目視確認（D2 / §18-3）で最終確認する。
 */
export function Bird({ relativeBearingDeg, arrived, size = 220 }: BirdProps): ReactElement {
  const angle = useAnimatedValue(0);
  /** 前回の累積回転角（連続値。±720° 以内）。 */
  const continuousDegRef = useRef(0);
  /** 初回マウント済みか（初回は setValue で即時表示）。 */
  const mountedRef = useRef(false);
  const animationRef = useRef<ReturnType<typeof Animated.timing> | null>(null);

  // 相対方位（度）をそのまま回転角にする（`+90` = 右。符号は D2 で確認）。
  const rotate = angle.interpolate({
    inputRange: [-CONTINUOUS_ANGLE_LIMIT_DEG, CONTINUOUS_ANGLE_LIMIT_DEG],
    outputRange: [
      `-${CONTINUOUS_ANGLE_LIMIT_DEG}deg`,
      `${CONTINUOUS_ANGLE_LIMIT_DEG}deg`,
    ],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    const assetDeg = relativeBearingDeg === null || arrived ? 0 : relativeBearingDeg;
    const targetDeg = reduceContinuousAngle(
      nextContinuousAngleDeg(continuousDegRef.current, assetDeg),
      CONTINUOUS_ANGLE_LIMIT_DEG,
    );
    continuousDegRef.current = targetDeg;

    if (!mountedRef.current) {
      // 初回はアニメーションせず即時表示（§9.3）。
      mountedRef.current = true;
      animationRef.current = null;
      angle.setValue(targetDeg);
      return;
    }

    const animation = Animated.timing(angle, {
      toValue: targetDeg,
      duration: ROTATION_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animationRef.current = animation;
    animation.start();
    return () => {
      animation.stop();
    };
  }, [angle, arrived, relativeBearingDeg]);

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={birdAccessibilityLabel(relativeBearingDeg, arrived)}
      style={[styles.container, { width: size, height: size, transform: [{ rotate }] }]}
    >
      <Svg width={size} height={size} viewBox={TOUCAN_VIEWBOX}>
        {TOUCAN_PATHS.map((path, index) => (
          <Path key={`toucan-path-${index}`} d={path.d} fill={path.fill} />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

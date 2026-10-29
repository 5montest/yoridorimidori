import { useEffect, useRef, type ReactElement } from 'react';
import { Animated, Easing, Image, StyleSheet, useAnimatedValue } from 'react-native';
import { nextContinuousAngleDeg, reduceContinuousAngle } from '../../domain/rotation';
import { UI_TEXT, birdAccessibilityLabel } from '../labels';
import toucanImage from '../../../assets/toucan.png';
import sleepingToucanImage from '../../../assets/toucan-sleeping.png';

/** 回転アニメーションの時間（ms）。§9.3 / NFR-07。 */
const ROTATION_DURATION_MS = 250;
/** 累積回転角を収める範囲（`interpolate` の inputRange と一致させる）。§9.3 / §18-2。 */
const CONTINUOUS_ANGLE_LIMIT_DEG = 720;

/** オオハシの姿勢。`standing` = 案内中（回転する）、`sleeping` = 未選択時（休んでいる）。 */
export type BirdPose = 'standing' | 'sleeping';

/** 姿勢ごとの呼吸アニメ（待機時に画面が生きているように見せる）。 */
const BREATHING = {
  standing: { amplitude: 1.015, halfPeriodMs: 1500 },
  sleeping: { amplitude: 1.02, halfPeriodMs: 2200 },
} as const;

export interface BirdProps {
  /** 表示用の相対方位（`NavState.relativeBearingDeg`。**UI では再計算しない**）。 */
  readonly relativeBearingDeg: number | null;
  /** 到着時は上向き（0°）固定。§9.5 / ADR-03。 */
  readonly arrived: boolean;
  /** 描画サイズ（正方形・pt）。 */
  readonly size?: number;
  /** 姿勢。未指定は `standing`（案内中）。 */
  readonly pose?: BirdPose;
}

/**
 * オオハシ（トゥーカン）のマスコット。§9.3 / T22。
 *
 * - 画像は designer 提供の **`mobile/assets/toucan.png`**（案内中・1024x1024 / RGBA 透過 / クチバシ上向き）
 *   と **`mobile/assets/toucan-sleeping.png`**（未選択時・休んでいる姿）。
 * - 回転は**外側の `Animated.View` の `transform: rotate`** で行う（`Image` に Animated 値を渡さない）。
 * - **呼吸するような待機アニメ**（`scale` を ±1.5〜2% で往復）を内側の `Animated.View` に付ける。
 * - `nextContinuousAngleDeg` で最短経路の累積角度を求め、`reduceContinuousAngle` で ±720° に収める。
 * - ニュートラル（相対方位 null）・到着時・`sleeping` は目標 0°（上向き）。
 * - 初回マウントはアニメーションせず即時設定（ちらつき防止）。
 * - 回転の正方向（`+` = 時計回り）は実機の目視確認（D2 / §18-3）で最終確認する。
 */
export function Bird({
  relativeBearingDeg,
  arrived,
  size = 220,
  pose = 'standing',
}: BirdProps): ReactElement {
  const angle = useAnimatedValue(0);
  const breathing = useAnimatedValue(1);
  /** 前回の累積回転角（連続値。±720° 以内）。 */
  const continuousDegRef = useRef(0);
  /** 初回マウント済みか（初回は setValue で即時表示）。 */
  const mountedRef = useRef(false);
  const animationRef = useRef<ReturnType<typeof Animated.timing> | null>(null);

  const isSleeping = pose === 'sleeping';

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
    const assetDeg =
      isSleeping || relativeBearingDeg === null || arrived ? 0 : relativeBearingDeg;
    const rawNextDeg = nextContinuousAngleDeg(continuousDegRef.current, assetDeg);
    const targetDeg = reduceContinuousAngle(rawNextDeg, CONTINUOUS_ANGLE_LIMIT_DEG);

    // `reduceContinuousAngle` が値を変えるのは 360° の倍数だけ。その分だけアニメーションの
    // 現在値もシフトすれば見た目は変わらないため、±720° 境界でも最短経路の回転を保てる。
    // （例: 719° + 2° → 721° を 361° に丸める際、基準を -360° して 359° → 361° の +2° にする）
    // 回転方向の符号とあわせて D2（実機目視）で最終確認する（§18-2 / §18-3）。
    const shiftDeg = targetDeg - rawNextDeg;
    if (shiftDeg !== 0) {
      angle.setValue(continuousDegRef.current + shiftDeg);
      continuousDegRef.current += shiftDeg;
    }

    if (!mountedRef.current) {
      // 初回はアニメーションせず即時表示（§9.3）。
      mountedRef.current = true;
      animationRef.current = null;
      continuousDegRef.current = targetDeg;
      angle.setValue(targetDeg);
      return;
    }

    continuousDegRef.current = targetDeg;
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
  }, [angle, arrived, isSleeping, relativeBearingDeg]);

  // 待機中の呼吸アニメ（姿勢で周期・振幅を変える）。
  useEffect(() => {
    const { amplitude, halfPeriodMs } = BREATHING[pose];
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathing, {
          toValue: amplitude,
          duration: halfPeriodMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathing, {
          toValue: 1,
          duration: halfPeriodMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [breathing, pose]);

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        isSleeping ? UI_TEXT.main.sleepingBirdLabel : birdAccessibilityLabel(relativeBearingDeg, arrived)
      }
      style={[styles.container, { width: size, height: size, transform: [{ rotate }] }]}
    >
      <Animated.View style={{ transform: [{ scale: breathing }] }}>
        <Image
          source={isSleeping ? sleepingToucanImage : toucanImage}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

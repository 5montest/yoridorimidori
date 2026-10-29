import { useEffect, useRef, type ReactElement } from 'react';
import { Animated, Easing, Image, StyleSheet, useAnimatedValue } from 'react-native';
import { nextContinuousAngleDeg, reduceContinuousAngle } from '../../domain/rotation';
import { birdAccessibilityLabel } from '../labels';
import toucanImage from '../../../assets/toucan.png';

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
 * - 画像は designer 提供の **`mobile/assets/toucan.png`**（1024x1024 / RGBA 透過 / クチバシ上向き）。
 *   viewBox `0 0 100 100` と同一レイアウトで描画されているため、`size` をそのまま width/height に使える。
 * - **`react-native-svg` は使わない**（2026-10-30 変更）。理由: Android の new-arch codegen
 *   (`react_codegen_rnsvg`) が Windows の 260 文字パス制限に抵触し、ローカル APK ビルドが失敗するため。
 *   PNG 画像なら codegen が不要になり、ビルドが通る（見た目は SVG 版とほぼ同一）。
 * - 回転は**外側の `Animated.View` の `transform: rotate`** で行う（`Image` に Animated 値を渡さない）。
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
  }, [angle, arrived, relativeBearingDeg]);

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={birdAccessibilityLabel(relativeBearingDeg, arrived)}
      style={[styles.container, { width: size, height: size, transform: [{ rotate }] }]}
    >
      <Image
        source={toucanImage}
        style={[styles.image, { width: size, height: size }]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    // PNG は viewBox と同一レイアウト（鳥＝高さ約 88%・水平中央）なので追加の拡大は不要。
    transform: [],
  },
});

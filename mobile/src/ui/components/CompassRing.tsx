import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE } from '../theme';

/** 目盛りの本数（30° ごと）。 */
const TICK_COUNT = 12;

export interface CompassRingProps {
  /** リングの直径（pt）。 */
  readonly size: number;
}

/**
 * メイン画面の方位リング（S2）。
 *
 * - **表示専用**。端末の向きを基準にした目盛りと「まえ／うしろ／ひだり／みぎ」を表示する。
 * - 中央のオオハシがこのリングの中で回転するため、「どれだけ曲がればよいか」が直感的に分かる。
 * - 操作は受け付けない（`pointerEvents="none"`）。ボタンは置かない（UX-1）。
 */
export function CompassRing({ size }: CompassRingProps): ReactElement {
  const radius = size / 2;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.container, { width: size, height: size, borderRadius: radius }]}
    >
      <View style={[styles.circle, { width: size, height: size, borderRadius: radius }]} />

      {Array.from({ length: TICK_COUNT }, (_, index) => (
        <View
          key={`tick-${index}`}
          style={[
            styles.tickLayer,
            { width: size, height: size, transform: [{ rotate: `${(360 / TICK_COUNT) * index}deg` }] },
          ]}
        >
          <View style={[styles.tick, index % 3 === 0 ? styles.tickMajor : null]} />
        </View>
      ))}

      <Text style={[styles.label, styles.labelTop]}>{UI_TEXT.compassRing.front}</Text>
      <Text style={[styles.label, styles.labelBottom]}>{UI_TEXT.compassRing.back}</Text>
      <Text style={[styles.label, styles.labelLeft]}>{UI_TEXT.compassRing.left}</Text>
      <Text style={[styles.label, styles.labelRight]}>{UI_TEXT.compassRing.right}</Text>
    </View>
  );
}

const LABEL_INSET = 10;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tickLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  tick: {
    width: 2,
    height: 6,
    borderRadius: 1,
    backgroundColor: COLORS.border,
  },
  tickMajor: {
    height: 10,
    backgroundColor: COLORS.textMuted,
  },
  label: {
    position: 'absolute',
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
    letterSpacing: 2,
  },
  labelTop: {
    top: LABEL_INSET,
    alignSelf: 'center',
  },
  labelBottom: {
    bottom: LABEL_INSET,
    alignSelf: 'center',
  },
  labelLeft: {
    left: LABEL_INSET,
    top: '50%',
    marginTop: -FONT_SIZE.caption / 2,
  },
  labelRight: {
    right: LABEL_INSET,
    top: '50%',
    marginTop: -FONT_SIZE.caption / 2,
  },
});

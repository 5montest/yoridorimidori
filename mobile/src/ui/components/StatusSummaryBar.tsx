import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { GpsAccuracyClass, HeadingAccuracyClass } from '../../domain/types';
import { UI_TEXT, statusSummaryLine } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';

export interface StatusSummaryBarProps {
  readonly gpsAccuracyClass: GpsAccuracyClass;
  readonly headingAccuracyClass: HeadingAccuracyClass;
  /** タップで状態の詳細シート（S6）を開く。 */
  readonly onPress: () => void;
}

/**
 * 1 行の状態サマリ（S2）。「GPS：良好　コンパス：普通」。
 *
 * - 生の精度数値・専門用語は出さない（UX-4）。詳細は S6（`StatusDetailSheet`）へ。
 * - タップ領域は 48dp 以上。
 */
export function StatusSummaryBar({
  gpsAccuracyClass,
  headingAccuracyClass,
  onPress,
}: StatusSummaryBarProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={UI_TEXT.main.statusSummaryHint}
      onPress={onPress}
      style={({ pressed }) => [styles.bar, pressed ? styles.pressed : null]}
    >
      <Text style={styles.text}>
        {statusSummaryLine(gpsAccuracyClass, headingAccuracyClass)}
      </Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: TAP_TARGET_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  text: {
    flex: 1,
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
  },
  chevron: {
    fontSize: FONT_SIZE.title,
    color: COLORS.textMuted,
  },
  pressed: {
    opacity: 0.8,
  },
});

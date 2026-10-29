import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GeoPoint } from '../../domain/types';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';

export interface MapScreenProps {
  readonly initialPoint: GeoPoint | null;
  readonly selectedPoint: GeoPoint | null;
  readonly selectedLabel: string | null;
  readonly resolving: boolean;
  readonly onPick: (point: GeoPoint) => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

/**
 * 地図で選ぶ画面の Web フォールバック（S4）。§18-11 / U07。
 *
 * - **地図ライブラリを import しない**（Web では地図が動かないため）。
 * - 「地図はこのプラットフォームでは表示できません」＋実機での利用案内を出す。
 */
export function MapScreen({ onBack }: MapScreenProps): ReactElement {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.backIcon, pressed ? styles.pressed : null]}
        >
          <Text style={styles.backIconText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{UI_TEXT.mapPick.title}</Text>
      </View>
      <Text style={styles.fallback}>{UI_TEXT.mapPick.webFallback}</Text>
      <Text style={styles.body}>{UI_TEXT.mapPick.webFallbackBody}</Text>
      <Text style={styles.hint}>{UI_TEXT.mapPick.instruction}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    gap: SPACING.md,
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
  fallback: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
  },
  body: {
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  hint: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  pressed: {
    opacity: 0.8,
  },
});

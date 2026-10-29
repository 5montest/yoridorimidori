import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';

export type PrimaryButtonVariant = 'primary' | 'secondary';

export interface PrimaryButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: PrimaryButtonVariant;
  readonly disabled?: boolean;
  /** スクリーンリーダー向けの補足（任意）。 */
  readonly accessibilityHint?: string;
}

/**
 * 主要操作ボタン。UX-7（タップ領域 ≥ 48dp・大きな文字）に対応する共通部品。
 * 文言は呼び出し側（`ui/labels.ts`）から渡す。
 */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityHint,
}: PrimaryButtonProps): ReactElement {
  const secondary = variant === 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondary : styles.primary,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.label, secondary ? styles.secondaryLabel : styles.primaryLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP_TARGET_MIN + 8,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  primary: {
    backgroundColor: COLORS.primary,
  },
  secondary: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: FONT_SIZE.button,
    fontWeight: '700',
  },
  primaryLabel: {
    color: COLORS.onPrimary,
  },
  secondaryLabel: {
    color: COLORS.primary,
  },
});

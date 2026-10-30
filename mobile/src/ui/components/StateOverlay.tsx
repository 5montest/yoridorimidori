import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';

export interface StateOverlayProps {
  /** 見出し（例:「現在地が分からなくなりました」）。 */
  readonly title: string;
  /** 本文（次に何をすればよいかを 1 文で）。 */
  readonly body: string;
  readonly primaryLabel: string;
  readonly onPrimary: () => void;
  /** 閉じる（省略可）。 */
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
}

/**
 * 画面コンテンツの上に浮かぶ状態オーバーレイ（2026-10-30 追加）。
 *
 * - **レイアウトを押し下げない**（`position: absolute`）。メイン画面の鳥・距離の位置は変わらない。
 * - 背景は透明のまま（地図や鳥は見える）。カードだけがタップ可能で、背景はタップを透過する。
 * - 見出し・本文・主ボタン（＋任意で閉じる）だけのシンプルな構成。
 */
export function StateOverlay({
  title,
  body,
  primaryLabel,
  onPrimary,
  dismissLabel,
  onDismiss,
}: StateOverlayProps): ReactElement {
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            onPress={onPrimary}
            style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </Pressable>
          {dismissLabel === undefined || onDismiss === undefined ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dismissLabel}
              onPress={onDismiss}
              style={({ pressed }) => [styles.dismissButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.dismissText}>{dismissLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 120,
    left: SPACING.md,
    right: SPACING.md,
    alignItems: 'center',
    zIndex: 10,
    elevation: 8,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  title: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
  },
  body: {
    fontSize: FONT_SIZE.body,
    lineHeight: 22,
    color: COLORS.text,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  primaryButton: {
    minHeight: TAP_TARGET_MIN,
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
  },
  primaryText: {
    color: COLORS.onPrimary,
    fontSize: FONT_SIZE.body,
    fontWeight: '700',
  },
  dismissButton: {
    minHeight: TAP_TARGET_MIN,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  dismissText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});

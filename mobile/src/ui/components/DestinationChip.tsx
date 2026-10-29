import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';

export interface DestinationChipProps {
  /** 選択中の目的地名。未選択なら `null`。 */
  readonly name: string | null;
  /** お気に入り状態。`null` は「お気に入り未対応」（☆ を表示しない）。 */
  readonly favorite: boolean | null;
  /** タップで目的地選択画面（S3）へ。 */
  readonly onPress: () => void;
  /** ☆ の切り替え。未指定なら ☆ を表示しない。 */
  readonly onToggleFavorite?: () => void;
}

/**
 * 目的地チップ（S2 上部）。名前 + ▾ + ☆。UX-2 / F4。
 *
 * - 表示専用（`ui/` は hooks/adapters を import しない）。
 * - ☆ は `favorite` / `onToggleFavorite` が揃っているときだけ表示する（データ層の対応後に有効化）。
 */
export function DestinationChip({
  name,
  favorite,
  onPress,
  onToggleFavorite,
}: DestinationChipProps): ReactElement {
  const showFavorite = favorite !== null && onToggleFavorite !== undefined;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${UI_TEXT.main.destinationChipPrefix}: ${
          name ?? UI_TEXT.main.destinationChipEmpty
        }`}
        onPress={onPress}
        style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
      >
        <Text style={styles.chipText} numberOfLines={1}>
          {name ?? UI_TEXT.main.destinationChipEmpty}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      {showFavorite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            favorite ? UI_TEXT.main.favoriteRemove : UI_TEXT.main.favoriteAdd
          }
          accessibilityState={{ selected: favorite }}
          onPress={onToggleFavorite}
          style={({ pressed }) => [styles.favorite, pressed ? styles.pressed : null]}
        >
          <Text style={[styles.favoriteText, favorite ? styles.favoriteOn : null]}>
            {favorite ? '★' : '☆'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    minHeight: TAP_TARGET_MIN,
    maxWidth: 220,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  chipText: {
    flexShrink: 1,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
  },
  caret: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  favorite: {
    width: TAP_TARGET_MIN,
    height: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteText: {
    fontSize: FONT_SIZE.heading,
    color: COLORS.textMuted,
  },
  favoriteOn: {
    color: '#C98A12',
  },
  pressed: {
    opacity: 0.8,
  },
});

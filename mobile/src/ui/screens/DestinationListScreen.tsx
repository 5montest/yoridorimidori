import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Destination } from '../../domain/types';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';
import { PrimaryButton } from '../components/PrimaryButton';

export interface DestinationListScreenProps {
  readonly destinations: readonly Destination[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onDelete: (id: string) => void;
  /** 現在地を目的地にする（現在地が使えないときは App 側が失敗を表示）。 */
  readonly onUseCurrentLocation: () => void;
  /** 地図で選ぶ画面（S4）へ。 */
  readonly onOpenMap: () => void;
  readonly onBack: () => void;
}

/**
 * 目的地の選択画面（暫定 S3）。U06 完成までの橋渡し。
 *
 * - **座標は表示しない**（UX-1: 座標は内部表現）。名前と選択・削除のみ。
 * - 一般ユーザーが使える入口として「現在地を目的地にする」「地図から選ぶ」を置く。
 * - U06 で検索バー・最近・お気に入り・共有リンクを含む本実装に置き換える。
 */
export function DestinationListScreen({
  destinations,
  selectedId,
  onSelect,
  onDelete,
  onUseCurrentLocation,
  onOpenMap,
  onBack,
}: DestinationListScreenProps): ReactElement {
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
        <Text style={styles.title}>{UI_TEXT.destinationList.title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.quickActions}>
          <PrimaryButton
            label={UI_TEXT.destinationList.useCurrentLocation}
            onPress={onUseCurrentLocation}
          />
          <PrimaryButton
            label={UI_TEXT.destinationList.openMap}
            variant="secondary"
            onPress={onOpenMap}
          />
        </View>

        <Text style={styles.sectionTitle}>{UI_TEXT.destinationList.title}</Text>
        {destinations.length === 0 ? (
          <Text style={styles.empty}>{UI_TEXT.destinationList.empty}</Text>
        ) : (
          destinations.map((destination) => {
            const selected = destination.id === selectedId;
            return (
              <View
                key={destination.id}
                style={[styles.row, selected ? styles.rowSelected : null]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(destination.id)}
                  style={styles.rowMain}
                >
                  <Text style={styles.name} numberOfLines={2}>
                    {destination.name}
                  </Text>
                  {selected ? (
                    <Text style={styles.selectedLabel}>
                      {UI_TEXT.destinationList.selected}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${destination.name} ${UI_TEXT.destinationList.delete}`}
                  onPress={() => onDelete(destination.id)}
                  style={({ pressed }) => [styles.deleteButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.deleteButtonText}>{UI_TEXT.destinationList.delete}</Text>
                </Pressable>
              </View>
            );
          })
        )}
        <Text style={styles.hint}>{UI_TEXT.destinationList.hint}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    gap: SPACING.sm,
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
  content: {
    gap: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  quickActions: {
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.body,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  empty: {
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    minHeight: TAP_TARGET_MIN + 16,
  },
  rowSelected: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  rowMain: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  name: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectedLabel: {
    fontSize: FONT_SIZE.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  deleteButton: {
    minHeight: TAP_TARGET_MIN,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  deleteButtonText: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
  hint: {
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  pressed: {
    opacity: 0.8,
  },
});

import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Destination } from '../../domain/types';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

export interface DestinationListScreenProps {
  readonly destinations: readonly Destination[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onAddNew: () => void;
  readonly onBack: () => void;
}

/** 座標の表示整形（内部値は変更しない。5 桁小数で十分な精度）。 */
function formatPoint(destination: Destination): string {
  return `${destination.point.latitude.toFixed(5)}, ${destination.point.longitude.toFixed(5)}`;
}

/**
 * 目的地の一覧・選択・削除画面。§9.1 / FR-01。
 *
 * - **表示専用**。一覧・選択 id・コールバックを props で受け取り、`hooks` / `adapters` を import しない。
 * - 選択中が削除されたときの選択解除はリデューサ（T19）と useNavApp（T20）が担う。
 */
export function DestinationListScreen({
  destinations,
  selectedId,
  onSelect,
  onDelete,
  onAddNew,
  onBack,
}: DestinationListScreenProps): ReactElement {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{UI_TEXT.destinationList.title}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onAddNew}
          style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.primaryButtonText}>{UI_TEXT.destinationList.add}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
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
                  <View style={styles.rowText}>
                    <Text style={styles.name}>
                      {destination.name}
                      {selected ? `（${UI_TEXT.destinationList.selected}）` : ''}
                    </Text>
                    <Text style={styles.point}>{formatPoint(destination)}</Text>
                  </View>
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
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.backButtonText}>{UI_TEXT.destinationList.back}</Text>
      </Pressable>
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
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  listContent: {
    gap: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  empty: {
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xl,
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
  },
  rowSelected: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  rowMain: {
    flex: 1,
  },
  rowText: {
    gap: 2,
  },
  name: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
    color: COLORS.text,
  },
  point: {
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
  },
  deleteButton: {
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
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  primaryButtonText: {
    color: COLORS.onPrimary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
  backButton: {
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});

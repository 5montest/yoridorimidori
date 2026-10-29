import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  UI_TEXT,
  searchResultCountLabel,
  searchStatusMessageLabel,
  type SearchStatus,
} from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';
import { PrimaryButton } from '../components/PrimaryButton';

/** 検索結果の 1 件（住所は取得できなければ null）。座標は表示しない（UX-1）。 */
export interface SearchResultItem {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
}

export interface SearchResultsScreenProps {
  readonly query: string;
  /** 検索の状態（App が `useDestinationPicker` の状態を渡す）。 */
  readonly status: SearchStatus;
  readonly results: readonly SearchResultItem[];
  /** 失敗時の補足（任意。アダプタのメッセージ等）。基本文言は labels。 */
  readonly errorMessage: string | null;
  readonly onSelect: (id: string) => void;
  readonly onRetry: () => void;
  readonly onOpenMapPick: () => void;
  readonly onUseCurrentLocation: () => void;
  readonly onBack: () => void;
}

/**
 * 検索結果画面（S5）。F3 / U08。
 *
 * - Android の geocode は**最大 1 件**しか返さないため、0 件 / 1 件を前提にしたカード型 UI。
 * - 0 件・失敗時は「地図から選ぶ」「現在地を使う」という**次の一手**を必ず出す（UX-5）。
 * - 座標は表示しない（UX-1）。
 */
export function SearchResultsScreen({
  query,
  status,
  results,
  errorMessage,
  onSelect,
  onRetry,
  onOpenMapPick,
  onUseCurrentLocation,
  onBack,
}: SearchResultsScreenProps): ReactElement {
  const message = searchStatusMessageLabel(status);

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
        <Text style={styles.title}>{UI_TEXT.searchResults.title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.query} numberOfLines={2}>
          {`「${query}」`}
        </Text>

        {status === 'loading' ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.hint}>{UI_TEXT.searchResults.loading}</Text>
          </View>
        ) : null}

        {status === 'success' ? (
          <View style={styles.section}>
            <Text style={styles.count}>
              {searchResultCountLabel(results.length)}
            </Text>
            {results.map((result) => (
              <Pressable
                key={result.id}
                accessibilityRole="button"
                onPress={() => onSelect(result.id)}
                style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
              >
                <Text style={styles.cardName} numberOfLines={2}>
                  {result.name}
                </Text>
                <Text style={styles.cardAddress} numberOfLines={2}>
                  {result.address ?? UI_TEXT.searchResults.addressUnknown}
                </Text>
                <Text style={styles.cardAction}>{UI_TEXT.searchResults.title} ›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {status === 'empty' || status === 'error' ? (
          <View style={styles.section}>
            <Text style={styles.stateTitle}>
              {status === 'empty'
                ? UI_TEXT.searchResults.emptyTitle
                : UI_TEXT.searchResults.errorTitle}
            </Text>
            <Text style={styles.body}>
              {status === 'empty'
                ? UI_TEXT.searchResults.emptyBody
                : UI_TEXT.searchResults.errorBody}
            </Text>
            {errorMessage === null ? null : (
              <Text style={styles.hint}>{errorMessage}</Text>
            )}
            <PrimaryButton
              label={UI_TEXT.searchResults.openMap}
              onPress={onOpenMapPick}
            />
            <PrimaryButton
              label={UI_TEXT.searchResults.useCurrentLocation}
              variant="secondary"
              onPress={onUseCurrentLocation}
            />
            {status === 'error' ? (
              <PrimaryButton
                label={UI_TEXT.searchResults.retry}
                variant="secondary"
                onPress={onRetry}
              />
            ) : null}
          </View>
        ) : null}

        {message.length > 0 && status !== 'loading' && status !== 'empty' && status !== 'error' ? (
          <Text style={styles.hint}>{message}</Text>
        ) : null}
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
    gap: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  query: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
  },
  centerBlock: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  section: {
    gap: SPACING.sm,
  },
  count: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    minHeight: TAP_TARGET_MIN + 24,
  },
  cardName: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardAddress: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  cardAction: {
    fontSize: FONT_SIZE.body,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: SPACING.xs,
  },
  stateTitle: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  body: {
    fontSize: FONT_SIZE.bodyLarge,
    lineHeight: 24,
    color: COLORS.text,
  },
  hint: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  pressed: {
    opacity: 0.8,
  },
});

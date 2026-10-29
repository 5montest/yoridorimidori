import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  UI_TEXT,
  shareLinkMessageLabel,
  type ShareLinkState,
} from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';
import { PrimaryButton } from '../components/PrimaryButton';

/** 最近使った場所・お気に入りの 1 行（座標は UI に出さない。UX-1）。 */
export interface PickerPlace {
  readonly id: string;
  readonly name: string;
}

export interface DestinationPickerScreenProps {
  /** 検索バーの入力値（App が保持）。 */
  readonly searchQuery: string;
  readonly onChangeSearchQuery: (query: string) => void;
  /** 「検索」ボタン/Enter で S5（検索結果）へ。 */
  readonly onSubmitSearch: () => void;
  /** 現在地が使えるか（位置なし・途絶なら false）。 */
  readonly currentLocationAvailable: boolean;
  /** 位置が「途絶」しているか（無効理由の文言の出し分け）。 */
  readonly currentLocationLost: boolean;
  readonly onUseCurrentLocation: () => void;
  /** 地図で選ぶ（S4）へ。 */
  readonly onOpenMapPick: () => void;
  readonly recent: readonly PickerPlace[];
  readonly favorites: readonly PickerPlace[];
  readonly onSelectRecent: (id: string) => void;
  readonly onSelectFavorite: (id: string) => void;
  /** 共有リンク取り込みの状態（タップ時のみクリップボードを読む）。 */
  readonly shareLinkState: ShareLinkState;
  readonly onImportShareLink: () => void;
  /** 共有リンク導線を出すか（U03/U05 配線前は false にして未実装ボタンを見せない）。 */
  readonly shareLinkEnabled?: boolean;
  readonly onBack: () => void;
}

/**
 * 目的地を選ぶ画面（S3）。UX-3 / F2〜F5 / U06。
 *
 * - 選び方は「検索 / 現在地 / 地図から選ぶ / 最近 / お気に入り」＋「コピーしたリンクから設定」。
 * - **座標は表示しない**（UX-1）。データは props、操作はコールバック（`ui/` は hooks/adapters を import しない）。
 * - 検索は「検索」ボタン確定（インクリメンタル検索にしない。geocode は最大 1 件・レート制約のため）。
 * - 共有リンクは**ユーザーがタップした時だけ**クリップボードを読む（Android 10+ の制約）。
 */
export function DestinationPickerScreen({
  searchQuery,
  onChangeSearchQuery,
  onSubmitSearch,
  currentLocationAvailable,
  currentLocationLost,
  onUseCurrentLocation,
  onOpenMapPick,
  recent,
  favorites,
  onSelectRecent,
  onSelectFavorite,
  shareLinkState,
  onImportShareLink,
  shareLinkEnabled = true,
  onBack,
}: DestinationPickerScreenProps): ReactElement {
  const shareLinkMessage = shareLinkMessageLabel(shareLinkState);
  const locationReason = currentLocationLost
    ? UI_TEXT.destinationPicker.currentLocationLost
    : currentLocationAvailable
      ? null
      : UI_TEXT.destinationPicker.currentLocationUnavailable;

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
        <Text style={styles.title}>{UI_TEXT.destinationPicker.title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.searchRow}>
          <TextInput
            value={searchQuery}
            onChangeText={onChangeSearchQuery}
            onSubmitEditing={onSubmitSearch}
            placeholder={UI_TEXT.destinationPicker.searchPlaceholder}
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel={UI_TEXT.destinationPicker.searchPlaceholder}
          />
          <Pressable
            accessibilityRole="button"
            onPress={onSubmitSearch}
            style={({ pressed }) => [styles.searchButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.searchButtonText}>
              {UI_TEXT.destinationPicker.searchButton}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>{UI_TEXT.destinationPicker.searchRequiresNetwork}</Text>

        <View style={styles.quickActions}>
          <PrimaryButton
            label={UI_TEXT.destinationPicker.useCurrentLocation}
            onPress={onUseCurrentLocation}
            disabled={!currentLocationAvailable}
          />
          {locationReason === null ? null : (
            <Text style={styles.hint}>{locationReason}</Text>
          )}
          <PrimaryButton
            label={UI_TEXT.destinationPicker.openMap}
            variant="secondary"
            onPress={onOpenMapPick}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {UI_TEXT.destinationPicker.recentTitle}
          </Text>
          {recent.length === 0 ? (
            <Text style={styles.hint}>{UI_TEXT.destinationPicker.noRecent}</Text>
          ) : (
            recent.map((place) => (
              <PlaceRow key={place.id} name={place.name} onPress={() => onSelectRecent(place.id)} />
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {UI_TEXT.destinationPicker.favoritesTitle}
          </Text>
          {favorites.length === 0 ? (
            <Text style={styles.hint}>{UI_TEXT.destinationPicker.noFavorites}</Text>
          ) : (
            favorites.map((place) => (
              <PlaceRow
                key={place.id}
                name={place.name}
                favorite
                onPress={() => onSelectFavorite(place.id)}
              />
            ))
          )}
        </View>

        {shareLinkEnabled ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {UI_TEXT.destinationPicker.otherMethodsTitle}
            </Text>
            <PrimaryButton
              label={UI_TEXT.destinationPicker.clipboardButton}
              variant="secondary"
              onPress={onImportShareLink}
              disabled={shareLinkState === 'reading'}
            />
            <Text style={styles.hint}>{UI_TEXT.destinationPicker.clipboardHint}</Text>
            {shareLinkMessage.length === 0 ? null : (
              <Text style={styles.message}>{shareLinkMessage}</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

interface PlaceRowProps {
  readonly name: string;
  readonly favorite?: boolean;
  readonly onPress: () => void;
}

function PlaceRow({ name, favorite = false, onPress }: PlaceRowProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.placeRow, pressed ? styles.pressed : null]}
    >
      <Text style={styles.placeName} numberOfLines={2}>
        {name}
      </Text>
      {favorite ? <Text style={styles.favoriteMark}>★</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
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
  searchRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'stretch',
  },
  searchInput: {
    flex: 1,
    minHeight: TAP_TARGET_MIN,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
  },
  searchButton: {
    minHeight: TAP_TARGET_MIN,
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
  },
  searchButtonText: {
    color: COLORS.onPrimary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
  },
  hint: {
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
  },
  message: {
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  quickActions: {
    gap: SPACING.sm,
  },
  section: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.body,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  placeRow: {
    minHeight: TAP_TARGET_MIN + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  placeName: {
    flex: 1,
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
  },
  favoriteMark: {
    fontSize: FONT_SIZE.bodyLarge,
    color: '#C98A12',
  },
  chevron: {
    fontSize: FONT_SIZE.title,
    color: COLORS.textMuted,
  },
  pressed: {
    opacity: 0.8,
  },
});

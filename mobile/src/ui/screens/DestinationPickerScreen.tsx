import { useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GeoPoint } from '../../domain/types';
import {
  UI_TEXT,
  shareLinkMessageLabel,
  type ShareLinkState,
} from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';
import { PrimaryButton } from '../components/PrimaryButton';
import { MapPreviewCard } from '../components/MapPreviewCard';
import { ClockIcon, LinkIcon, SearchIcon, StarIcon, TargetIcon } from '../components/icons';

/** 最近使った場所・お気に入りの 1 行（座標は UI に出さない。UX-1）。 */
export interface PickerPlace {
  readonly id: string;
  readonly name: string;
}

export interface DestinationPickerScreenProps {
  /** 検索バーの現在値（S5 から戻ったとき入力値を復元する）。 */
  readonly searchQuery: string;
  /** 「検索」ボタン/Enter で確定した検索語を渡す（S5 へ）。 */
  readonly onSubmitSearch: (query: string) => void;
  /** 現在地が使えるか（位置なし・途絶なら false）。 */
  readonly currentLocationAvailable: boolean;
  /** 位置が「途絶」しているか（無効理由の文言の出し分け）。 */
  readonly currentLocationLost: boolean;
  /** ミニマッププレビューの中心（現在地。無ければプレースホルダー）。 */
  readonly currentPoint: GeoPoint | null;
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
  /** 「この場所を目的地にする」（`shareLinkState === 'ready'` のときのみ）。 */
  readonly onConfirmShared?: () => void;
  readonly onDismissShared?: () => void;
  /** 共有リンク導線を出すか（U03/U05 配線前は false にして未実装ボタンを見せない）。 */
  readonly shareLinkEnabled?: boolean;
  readonly onBack: () => void;
}

/**
 * 目的地を選ぶ画面（S3）。UX-3 / F2〜F5 / U06。
 *
 * 構成（縦並びボタンをやめて「検索中心＋視覚的なカード」に刷新。2026-10-30）:
 * 1. **検索ヒーロー**: 虫めがねアイコン付きの大きな検索フィールド＋「検索」ピル
 * 2. **クイックカード**: 「現在地」「リンクから」の 2 枚（アイコン＋ラベル）
 * 3. **ミニマップカード**: 現在地周辺の地図プレビュー（タップで S4 の地図選択へ）
 * 4. **最近使った場所 / お気に入り**: アイコン付きのカードリスト
 *
 * - **座標は表示しない**（UX-1）。データは props、操作はコールバック（`ui/` は hooks/adapters を import しない）。
 * - 検索は「検索」ボタン確定（インクリメンタル検索にしない。geocode は最大 1 件・レート制約のため）。
 * - 共有リンクは**ユーザーがタップした時だけ**クリップボードを読む（Android 10+ の制約）。
 */
export function DestinationPickerScreen({
  searchQuery,
  onSubmitSearch,
  currentLocationAvailable,
  currentLocationLost,
  currentPoint,
  onUseCurrentLocation,
  onOpenMapPick,
  recent,
  favorites,
  onSelectRecent,
  onSelectFavorite,
  shareLinkState,
  onImportShareLink,
  onConfirmShared,
  onDismissShared,
  shareLinkEnabled = true,
  onBack,
}: DestinationPickerScreenProps): ReactElement {
  const [searchText, setSearchText] = useState(searchQuery);
  const shareLinkMessage = shareLinkMessageLabel(shareLinkState);
  const locationReason = currentLocationLost
    ? UI_TEXT.destinationPicker.currentLocationLost
    : currentLocationAvailable
      ? null
      : UI_TEXT.destinationPicker.currentLocationUnavailable;
  const submitSearch = (): void => {
    const trimmed = searchText.trim();
    if (trimmed.length === 0) {
      return;
    }
    onSubmitSearch(trimmed);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={UI_TEXT.destinationPicker.back}
          onPress={onBack}
          style={({ pressed }) => [styles.backIcon, pressed ? styles.pressed : null]}
        >
          <Text style={styles.backIconText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{UI_TEXT.destinationPicker.title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 1. 検索ヒーロー */}
        <View style={styles.searchHero}>
          <View style={styles.searchIcon}>
            <SearchIcon size={20} color={COLORS.textMuted} />
          </View>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={submitSearch}
            placeholder={UI_TEXT.destinationPicker.searchPlaceholder}
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel={UI_TEXT.destinationPicker.searchPlaceholder}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={UI_TEXT.destinationPicker.searchButton}
            onPress={submitSearch}
            style={({ pressed }) => [styles.searchButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.searchButtonText}>
              {UI_TEXT.destinationPicker.searchButton}
            </Text>
          </Pressable>
        </View>

        {/* 2. クイックカード */}
        <View style={styles.quickRow}>
          <QuickActionCard
            icon={<TargetIcon size={24} color={COLORS.primary} />}
            label={UI_TEXT.destinationPicker.quickCurrentLocation}
            disabled={!currentLocationAvailable}
            onPress={onUseCurrentLocation}
          />
          <QuickActionCard
            icon={<LinkIcon size={24} color={COLORS.primary} />}
            label={UI_TEXT.destinationPicker.quickClipboard}
            disabled={!shareLinkEnabled || shareLinkState === 'reading'}
            onPress={onImportShareLink}
          />
        </View>
        {locationReason === null ? null : <Text style={styles.hint}>{locationReason}</Text>}
        {shareLinkState === 'ready' ? (
          <Text style={styles.message}>{shareLinkMessage}</Text>
        ) : null}
        {shareLinkState === 'ready' &&
        onConfirmShared !== undefined &&
        onDismissShared !== undefined ? (
          <View style={styles.shareConfirmRow}>
            <PrimaryButton
              label={UI_TEXT.destinationPicker.shareConfirm}
              onPress={onConfirmShared}
            />
            <PrimaryButton
              label={UI_TEXT.destinationPicker.shareDismiss}
              variant="secondary"
              onPress={onDismissShared}
            />
          </View>
        ) : null}

        {/* 3. ミニマップカード */}
        <MapPreviewCard
          center={currentPoint}
          title={UI_TEXT.destinationPicker.mapCardTitle}
          hint={UI_TEXT.destinationPicker.mapCardHint}
          onPress={onOpenMapPick}
        />

        {/* 4. お気に入り */}
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
                icon={<StarIcon size={18} color="#C98A12" />}
                onPress={() => onSelectFavorite(place.id)}
              />
            ))
          )}
        </View>

        {/* 5. 最近使った場所 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {UI_TEXT.destinationPicker.recentTitle}
          </Text>
          {recent.length === 0 ? (
            <Text style={styles.hint}>{UI_TEXT.destinationPicker.noRecent}</Text>
          ) : (
            recent.map((place) => (
              <PlaceRow
                key={place.id}
                name={place.name}
                icon={<ClockIcon size={18} color={COLORS.textMuted} />}
                onPress={() => onSelectRecent(place.id)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

interface QuickActionCardProps {
  readonly icon: ReactElement;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}

/** クイックカード（アイコン＋ラベルの縦並び）。無効時は淡く表示。 */
function QuickActionCard({
  icon,
  label,
  disabled = false,
  onPress,
}: QuickActionCardProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickCard,
        disabled ? styles.quickCardDisabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.quickIcon}>{icon}</View>
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

interface PlaceRowProps {
  readonly name: string;
  readonly icon: ReactElement;
  readonly onPress: () => void;
}

function PlaceRow({ name, icon, onPress }: PlaceRowProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.placeRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.placeIcon}>{icon}</View>
      <Text style={styles.placeName} numberOfLines={2}>
        {name}
      </Text>
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
  searchHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 56,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
  },
  searchIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    minHeight: TAP_TARGET_MIN,
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
    paddingVertical: 0,
  },
  searchButton: {
    minHeight: 44,
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
  quickRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  quickCard: {
    flex: 1,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  quickCardDisabled: {
    opacity: 0.45,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  quickLabel: {
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  shareConfirmRow: {
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
  placeIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeName: {
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

import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatBearingDeg, formatDistanceM } from '../../domain/format';
import type { GeoPoint, NavState } from '../../domain/types';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

export interface MapScreenProps {
  readonly currentPoint: GeoPoint | null;
  readonly destinationName: string | null;
  readonly destinationPoint: GeoPoint | null;
  readonly nav: NavState;
  readonly onBack: () => void;
}

/**
 * 地図画面の Web フォールバック。§9.6 / §18-11 / T27。
 *
 * - **地図ライブラリを import しない**（Web では地図が動かないため）。
 * - 「地図はこのプラットフォームでは表示できません」＋目的地名・距離・相対方位の数値を出す。
 * - Metro のプラットフォーム解決（`MapScreen.web.tsx`）に依存する。解決されない環境では
 *   `MapScreen.tsx` 内の `Platform.OS === 'web'` 分岐へ切り替える（tasks.md T27 注記）。
 */
export function MapScreen({
  currentPoint,
  destinationName,
  destinationPoint,
  nav,
  onBack,
}: MapScreenProps): ReactElement {
  const bearingText =
    nav.status === 'arrived' ? UI_TEXT.noValue : formatBearingDeg(nav.relativeBearingDeg);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{UI_TEXT.mapScreen.title}</Text>
      <Text style={styles.fallback}>{UI_TEXT.mapScreen.webFallback}</Text>

      {currentPoint === null ? (
        <Text style={styles.note}>{UI_TEXT.mapScreen.noLocation}</Text>
      ) : null}
      {destinationPoint === null ? (
        <Text style={styles.note}>{UI_TEXT.mapScreen.noDestination}</Text>
      ) : null}

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {`${UI_TEXT.mapScreen.destinationLabel}: ${
            destinationName ?? UI_TEXT.main.destinationEmpty
          }`}
        </Text>
        <Text style={styles.summaryText}>
          {`${UI_TEXT.mapScreen.distanceLabel}: ${formatDistanceM(nav.distanceM)}`}
        </Text>
        <Text style={styles.summaryText}>
          {`${UI_TEXT.mapScreen.relativeBearingLabel}: ${bearingText}`}
        </Text>
        {currentPoint === null ? null : (
          <Text style={styles.summaryText}>
            {`${UI_TEXT.mapScreen.locationLabel}: ${currentPoint.latitude.toFixed(5)}, ${currentPoint.longitude.toFixed(5)}`}
          </Text>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.backButtonText}>{UI_TEXT.mapScreen.back}</Text>
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
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  fallback: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
    color: COLORS.text,
  },
  note: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  summary: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  summaryText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  backButton: {
    alignSelf: 'flex-start',
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

import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UI_TEXT, onboardingPageLabel } from '../labels';
import { COLORS, FONT_SIZE, SPACING, TAP_TARGET_MIN } from '../theme';
import { Bird } from '../components/Bird';
import { PrimaryButton } from '../components/PrimaryButton';

export interface OnboardingScreenProps {
  /** 最後まで見た（または最後のページで「はじめる」）ときに呼ぶ。 */
  readonly onComplete: () => void;
  /** スキップ。表示済みフラグの扱いは呼び出し側（App）が決める。 */
  readonly onSkip: () => void;
}

/** 3 枚のページ番号（0 始まり）。 */
const PAGE_COUNT = 3;

/**
 * オンボーディング（S1・初回のみ 3 枚・スキップ可）。F1 / U10。
 *
 * - 文言は `ui/labels.ts`（`UI_TEXT.onboarding`）。
 * - 表示済みフラグは App が `PreferencesRepository` で管理する（UI は表示のみ）。
 * - ページ送りはボタン（スワイプは追加依存なしで実装可能だが、アクセシビリティ優先でボタン操作）。
 */
export function OnboardingScreen({
  onComplete,
  onSkip,
}: OnboardingScreenProps): ReactElement {
  const [page, setPage] = useState(0);
  const titles = UI_TEXT.onboarding.pageTitles;
  const bodies = UI_TEXT.onboarding.pageBodies;
  const title = titles[page] ?? titles[0] ?? '';
  const body = bodies[page] ?? bodies[0] ?? '';
  const isLast = page >= PAGE_COUNT - 1;

  const handleNext = (): void => {
    if (isLast) {
      onComplete();
      return;
    }
    setPage(page + 1);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <Text style={styles.appTitle}>{UI_TEXT.appTitle}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onSkip}
          style={({ pressed }) => [styles.skipButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.skipText}>{UI_TEXT.onboarding.skip}</Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        <View style={styles.illustration}>
          {page === 0 ? (
            <Bird relativeBearingDeg={0} arrived={false} size={180} />
          ) : (
            <Text style={styles.symbol}>{page === 1 ? '📍' : '🗺️'}</Text>
          )}
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>

      <View style={styles.bottom}>
        <Text style={styles.pageLabel}>
          {onboardingPageLabel(page + 1, PAGE_COUNT)}
        </Text>
        <View style={styles.dots}>
          {Array.from({ length: PAGE_COUNT }, (_, index) => (
            <View
              key={`dot-${index}`}
              style={[styles.dot, index === page ? styles.dotActive : null]}
            />
          ))}
        </View>
        <PrimaryButton
          label={isLast ? UI_TEXT.onboarding.start : UI_TEXT.onboarding.next}
          onPress={handleNext}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appTitle: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  skipButton: {
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  skipText: {
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.textMuted,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  illustration: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: {
    fontSize: 96,
  },
  title: {
    fontSize: FONT_SIZE.heading,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  body: {
    fontSize: FONT_SIZE.bodyLarge,
    lineHeight: 26,
    color: COLORS.text,
    textAlign: 'center',
  },
  bottom: {
    gap: SPACING.md,
    paddingBottom: SPACING.md,
  },
  pageLabel: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
  },
  pressed: {
    opacity: 0.8,
  },
});

import type { ReactElement } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NavState } from '../../domain/types';
import {
  UI_TEXT,
  compassDetailLabel,
  freshnessDetailLabel,
  gpsDetailLabel,
  headingReferenceDetailLabel,
  statusSummaryLine,
  warningLabel,
} from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';

export interface StatusDetailSheetProps {
  readonly visible: boolean;
  /** 表示用の派生値（domain の計算結果。UI では再計算しない）。 */
  readonly nav: NavState;
  /** GPS 精度の生値（m）。詳細でのみ数値を出す。 */
  readonly gpsAccuracyM: number | null;
  readonly onClose: () => void;
}

/**
 * 状態の詳細シート（S6）。精度・鮮度・警告を**一般向けの言葉**で表示し、
 * 生の数値は詳細の説明文に小さく添える（UX-4）。
 *
 * - メイン画面の 1 行サマリをタップすると開く。
 * - 記録・Mock などの開発情報は含めない（S7 開発メニューへ移動済み）。
 */
export function StatusDetailSheet({
  visible,
  nav,
  gpsAccuracyM,
  onClose,
}: StatusDetailSheetProps): ReactElement {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={UI_TEXT.statusDetail.close}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.title}>{UI_TEXT.statusDetail.title}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.closeText}>{UI_TEXT.statusDetail.close}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.summary}>
              {statusSummaryLine(nav.gpsAccuracyClass, nav.headingAccuracyClass)}
            </Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{UI_TEXT.statusDetail.gpsTitle}</Text>
              <Text style={styles.body}>
                {gpsDetailLabel(nav.gpsAccuracyClass, gpsAccuracyM)}
              </Text>
              <Text style={styles.body}>
                {freshnessDetailLabel(nav.locationFreshness, nav.locationAgeMs)}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{UI_TEXT.statusDetail.compassTitle}</Text>
              <Text style={styles.body}>{compassDetailLabel(nav.headingAccuracyClass)}</Text>
              {nav.headingAgeMs === null ? null : (
                <Text style={styles.body}>
                  {freshnessDetailLabel(nav.headingFreshness, nav.headingAgeMs)}
                </Text>
              )}
              <Text style={styles.body}>
                {headingReferenceDetailLabel(nav.headingReference)}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{UI_TEXT.statusDetail.warningsTitle}</Text>
              {nav.warnings.length === 0 ? (
                <Text style={styles.body}>{UI_TEXT.statusDetail.noWarnings}</Text>
              ) : (
                nav.warnings.map((warning) => (
                  <Text key={warning} style={styles.warning}>
                    {`⚠ ${warningLabel(warning)}`}
                  </Text>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    maxHeight: '80%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.md * 2,
    borderTopRightRadius: RADIUS.md * 2,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeButton: {
    minHeight: TAP_TARGET_MIN,
    minWidth: TAP_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  closeText: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.primary,
  },
  content: {
    gap: SPACING.md,
    paddingBottom: SPACING.md,
  },
  summary: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.body,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  body: {
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
  },
  warning: {
    fontSize: FONT_SIZE.body,
    color: COLORS.warning,
  },
  pressed: {
    opacity: 0.8,
  },
});

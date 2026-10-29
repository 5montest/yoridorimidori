import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HeadingAccuracyLevel, NavState } from '../../domain/types';
import {
  freshnessWithAgeLabel,
  gpsAccuracyWithValueLabel,
  headingAccuracyWithValueLabel,
  headingReferenceLabel,
  navStatusLabel,
  UI_TEXT,
  warningLabel,
} from '../labels';
import {
  COLORS,
  FONT_SIZE,
  RADIUS,
  SPACING,
  gpsAccuracyColor,
  headingAccuracyColor,
} from '../theme';

export interface NavStatusPanelProps {
  readonly nav: NavState;
  /**
   * GPS 精度の生値（m）。`NavState` は区分のみ持つため App から受け取る
   * （値の再計算はせず、表示の整形だけを labels で行う）。
   */
  readonly gpsAccuracyM: number | null;
  /** 方位精度の生値（0〜3）。区分と併記するため App から受け取る。 */
  readonly headingAccuracyLevel: HeadingAccuracyLevel | null;
}

/**
 * 精度・鮮度・基準・総合状態・警告の表示パネル。§9.4 / FR-08 / NFR-08。
 *
 * - **すべて「数値 + 文言」**で表示し、色は補助（色だけに依存しない）。
 * - 文言は `ui/labels.ts` のみ。方位・距離・鮮度の再計算はしない（domain の値を表示するだけ）。
 */
export function NavStatusPanel({
  nav,
  gpsAccuracyM,
  headingAccuracyLevel,
}: NavStatusPanelProps): ReactElement {
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Text style={styles.label}>{UI_TEXT.main.statusLabel}</Text>
        <Text style={styles.value}>{navStatusLabel(nav.status)}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>{UI_TEXT.main.gpsLabel}</Text>
        <Text style={[styles.value, { color: gpsAccuracyColor(nav.gpsAccuracyClass) }]}>
          {gpsAccuracyWithValueLabel(gpsAccuracyM, nav.gpsAccuracyClass)}
          {' / '}
          {freshnessWithAgeLabel(nav.locationFreshness, nav.locationAgeMs)}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>{UI_TEXT.main.headingLabel}</Text>
        <Text style={[styles.value, { color: headingAccuracyColor(nav.headingAccuracyClass) }]}>
          {headingAccuracyWithValueLabel(headingAccuracyLevel, nav.headingAccuracyClass)}
          {' / '}
          {freshnessWithAgeLabel(nav.headingFreshness, nav.headingAgeMs)}
          {' / '}
          {headingReferenceLabel(nav.headingReference)}
        </Text>
      </View>

      {nav.warnings.length > 0 ? (
        <View style={styles.warningBlock}>
          <Text style={styles.label}>{UI_TEXT.main.warningsLabel}</Text>
          {nav.warnings.map((warning) => (
            <Text key={warning} style={styles.warning}>
              {`⚠ ${warningLabel(warning)}`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  label: {
    width: 72,
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  value: {
    flex: 1,
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  warningBlock: {
    marginTop: SPACING.xs,
    gap: 2,
  },
  warning: {
    fontSize: FONT_SIZE.body,
    color: COLORS.warning,
  },
});

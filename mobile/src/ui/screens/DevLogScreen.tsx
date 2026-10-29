import { useMemo, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Thresholds } from '../../domain/constants';
import { formatAgeMs, formatBearingDeg } from '../../domain/format';
import type { ScenarioId } from '../../domain/scenario';
import { summarizeSamples } from '../../domain/summarize';
import type { SampleLogEntry } from '../../domain/types';
import type { ProviderError } from '../../ports/common';
import type { MockSensorController } from '../../ports/mockSensor';
import { MockControlPanel } from '../components/MockControlPanel';
import {
  UI_TEXT,
  formatEpochClockTime,
  headingAccuracyLevelLabel,
  sampleSummaryAverageGpsLabel,
  sampleSummaryHeadingDistributionLabel,
  sampleSummaryStaleRatioLabel,
} from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

/** サンプル一覧の表示件数（直近 20 件。§9.7）。 */
const SAMPLE_DISPLAY_COUNT = 20;

export interface DevLogScreenProps {
  /** 記録サンプル（古い順。表示時に直近 20 件を切り出す）。 */
  readonly samples: readonly SampleLogEntry[];
  readonly storageWarnings: readonly string[];
  readonly errors: readonly ProviderError[];
  /** 集計の閾値（`summarizeSamples` に渡す。UI では再計算しない）。 */
  readonly thresholds: Thresholds;
  readonly controller: MockSensorController;
  readonly mockMode: boolean;
  readonly scenarioId: ScenarioId | null;
  /** 開発ビルドか（false なら操作 UI を出さない）。App が `__DEV__` から決める。 */
  readonly devToolsVisible: boolean;
  readonly onToggleMock: () => void;
  readonly onSelectScenario: (id: ScenarioId | null) => void;
  /** 座標で設定（開発用・S7）へ。一般画面には置かない（UX-1 / UX-6）。 */
  readonly onOpenCoordinateSetting: () => void;
  /** オンボーディング（S1）を再表示する（App が表示状態を制御）。 */
  readonly onResetOnboarding?: () => void;
  /** 状態の詳細（S6: GPS・コンパス精度・鮮度）を開く（一般画面には置かない）。 */
  readonly onOpenStatusDetail?: () => void;
  readonly onBack: () => void;
}

/**
 * 開発用画面（記録・Mock 操作）。§9.7 / FR-09 / FR-10。
 *
 * - サンプルは直近 20 件を表形式で表示する。
 * - 簡易集計は domain の `summarizeSamples` の結果を表示するだけ（UI で再実装しない）。
 * - Mock 操作は `MockControlPanel`（controller は props で受け取る）。
 * - `devToolsVisible === false`（リリースビルド）では操作 UI を出さない。
 */
export function DevLogScreen({
  samples,
  storageWarnings,
  errors,
  thresholds,
  controller,
  mockMode,
  scenarioId,
  devToolsVisible,
  onToggleMock,
  onSelectScenario,
  onOpenCoordinateSetting,
  onResetOnboarding,
  onOpenStatusDetail,
  onBack,
}: DevLogScreenProps): ReactElement {
  const summary = useMemo(
    () => summarizeSamples(samples, thresholds),
    [samples, thresholds],
  );
  const recent = useMemo(
    () => samples.slice(-SAMPLE_DISPLAY_COUNT).reverse(),
    [samples],
  );

  if (!devToolsVisible) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{UI_TEXT.devMenu.title}</Text>
        <Text style={styles.note}>{UI_TEXT.mockControl.devOnlyNote}</Text>
        {onOpenStatusDetail === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenStatusDetail}
            style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.backButtonText}>{UI_TEXT.devMenu.statusDetailOpen}</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.backButtonText}>{UI_TEXT.devLog.back}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{UI_TEXT.devMenu.title}</Text>
      <Text style={styles.note}>{UI_TEXT.devMenu.subtitle}</Text>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{UI_TEXT.devMenu.coordinateSetting}</Text>
          <Text style={styles.note}>{UI_TEXT.devMenu.coordinateSettingNote}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenCoordinateSetting}
            style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.backButtonText}>{UI_TEXT.devMenu.coordinateSetting}</Text>
          </Pressable>
        </View>

        {onResetOnboarding === undefined ? null : (
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={onResetOnboarding}
              style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.backButtonText}>{UI_TEXT.devMenu.onboardingReset}</Text>
            </Pressable>
          </View>
        )}

        {onOpenStatusDetail === undefined ? null : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{UI_TEXT.devMenu.statusDetail}</Text>
            <Text style={styles.note}>{UI_TEXT.devMenu.statusDetailNote}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onOpenStatusDetail}
              style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.backButtonText}>{UI_TEXT.devMenu.statusDetailOpen}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{UI_TEXT.devLog.summaryTitle}</Text>
          <SummaryRow
            label={UI_TEXT.devLog.averageGps}
            value={sampleSummaryAverageGpsLabel(
              summary.averageGpsAccuracyM,
              summary.gpsAccuracySampleCount,
            )}
          />
          <SummaryRow
            label={UI_TEXT.devLog.headingAccuracyDistribution}
            value={sampleSummaryHeadingDistributionLabel(summary.headingAccuracyDistribution)}
          />
          <SummaryRow
            label={UI_TEXT.devLog.staleRatio}
            value={sampleSummaryStaleRatioLabel(summary.staleRatio)}
          />
          <SummaryRow
            label={UI_TEXT.devLog.sampleCount}
            value={`${summary.totalCount}`}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{UI_TEXT.devLog.storageWarningsTitle}</Text>
          {storageWarnings.length === 0 ? (
            <Text style={styles.note}>{UI_TEXT.devLog.noWarnings}</Text>
          ) : (
            storageWarnings.map((warning, index) => (
              <Text key={`${warning}-${index}`} style={styles.warning}>
                {`⚠ ${warning}`}
              </Text>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{UI_TEXT.devLog.errorsTitle}</Text>
          {errors.length === 0 ? (
            <Text style={styles.note}>{UI_TEXT.devLog.noErrors}</Text>
          ) : (
            errors.map((error, index) => (
              <Text key={`${error.code}-${index}`} style={styles.warning}>
                {`${error.code}: ${error.message}`}
              </Text>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{UI_TEXT.devLog.samplesTitle}</Text>
          {recent.length === 0 ? (
            <Text style={styles.note}>{UI_TEXT.devLog.noSamplesHint}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <TableCell text={UI_TEXT.devLog.columnTime} header />
                  <TableCell text={UI_TEXT.devLog.columnLatitude} header />
                  <TableCell text={UI_TEXT.devLog.columnLongitude} header />
                  <TableCell text={UI_TEXT.devLog.columnGpsAccuracy} header />
                  <TableCell text={UI_TEXT.devLog.columnHeading} header />
                  <TableCell text={UI_TEXT.devLog.columnHeadingAccuracy} header />
                  <TableCell text={UI_TEXT.devLog.columnLocationAge} header />
                  <TableCell text={UI_TEXT.devLog.columnHeadingAge} header />
                </View>
                {recent.map((entry, index) => (
                  <View key={`${entry.recordedAtEpochMs}-${index}`} style={styles.tableRow}>
                    <TableCell text={formatEpochClockTime(entry.recordedAtEpochMs)} />
                    <TableCell text={entry.latitude.toFixed(5)} />
                    <TableCell text={entry.longitude.toFixed(5)} />
                    <TableCell
                      text={
                        entry.gpsAccuracyM === null
                          ? UI_TEXT.noValue
                          : `${Math.round(entry.gpsAccuracyM)} m`
                      }
                    />
                    <TableCell text={formatBearingDeg(entry.headingDeg)} />
                    <TableCell text={headingAccuracyLevelLabel(entry.headingAccuracy)} />
                    <TableCell text={formatAgeMs(entry.locationAgeMs)} />
                    <TableCell
                      text={
                        entry.headingAgeMs === null
                          ? UI_TEXT.noValue
                          : formatAgeMs(entry.headingAgeMs)
                      }
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        <MockControlPanel
          controller={controller}
          mockMode={mockMode}
          scenarioId={scenarioId}
          onToggleMock={onToggleMock}
          onSelectScenario={onSelectScenario}
        />
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.backButtonText}>{UI_TEXT.devLog.back}</Text>
      </Pressable>
    </View>
  );
}

interface SummaryRowProps {
  readonly label: string;
  readonly value: string;
}

function SummaryRow({ label, value }: SummaryRowProps): ReactElement {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

interface TableCellProps {
  readonly text: string;
  readonly header?: boolean;
}

function TableCell({ text, header = false }: TableCellProps): ReactElement {
  return <Text style={[styles.cell, header ? styles.cellHeader : null]}>{text}</Text>;
}

const CELL_WIDTH = 88;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  content: {
    gap: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  cardTitle: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  summaryLabel: {
    width: 180,
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  summaryValue: {
    flex: 1,
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  note: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  warning: {
    fontSize: FONT_SIZE.body,
    color: COLORS.warning,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  tableHeader: {
    backgroundColor: COLORS.surfaceAlt,
  },
  cell: {
    width: CELL_WIDTH,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    fontSize: FONT_SIZE.caption,
    color: COLORS.text,
  },
  cellHeader: {
    fontWeight: '700',
    color: COLORS.textMuted,
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

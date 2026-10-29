import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SCENARIOS, type ScenarioId } from '../../domain/scenario';
import { formatAgeMs } from '../../domain/format';
import type { HeadingAccuracyLevel, HeadingReference } from '../../domain/types';
import { isValidGeoPoint } from '../../domain/validation';
import type { MockSensorController, MockSensorSnapshot } from '../../ports/mockSensor';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

const TIME_SCALES = [1, 2, 5, 10] as const;

const ACCURACY_LEVELS: readonly HeadingAccuracyLevel[] = [0, 1, 2, 3];

const REFERENCE_OPTIONS: readonly {
  readonly value: HeadingReference;
  readonly label: string;
}[] = [
  { value: 'true-north', label: UI_TEXT.mockControl.trueNorth },
  { value: 'magnetic-north', label: UI_TEXT.mockControl.magneticNorth },
  { value: 'unknown', label: UI_TEXT.mockControl.referenceUnknown },
];

export interface MockControlPanelProps {
  /** Mock 制御ポート（**props で受け取る**。再生成しないインスタンスを渡す）。 */
  readonly controller: MockSensorController;
  readonly mockMode: boolean;
  readonly scenarioId: ScenarioId | null;
  readonly onToggleMock: () => void;
  readonly onSelectScenario: (id: ScenarioId | null) => void;
}

/**
 * 開発用の Mock 操作パネル。§9.7 / §8.3 / FR-10 / ADR-08。
 *
 * - 手動入力は **`TextInput` + 増減ボタン**（スライダー等の追加依存は使わない）。
 * - Mock の制御は `MockSensorController` の公開 API のみ（`setMode` / `setManualLocation` /
 *   `setManualHeading` / `selectScenario` / `setTimeScale`）。
 * - 範囲・NaN の判定は domain（`isValidGeoPoint`）を使い、UI では再実装しない。
 * - `useNavApp` はこのコントローラを知らない（App が props で渡す）。
 */
export function MockControlPanel({
  controller,
  mockMode,
  scenarioId,
  onToggleMock,
  onSelectScenario,
}: MockControlPanelProps): ReactElement {
  const [snapshot, setSnapshot] = useState<MockSensorSnapshot>(() => controller.getSnapshot());
  const initial = controller.getSnapshot();

  const [latitudeText, setLatitudeText] = useState(
    initial.manualPoint === null ? '' : `${initial.manualPoint.latitude}`,
  );
  const [longitudeText, setLongitudeText] = useState(
    initial.manualPoint === null ? '' : `${initial.manualPoint.longitude}`,
  );
  const [accuracyText, setAccuracyText] = useState(
    initial.manualAccuracyM === null ? '' : `${initial.manualAccuracyM}`,
  );
  const [headingText, setHeadingText] = useState(
    initial.manualHeadingDeg === null ? '' : `${initial.manualHeadingDeg}`,
  );
  const [accuracyLevel, setAccuracyLevel] = useState<HeadingAccuracyLevel>(
    initial.manualHeadingAccuracy ?? 3,
  );
  const [reference, setReference] = useState<HeadingReference>(
    initial.manualHeadingReference,
  );
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(controller.getSnapshot());
    const unsubscribe = controller.subscribe((next) => {
      setSnapshot(next);
    });
    return unsubscribe;
  }, [controller]);

  const handleApplyManual = (): void => {
    setErrorText(null);
    const latitude = parseOptionalNumber(latitudeText);
    const longitude = parseOptionalNumber(longitudeText);
    const accuracy = parseOptionalNumber(accuracyText);
    const heading = parseOptionalNumber(headingText);

    if (
      !latitude.ok ||
      !longitude.ok ||
      !accuracy.ok ||
      !heading.ok ||
      (accuracy.value !== null && accuracy.value < 0)
    ) {
      setErrorText(UI_TEXT.mockControl.invalidInput);
      return;
    }

    const hasPoint = latitudeText.trim() !== '' && longitudeText.trim() !== '';
    if (hasPoint) {
      if (!latitude.ok || !longitude.ok || latitude.value === null || longitude.value === null) {
        setErrorText(UI_TEXT.mockControl.invalidInput);
        return;
      }
      const point = { latitude: latitude.value, longitude: longitude.value };
      if (!isValidGeoPoint(point)) {
        setErrorText(UI_TEXT.mockControl.invalidInput);
        return;
      }
      controller.setMode('manual');
      controller.setManualLocation(point, accuracy.value);
    } else {
      controller.setMode('manual');
      controller.setManualLocation(null, accuracy.value);
    }
    controller.setManualHeading(
      heading.value,
      heading.value === null ? null : accuracyLevel,
      reference,
    );
    onSelectScenario(null);
  };

  const selectScenario = (id: ScenarioId | null): void => {
    setErrorText(null);
    controller.selectScenario(id);
    onSelectScenario(id);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{UI_TEXT.mockControl.title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: mockMode }}
          onPress={onToggleMock}
          style={({ pressed }) => [
            styles.toggleButton,
            mockMode ? styles.toggleButtonOn : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.toggleButtonText}>
            {mockMode ? UI_TEXT.main.mockOn : UI_TEXT.main.mockOff}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.note}>{UI_TEXT.mockControl.enableHint}</Text>

      <Text style={styles.sectionTitle}>{UI_TEXT.mockControl.manualTitle}</Text>

      <StepperRow
        label={UI_TEXT.mockControl.latitude}
        value={latitudeText}
        step={0.0001}
        onChangeText={setLatitudeText}
      />
      <StepperRow
        label={UI_TEXT.mockControl.longitude}
        value={longitudeText}
        step={0.0001}
        onChangeText={setLongitudeText}
      />
      <StepperRow
        label={UI_TEXT.mockControl.accuracy}
        value={accuracyText}
        step={1}
        onChangeText={setAccuracyText}
      />
      <StepperRow
        label={UI_TEXT.mockControl.heading}
        value={headingText}
        step={5}
        onChangeText={setHeadingText}
      />

      <Text style={styles.fieldLabel}>{UI_TEXT.mockControl.headingAccuracy}</Text>
      <View style={styles.optionRow}>
        {ACCURACY_LEVELS.map((level) => (
          <Pressable
            key={level}
            accessibilityRole="button"
            accessibilityState={{ selected: accuracyLevel === level }}
            onPress={() => setAccuracyLevel(level)}
            style={({ pressed }) => [
              styles.optionButton,
              accuracyLevel === level ? styles.optionButtonSelected : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.optionButtonText}>
              {UI_TEXT.mockControl.accuracyLevels[level]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>{UI_TEXT.mockControl.headingReference}</Text>
      <View style={styles.optionRow}>
        {REFERENCE_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: reference === option.value }}
            onPress={() => setReference(option.value)}
            style={({ pressed }) => [
              styles.optionButton,
              reference === option.value ? styles.optionButtonSelected : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.optionButtonText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={handleApplyManual}
        style={({ pressed }) => [styles.applyButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.applyButtonText}>{UI_TEXT.mockControl.apply}</Text>
      </Pressable>
      {errorText === null ? null : <Text style={styles.error}>{errorText}</Text>}

      <Text style={styles.sectionTitle}>{UI_TEXT.mockControl.scenarioTitle}</Text>
      <View style={styles.optionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: scenarioId === null }}
          onPress={() => selectScenario(null)}
          style={({ pressed }) => [
            styles.optionButton,
            scenarioId === null ? styles.optionButtonSelected : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.optionButtonText}>{UI_TEXT.mockControl.scenarioNone}</Text>
        </Pressable>
        {SCENARIOS.map((scenario) => (
          <Pressable
            key={scenario.id}
            accessibilityRole="button"
            accessibilityState={{ selected: scenarioId === scenario.id }}
            onPress={() => selectScenario(scenario.id)}
            style={({ pressed }) => [
              styles.optionButton,
              scenarioId === scenario.id ? styles.optionButtonSelected : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.optionButtonText}>{scenario.labelJa}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{UI_TEXT.mockControl.timeScaleTitle}</Text>
      <View style={styles.optionRow}>
        {TIME_SCALES.map((scale) => (
          <Pressable
            key={scale}
            accessibilityRole="button"
            accessibilityState={{ selected: snapshot.timeScale === scale }}
            onPress={() => controller.setTimeScale(scale)}
            style={({ pressed }) => [
              styles.optionButton,
              snapshot.timeScale === scale ? styles.optionButtonSelected : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.optionButtonText}>{`×${scale}`}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.status}>
        {`${
          snapshot.mode === 'manual'
            ? UI_TEXT.mockControl.manualTitle
            : UI_TEXT.mockControl.scenarioTitle
        } / ×${snapshot.timeScale} / ${formatAgeMs(snapshot.scenarioElapsedMs)}`}
      </Text>
    </View>
  );
}

interface StepperRowProps {
  readonly label: string;
  readonly value: string;
  readonly step: number;
  readonly onChangeText: (text: string) => void;
}

/** 数値入力 + 増減ボタン（スライダーの代替。ADR-08 / 付録A-2）。 */
function StepperRow({ label, value, step, onChangeText }: StepperRowProps): ReactElement {
  const adjust = (direction: 1 | -1): void => {
    const current = Number(value.trim());
    const base = Number.isFinite(current) ? current : 0;
    const next = base + direction * step;
    onChangeText(formatStepValue(next, step));
  };
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${UI_TEXT.mockControl.decrease}`}
          onPress={() => adjust(-1)}
          style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.stepButtonText}>-</Text>
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          style={styles.stepperInput}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel={label}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${UI_TEXT.mockControl.increase}`}
          onPress={() => adjust(1)}
          style={({ pressed }) => [styles.stepButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface ParsedNumber {
  readonly ok: boolean;
  readonly value: number | null;
}

/** 任意入力の数値化。空欄は `null`（未設定）として扱う。 */
function parseOptionalNumber(text: string): ParsedNumber {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, value: null };
  }
  return { ok: true, value };
}

/** 増減後の値を、ステップの桁数に合わせて文字列化する。 */
function formatStepValue(value: number, step: number): string {
  if (step < 1) {
    return value.toFixed(4);
  }
  return `${Math.round(value)}`;
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  note: {
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  fieldLabel: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  stepperControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  stepButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.primary,
  },
  stepButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
  },
  stepperInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  optionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  optionButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  optionButtonText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  toggleButton: {
    backgroundColor: COLORS.textMuted,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  toggleButtonOn: {
    backgroundColor: COLORS.primary,
  },
  toggleButtonText: {
    color: COLORS.onPrimary,
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
  applyButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  applyButtonText: {
    color: COLORS.onPrimary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
  error: {
    fontSize: FONT_SIZE.body,
    color: COLORS.warning,
  },
  status: {
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
  },
  pressed: {
    opacity: 0.8,
  },
});

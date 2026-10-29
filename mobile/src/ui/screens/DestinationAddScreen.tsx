import { useState, type ReactElement } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Freshness, GeoPoint } from '../../domain/types';
import { validateDestinationInput } from '../../domain/validation';
import { UI_TEXT, validationErrorLabel } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

/** `onAdd` に渡す入力（ID・作成時刻・origin は App 側が付与する）。 */
export interface DestinationAddInput {
  readonly name: string;
  readonly point: GeoPoint;
}

export interface DestinationAddScreenProps {
  /** 現在地（未取得なら `null`）。「現在地を使う」の有効判定に使う。 */
  readonly currentPoint: GeoPoint | null;
  /** 現在地の鮮度（domain の値。UI では再計算しない）。 */
  readonly locationFreshness: Freshness | null;
  /** 保存。成功 `true` / 検証・保存失敗 `false`。 */
  readonly onAdd: (input: DestinationAddInput) => Promise<boolean>;
  /** 現在地を目的地に追加。成功 `true` / 位置なし・途絶・保存失敗 `false`。 */
  readonly onUseCurrentLocation: (name: string) => Promise<boolean>;
  readonly onBack: () => void;
}

/** 入力文字列 → 数値。空文字は NaN（範囲・NaN の最終判定は domain に委ねる）。 */
function parseCoordinate(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? Number.NaN : Number(trimmed);
}

/**
 * 目的地の追加画面。§9.1 / FR-01 / §6.11。
 *
 * - 検証は **domain の `validateDestinationInput` に集約**する（UI で再実装しない）。
 * - 文言は `ui/labels.ts`（`validationErrorLabel`）のみ。
 * - 位置が `null` または `lost` のとき「現在地を使う」は無効＋理由表示。
 * - `hooks` / `adapters` を import しない（データは props・操作はコールバック）。
 */
export function DestinationAddScreen({
  currentPoint,
  locationFreshness,
  onAdd,
  onUseCurrentLocation,
  onBack,
}: DestinationAddScreenProps): ReactElement {
  const [name, setName] = useState('');
  const [latitudeText, setLatitudeText] = useState('');
  const [longitudeText, setLongitudeText] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const locationLost = locationFreshness === 'lost';
  const currentLocationUsable = currentPoint !== null && !locationLost;
  const currentLocationReason = locationLost
    ? UI_TEXT.destinationAdd.locationUnavailableLost
    : currentPoint === null
      ? UI_TEXT.destinationAdd.locationUnavailableNoFix
      : null;

  const handleSave = async (): Promise<void> => {
    setErrorText(null);
    const validated = validateDestinationInput({
      name,
      point: {
        latitude: parseCoordinate(latitudeText),
        longitude: parseCoordinate(longitudeText),
      },
    });
    if (!validated.ok || validated.value === undefined) {
      setErrorText(
        validated.errorKey === undefined
          ? UI_TEXT.destinationAdd.saveFailed
          : validationErrorLabel(validated.errorKey),
      );
      return;
    }
    setSaving(true);
    try {
      const saved = await onAdd(validated.value);
      if (!saved) {
        setErrorText(UI_TEXT.destinationAdd.saveFailed);
        return;
      }
      setName('');
      setLatitudeText('');
      setLongitudeText('');
    } finally {
      setSaving(false);
    }
  };

  const handleUseCurrentLocation = async (): Promise<void> => {
    setErrorText(null);
    if (!currentLocationUsable) {
      setErrorText(currentLocationReason ?? UI_TEXT.destinationAdd.locationUnavailableNoFix);
      return;
    }
    setSaving(true);
    try {
      const saved = await onUseCurrentLocation(name.trim());
      if (!saved) {
        setErrorText(currentLocationReason ?? UI_TEXT.destinationAdd.saveFailed);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{UI_TEXT.destinationAdd.title}</Text>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>{UI_TEXT.destinationAdd.nameLabel}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={UI_TEXT.destinationAdd.namePlaceholder}
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            accessibilityLabel={UI_TEXT.destinationAdd.nameLabel}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{UI_TEXT.destinationAdd.latitudeLabel}</Text>
          <TextInput
            value={latitudeText}
            onChangeText={setLatitudeText}
            placeholder={UI_TEXT.destinationAdd.latitudePlaceholder}
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
            accessibilityLabel={UI_TEXT.destinationAdd.latitudeLabel}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{UI_TEXT.destinationAdd.longitudeLabel}</Text>
          <TextInput
            value={longitudeText}
            onChangeText={setLongitudeText}
            placeholder={UI_TEXT.destinationAdd.longitudePlaceholder}
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
            accessibilityLabel={UI_TEXT.destinationAdd.longitudeLabel}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !currentLocationUsable || saving }}
          disabled={!currentLocationUsable || saving}
          onPress={handleUseCurrentLocation}
          style={({ pressed }) => [
            styles.secondaryButton,
            !currentLocationUsable || saving ? styles.disabled : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.secondaryButtonText}>
            {UI_TEXT.destinationAdd.useCurrentLocation}
          </Text>
        </Pressable>
        {currentLocationReason === null ? null : (
          <Text style={styles.hint}>{currentLocationReason}</Text>
        )}

        {errorText === null ? null : <Text style={styles.error}>{errorText}</Text>}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.backButtonText}>{UI_TEXT.destinationAdd.cancel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.primaryButton,
              saving ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>{UI_TEXT.destinationAdd.save}</Text>
          </Pressable>
        </View>
      </ScrollView>
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
  form: {
    gap: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  field: {
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.bodyLarge,
    color: COLORS.text,
  },
  hint: {
    fontSize: FONT_SIZE.caption,
    color: COLORS.textMuted,
  },
  error: {
    fontSize: FONT_SIZE.body,
    color: COLORS.warning,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  backButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  backButtonText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.bodyLarge,
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
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
});

import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PermissionOutcome } from '../../ports/common';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

export interface PermissionNoticeProps {
  readonly permission: PermissionOutcome | null;
  /** Mock モードで動作中か（ON 中は拒否の案内を小さくする）。 */
  readonly mockMode: boolean;
  /** Mock への切替導線を出してよいか（開発ビルドのみ。App が決める）。 */
  readonly canStartMock: boolean;
  readonly onRetry: () => void;
  readonly onStartMock: () => void;
}

/**
 * 位置情報権限の拒否・不明時の案内。§11.2。
 *
 * - **メイン画面のステータス領域に常設**する（別画面へ飛ばさない）。
 * - 再要求はボタン操作起点のみ（自動ループ禁止）。
 * - `canAskAgain === false` では「設定アプリで位置情報を許可してください」の**文言のみ**を出し、
 *   設定アプリへの遷移 API は使わない（§18-8）。
 * - Mock モードは権限と独立に動く（拒否されてもデモ可能。§11.2）。
 */
export function PermissionNotice({
  permission,
  mockMode,
  canStartMock,
  onRetry,
  onStartMock,
}: PermissionNoticeProps): ReactElement | null {
  if (permission === null || permission.status === 'granted') {
    return null;
  }

  if (mockMode) {
    return (
      <View style={styles.mockActive}>
        <Text style={styles.mockActiveText}>{UI_TEXT.permissionNotice.mockActive}</Text>
      </View>
    );
  }

  if (permission.status === 'unavailable') {
    return (
      <View style={styles.notice}>
        <Text style={styles.title}>{UI_TEXT.permissionNotice.unavailable}</Text>
        {canStartMock ? (
          <MockButton onPress={onStartMock} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.notice}>
      <Text style={styles.title}>{UI_TEXT.permissionNotice.title}</Text>
      <Text style={styles.body}>{UI_TEXT.permissionNotice.deniedReason}</Text>
      <Text style={styles.body}>{UI_TEXT.permissionNotice.action}</Text>
      {permission.canAskAgain ? (
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.retryButtonText}>{UI_TEXT.permissionNotice.retry}</Text>
          </Pressable>
          {canStartMock ? <MockButton onPress={onStartMock} /> : null}
        </View>
      ) : (
        <>
          <Text style={styles.settingsHint}>{UI_TEXT.permissionNotice.settingsHint}</Text>
          {canStartMock ? <MockButton onPress={onStartMock} /> : null}
        </>
      )}
    </View>
  );
}

interface MockButtonProps {
  readonly onPress: () => void;
}

function MockButton({ onPress }: MockButtonProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.mockButton, pressed ? styles.pressed : null]}
    >
      <Text style={styles.mockButtonText}>{UI_TEXT.permissionNotice.tryMock}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.warning,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.warning,
  },
  body: {
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
  },
  settingsHint: {
    fontSize: FONT_SIZE.body,
    color: COLORS.warning,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  retryButtonText: {
    color: COLORS.onPrimary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
  mockButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
  },
  mockButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
  mockActive: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  mockActiveText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  pressed: {
    opacity: 0.8,
  },
});

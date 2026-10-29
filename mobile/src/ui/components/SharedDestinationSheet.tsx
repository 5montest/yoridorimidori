import type { ReactElement } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { UI_TEXT, shareLinkMessageLabel } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TAP_TARGET_MIN } from '../theme';
import { PrimaryButton } from './PrimaryButton';

export type SharedDestinationKind = 'ready' | 'needs-resolution';

export interface SharedDestinationSheetProps {
  readonly visible: boolean;
  readonly kind: SharedDestinationKind;
  /** 「この場所を目的地にする」。`ready` のときだけ表示する。 */
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}

/**
 * 共有リンク（ディープリンク）で届いた目的地の確認シート。F5 / F6 / U13。
 *
 * - `exp://`（Expo Go）や本番ビルドのカスタムスキームで受信した地点を確認する。
 * - 短縮リンク（座標なし）は確定できないため、コピーし直しの案内のみ出す（research §3.2）。
 * - 文言は `ui/labels.ts`。
 */
export function SharedDestinationSheet({
  visible,
  kind,
  onConfirm,
  onDismiss,
}: SharedDestinationSheetProps): ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={UI_TEXT.sharedDestination.dismiss}
          onPress={onDismiss}
          style={styles.backdrop}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title}>{UI_TEXT.sharedDestination.title}</Text>
          <Text style={styles.body}>{shareLinkMessageLabel(kind)}</Text>
          {kind === 'ready' ? (
            <PrimaryButton
              label={UI_TEXT.sharedDestination.confirm}
              onPress={onConfirm}
            />
          ) : null}
          <PrimaryButton
            label={UI_TEXT.sharedDestination.dismiss}
            variant="secondary"
            onPress={onDismiss}
          />
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
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.md * 2,
    borderTopRightRadius: RADIUS.md * 2,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
    minHeight: TAP_TARGET_MIN,
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  body: {
    fontSize: FONT_SIZE.bodyLarge,
    lineHeight: 24,
    color: COLORS.text,
  },
});

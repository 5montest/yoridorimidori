import type { ReactElement, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatBearingDeg, formatDistanceM } from '../../domain/format';
import type { HeadingAccuracyLevel, NavState } from '../../domain/types';
import {
  UI_TEXT,
  relativeDirectionCaption,
} from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SCREEN_BOTTOM_PADDING, SPACING, TONE_COLORS } from '../theme';
import { Bird } from '../components/Bird';
import { NavStatusPanel } from '../components/NavStatusPanel';

export interface MainScreenProps {
  /** 表示用の派生値（domain の計算結果。UI では再計算しない）。 */
  readonly nav: NavState;
  /** 選択中の目的地名。未選択なら `null`。 */
  readonly destinationName: string | null;
  /** GPS 精度の生値（m）。ステータスパネルの数値表示用。 */
  readonly gpsAccuracyM: number | null;
  /** 方位精度の生値（0〜3）。ステータスパネルの数値表示用。 */
  readonly headingAccuracyLevel: HeadingAccuracyLevel | null;
  /** Mock モード ON/OFF（開発ビルドのみ切替可）。 */
  readonly mockMode: boolean;
  /** 開発ビルドか（`__DEV__` 由来。App が決める）。 */
  readonly devToolsVisible: boolean;
  /** 権限拒否などの案内（App が組み立てた表示専用ノード）。 */
  readonly permissionNotice?: ReactNode;
  readonly onChangeDestination: () => void;
  readonly onOpenDestinations: () => void;
  readonly onOpenMap: () => void;
  readonly onOpenDevLog: () => void;
  readonly onToggleMock: () => void;
}

/**
 * メイン（ナビ）画面。§9.2。
 *
 * - **表示専用**。`NavState` と目的地名・生値・コールバックを props で受け取り、
 *   `hooks` / `adapters` を import しない（§2.2）。
 * - 方位・距離・鮮度を再計算しない（domain の結果を整形して表示するだけ）。
 * - 到着時は距離実値・鳥上向き・「到着」を大きく・相対方位は `—`（§9.5）。
 */
export function MainScreen({
  nav,
  destinationName,
  gpsAccuracyM,
  headingAccuracyLevel,
  mockMode,
  devToolsVisible,
  permissionNotice,
  onChangeDestination,
  onOpenDestinations,
  onOpenMap,
  onOpenDevLog,
  onToggleMock,
}: MainScreenProps): ReactElement {
  const arrived = nav.status === 'arrived';
  const distanceText = formatDistanceM(nav.distanceM);
  const relativeBearingText = arrived ? UI_TEXT.noValue : formatBearingDeg(nav.relativeBearingDeg);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerLabel}>{`${UI_TEXT.main.destinationLabel}:`}</Text>
          <Text style={styles.headerName} numberOfLines={2}>
            {destinationName ?? UI_TEXT.main.destinationEmpty}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onChangeDestination}
            style={({ pressed }) => [styles.smallButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.smallButtonText}>{UI_TEXT.main.changeDestination}</Text>
          </Pressable>
        </View>

        {permissionNotice}

        <View style={styles.birdArea}>
          <Bird relativeBearingDeg={nav.relativeBearingDeg} arrived={arrived} />
        </View>

        <View style={styles.readout}>
          <Text style={styles.distance}>{distanceText}</Text>
          <Text style={styles.relativeBearing}>{relativeBearingText}</Text>
          <Text style={styles.caption}>
            {relativeDirectionCaption(nav.relativeBearingDeg, arrived)}
          </Text>
          {arrived ? <Text style={styles.arrived}>{UI_TEXT.main.arrived}</Text> : null}
        </View>

        <NavStatusPanel
          nav={nav}
          gpsAccuracyM={gpsAccuracyM}
          headingAccuracyLevel={headingAccuracyLevel}
        />

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenDestinations}
            style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
          >
            <Text style={styles.buttonText}>{UI_TEXT.main.openDestinations}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenMap}
            style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
          >
            <Text style={styles.buttonText}>{UI_TEXT.main.openMap}</Text>
          </Pressable>
          {devToolsVisible ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenDevLog}
                style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
              >
                <Text style={styles.buttonText}>{UI_TEXT.main.openDevLog}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onToggleMock}
                style={({ pressed }) => [
                  styles.button,
                  styles.mockButton,
                  mockMode ? styles.mockButtonOn : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.buttonText}>
                  {mockMode ? UI_TEXT.main.mockOn : UI_TEXT.main.mockOff}
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flexGrow: 1,
    padding: SPACING.md,
    paddingBottom: SCREEN_BOTTOM_PADDING,
    gap: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerLabel: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  headerName: {
    flex: 1,
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  smallButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  smallButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
  birdArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  readout: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  distance: {
    fontSize: FONT_SIZE.display,
    fontWeight: '700',
    color: COLORS.text,
  },
  relativeBearing: {
    fontSize: FONT_SIZE.heading,
    color: COLORS.text,
  },
  caption: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  arrived: {
    fontSize: FONT_SIZE.huge,
    fontWeight: '800',
    color: COLORS.primary,
  },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    justifyContent: 'center',
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  mockButton: {
    backgroundColor: COLORS.textMuted,
  },
  mockButtonOn: {
    backgroundColor: TONE_COLORS.fair,
  },
  pressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: COLORS.onPrimary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
});

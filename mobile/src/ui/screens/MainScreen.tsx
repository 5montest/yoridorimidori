import { useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDistanceM } from '../../domain/format';
import type { NavState } from '../../domain/types';
import type { PermissionOutcome } from '../../ports/common';
import {
  UI_TEXT,
  directionWordLabel,
} from '../labels';
import {
  COLORS,
  FONT_SIZE,
  RADIUS,
  SCREEN_BOTTOM_PADDING,
  SPACING,
  TAP_TARGET_MIN,
} from '../theme';
import { Bird } from '../components/Bird';
import { CompassRing } from '../components/CompassRing';
import { DestinationChip } from '../components/DestinationChip';
import { PrimaryButton } from '../components/PrimaryButton';

/** 案内中のオオハシのサイズ（pt）。 */
const BIRD_SIZE = 290;
/** 未選択時（休んでいる姿）のサイズ（pt）。 */
const SLEEPING_BIRD_SIZE = 300;
/** 方位リングの直径（pt）。 */
const RING_SIZE = 360;

export interface MainScreenProps {
  /** 表示用の派生値（domain の計算結果。UI では再計算しない）。 */
  readonly nav: NavState;
  /** 選択中の目的地名。未選択なら `null`。 */
  readonly destinationName: string | null;
  /** お気に入り状態。`null` は未対応（☆ を出さない）。 */
  readonly destinationFavorite: boolean | null;
  /** 位置情報の権限状態（拒否時の案内に使う）。 */
  readonly permission: PermissionOutcome | null;
  /** 目的地チップ・主要ボタンから S3（目的地を選ぶ）へ。 */
  readonly onOpenDestinationPicker: () => void;
  readonly onToggleFavorite: () => void;
  readonly onRequestPermission: () => void;
  readonly onRetryLocation: () => void;
  /** タイトル長押し（3 秒）で S7 開発メニューへ。 */
  readonly onOpenDevMenu: () => void;
}

/**
 * メイン（ナビ）画面 S2。UX-1〜UX-8 / docs/ux-design.md §4。
 *
 * - **表示専用**。`NavState` と目的地名・コールバックを props で受け取り、
 *   `hooks` / `adapters` を import しない。
 * - 目的地チップ（名前 + ▾ + ☆）/ 大きなオオハシ / 大きな距離 / 8 方位の言葉 /
 *   主要ボタン「目的地を選ぶ」。
 * - **GPS・コンパスの状態表示（1 行サマリ）は置かない**（2026-10-30 変更）。
 *   精度・鮮度の詳細は開発メニュー S7 の「状態の詳細」から開く（`StatusDetailSheet`）。
 * - **Mock・記録・生の精度数値は常時表示しない**（開発メニュー S7 へ隔離）。
 * - 権限拒否・位置不明・測位中は「次に何をすればよいか」を 1 文で示す（UX-5）。
 */
export function MainScreen({
  nav,
  destinationName,
  destinationFavorite,
  permission,
  onOpenDestinationPicker,
  onToggleFavorite,
  onRequestPermission,
  onRetryLocation,
  onOpenDevMenu,
}: MainScreenProps): ReactElement {
  const [permissionDismissed, setPermissionDismissed] = useState(false);

  const arrived = nav.status === 'arrived';
  const hasDestination = destinationName !== null;
  const hasLocation = nav.locationAgeMs !== null;
  const locating = nav.status === 'locating' || (hasDestination && !hasLocation);
  const positionLost = nav.status === 'position-lost';
  const headingUnknown = nav.status === 'heading-unknown';
  const permissionBlocked =
    permission !== null &&
    (permission.status === 'denied' || permission.status === 'undetermined');
  const showPermissionCard = permissionBlocked && !permissionDismissed;
  const showLocationState = hasDestination && (locating || positionLost);
  const showDistance = hasDestination && hasLocation && !arrived && !positionLost;

  const directionCaption = (): string => {
    if (!hasDestination) {
      return UI_TEXT.main.noDestinationBody;
    }
    if (positionLost) {
      return UI_TEXT.main.positionLostBody;
    }
    if (locating) {
      return UI_TEXT.main.locatingBody;
    }
    if (arrived) {
      return UI_TEXT.main.arrivedBody;
    }
    if (headingUnknown) {
      return UI_TEXT.main.headingUnknownBody;
    }
    return `${UI_TEXT.main.directionPrefix} ${directionWordLabel(nav.relativeBearingDeg)}`;
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="header"
            accessibilityLabel={UI_TEXT.appTitle}
            accessibilityHint={UI_TEXT.main.devMenuHint}
            delayLongPress={3000}
            onLongPress={onOpenDevMenu}
            style={styles.titleButton}
          >
            <Text style={styles.appTitle}>{UI_TEXT.appTitle}</Text>
          </Pressable>
          <DestinationChip
            name={destinationName}
            favorite={destinationFavorite}
            onPress={onOpenDestinationPicker}
            onToggleFavorite={onToggleFavorite}
          />
        </View>

        {showPermissionCard ? (
          <StateCard
            title={UI_TEXT.main.permissionTitle}
            body={UI_TEXT.main.permissionBody}
            primaryLabel={UI_TEXT.main.permissionAllow}
            onPrimary={onRequestPermission}
            secondaryLabel={UI_TEXT.main.permissionLater}
            onSecondary={() => setPermissionDismissed(true)}
          />
        ) : null}

        {showLocationState ? (
          <StateCard
            title={
              positionLost ? UI_TEXT.main.positionLostTitle : UI_TEXT.main.locatingTitle
            }
            body={
              positionLost ? UI_TEXT.main.positionLostBody : UI_TEXT.main.locatingBody
            }
            primaryLabel={UI_TEXT.main.retry}
            onPrimary={onRetryLocation}
          />
        ) : null}

        <View style={styles.birdArea}>
          <View style={styles.birdStage}>
            {hasDestination ? (
              <View style={styles.ringLayer} pointerEvents="none">
                <CompassRing size={RING_SIZE} />
              </View>
            ) : null}
            <Bird
              relativeBearingDeg={nav.relativeBearingDeg}
              arrived={arrived}
              size={hasDestination ? BIRD_SIZE : SLEEPING_BIRD_SIZE}
              pose={hasDestination ? 'standing' : 'sleeping'}
            />
          </View>
        </View>

        <View style={styles.readout}>
          {arrived ? (
            <>
              <Text style={styles.arrivedTitle}>{UI_TEXT.main.arrivedTitle}</Text>
              <Text style={styles.arrivedDistance}>{formatDistanceM(nav.distanceM)}</Text>
            </>
          ) : showDistance ? (
            <Text style={styles.distance}>{formatDistanceM(nav.distanceM)}</Text>
          ) : null}
          <Text style={styles.caption}>{directionCaption()}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

interface StateCardProps {
  readonly title: string;
  readonly body: string;
  readonly primaryLabel: string;
  readonly onPrimary: () => void;
  readonly secondaryLabel?: string;
  readonly onSecondary?: () => void;
}

/** 状態の案内カード（権限拒否・位置不明など）。「次に何をすればよいか」を 1 文で示す。 */
function StateCard({
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: StateCardProps): ReactElement {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      <View style={styles.stateActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onPrimary}
          style={({ pressed }) => [styles.statePrimary, pressed ? styles.pressed : null]}
        >
          <Text style={styles.statePrimaryText}>{primaryLabel}</Text>
        </Pressable>
        {secondaryLabel !== undefined && onSecondary !== undefined ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSecondary}
            style={({ pressed }) => [styles.stateSecondary, pressed ? styles.pressed : null]}
          >
            <Text style={styles.stateSecondaryText}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  titleButton: {
    minHeight: TAP_TARGET_MIN,
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  birdArea: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    paddingVertical: SPACING.sm,
  },
  birdStage: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readout: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  distance: {
    fontSize: FONT_SIZE.heroLarge,
    fontWeight: '800',
    color: COLORS.text,
  },
  arrivedTitle: {
    fontSize: FONT_SIZE.huge,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
  },
  arrivedDistance: {
    fontSize: FONT_SIZE.title,
    color: COLORS.textMuted,
  },
  caption: {
    fontSize: FONT_SIZE.title,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 28,
  },
  stateCard: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  stateTitle: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
    color: COLORS.text,
  },
  stateBody: {
    fontSize: FONT_SIZE.body,
    lineHeight: 22,
    color: COLORS.text,
  },
  stateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  statePrimary: {
    minHeight: TAP_TARGET_MIN,
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  statePrimaryText: {
    color: COLORS.onPrimary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '700',
  },
  stateSecondary: {
    minHeight: TAP_TARGET_MIN,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  stateSecondaryText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});

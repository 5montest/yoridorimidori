import type { ReactElement, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { screenLabel, type ScreenId } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

/** 常時表示するタブ（メイン・目的地のみ）。開発メニューはタイトル長押しの隠し導線（UX-6）。 */
const BASE_TABS: readonly ScreenId[] = ['main', 'destinations'];

/**
 * タブバーの高さ（コンテンツ部分）。UX-7 の最小タップ領域 48dp を余裕を持って満たす。
 */
const TAB_MIN_HEIGHT = 56;

/**
 * 下端の余白（ジェスチャーナビのホームバーに重ならないようにする）。
 * 端末差はあるが、余白が余る分にはレイアウトが崩れないため固定値で確保する。
 */
const TAB_BAR_BOTTOM_PADDING = 24;

export interface ScreenSwitcherProps {
  /** 現在の画面（App が保持する自前の遷移状態。ADR-07）。 */
  readonly screen: ScreenId;
  readonly onChange: (screen: ScreenId) => void;
  /** 表示中の画面要素。 */
  readonly children: ReactNode;
}

/** タブが現在の画面を表しているか（追加画面は目的地タブ、地図はナビタブに属する）。 */
function isActiveTab(screen: ScreenId, tab: ScreenId): boolean {
  if (tab === 'destinations') {
    return screen === 'destinations' || screen === 'add';
  }
  if (tab === 'main') {
    return screen === 'main' || screen === 'map';
  }
  return screen === tab;
}

/**
 * 画面切替の枠。§7.5 / §9.2。
 *
 * - **表示専用**。`screen` とコールバック・children を受け取り、`hooks` / `adapters` を import しない。
 * - `react-navigation` は使わない（依存追加禁止）。App の `useState<ScreenId>` が遷移状態を持つ。
 * - タブは**アイコン＋ラベル**で、高さ 56dp 以上（押しやすい）。アクティブはピル背景＋太字＋アイコン色で強調。
 */
export function ScreenSwitcher({
  screen,
  onChange,
  children,
}: ScreenSwitcherProps): ReactElement {
  return (
    <View style={styles.root}>
      <View style={styles.content}>{children}</View>
      <View style={styles.tabBar}>
        {BASE_TABS.map((tab) => {
          const active = isActiveTab(screen, tab);
          const label = screenLabel(tab);
          const color = active ? COLORS.primary : COLORS.textMuted;
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityLabel={`${label}タブ`}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(tab)}
              style={({ pressed }) => [styles.tab, pressed ? styles.pressed : null]}
            >
              <View style={[styles.tabPill, active ? styles.tabPillActive : null]}>
                {tab === 'main' ? <NavIcon color={color} /> : <PinIcon color={color} />}
                <Text style={[styles.tabText, { color }, active ? styles.tabTextActive : null]}>
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** 「ナビ」タブのアイコン（進行方向を表す上向き矢印）。 */
function NavIcon({ color }: { readonly color: string }): ReactElement {
  return <View style={[styles.navIcon, { borderBottomColor: color }]} />;
}

/** 「目的地」タブのアイコン（地図ピン）。 */
function PinIcon({ color }: { readonly color: string }): ReactElement {
  return (
    <View style={styles.pinWrap}>
      <View style={[styles.pinCircle, { borderColor: color }]} />
      <View style={[styles.pinTip, { borderTopColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingTop: SPACING.xs,
    paddingBottom: TAB_BAR_BOTTOM_PADDING,
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xs,
  },
  tab: {
    flex: 1,
    minHeight: TAB_MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
  },
  tabPill: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    minWidth: 120,
  },
  tabPillActive: {
    backgroundColor: COLORS.surfaceAlt,
  },
  tabText: {
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '500',
  },
  tabTextActive: {
    fontWeight: '700',
  },
  navIcon: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  pinWrap: {
    alignItems: 'center',
  },
  pinCircle: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    borderWidth: 3,
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  pressed: {
    opacity: 0.6,
  },
});

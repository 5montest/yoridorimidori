import type { ReactElement, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { screenLabel, type ScreenId } from '../labels';
import { COLORS, FONT_SIZE, SPACING } from '../theme';

/** 常時表示するタブ（メイン・目的地）。開発用タブは `devToolsVisible` のときだけ出す。 */
const BASE_TABS: readonly ScreenId[] = ['main', 'destinations', 'dev'];

export interface ScreenSwitcherProps {
  /** 現在の画面（App が保持する自前の遷移状態。ADR-07）。 */
  readonly screen: ScreenId;
  readonly onChange: (screen: ScreenId) => void;
  /** 開発ビルドか（`__DEV__` 由来。開発用タブの表示制御のみに使う）。 */
  readonly devToolsVisible: boolean;
  /** 表示中の画面要素。 */
  readonly children: ReactNode;
}

/** タブが現在の画面を表しているか（追加画面は目的地タブに属する）。 */
function isActiveTab(screen: ScreenId, tab: ScreenId): boolean {
  if (tab === 'destinations') {
    return screen === 'destinations' || screen === 'add';
  }
  return screen === tab;
}

/**
 * 画面切替の枠。§7.5 / §9.2。
 *
 * - **表示専用**。`screen` とコールバック・children を受け取り、`hooks` / `adapters` を import しない。
 * - `react-navigation` は使わない（依存追加禁止）。App の `useState<ScreenId>` が遷移状態を持つ。
 */
export function ScreenSwitcher({
  screen,
  onChange,
  devToolsVisible,
  children,
}: ScreenSwitcherProps): ReactElement {
  const tabs = devToolsVisible
    ? BASE_TABS
    : BASE_TABS.filter((tab) => tab !== 'dev');
  return (
    <View style={styles.root}>
      <View style={styles.content}>{children}</View>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = isActiveTab(screen, tab);
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(tab)}
              style={({ pressed }) => [
                styles.tab,
                active ? styles.tabActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
                {screenLabel(tab)}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  tabActive: {
    backgroundColor: COLORS.surfaceAlt,
  },
  tabText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});

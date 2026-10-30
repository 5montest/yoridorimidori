import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * 目的地選択（S3）などで使う簡易アイコン（View 描画）。
 *
 * - 画像アセットを増やさず、色とサイズだけ指定できるようにする。
 * - 装飾のみ。意味は必ずラベル文字で併記する（色・形だけに依存しない）。
 */
export interface IconProps {
  readonly size?: number;
  readonly color: string;
}

/** 検索（虫めがね）。 */
export function SearchIcon({ size = 18, color }: IconProps): ReactElement {
  const lens = size * 0.66;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={[
          styles.circle,
          {
            width: lens,
            height: lens,
            borderRadius: lens / 2,
            borderWidth: 2,
            borderColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.searchHandle,
          { width: size * 0.36, backgroundColor: color, bottom: size * 0.08, right: size * 0.04 },
        ]}
      />
    </View>
  );
}

/** 現在地（ターゲット）。 */
export function TargetIcon({ size = 22, color }: IconProps): ReactElement {
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color },
        ]}
      />
      <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size * 0.17, backgroundColor: color }} />
    </View>
  );
}

/** リンク（クリップボード取り込み）。 */
export function LinkIcon({ size = 22, color }: IconProps): ReactElement {
  const bar = { width: size * 0.58, height: size * 0.22, borderRadius: size * 0.11, borderWidth: 2, borderColor: color };
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View style={[bar, styles.linkBarA]} />
      <View style={[bar, styles.linkBarB]} />
    </View>
  );
}

/** 地図（折りたたみ地図）。 */
export function MapIcon({ size = 22, color }: IconProps): ReactElement {
  return (
    <View style={[styles.center, { width: size, height: size, flexDirection: 'row', gap: 2 }]}>
      <View style={{ width: size * 0.26, height: size * 0.78, borderWidth: 2, borderColor: color, borderRadius: 2 }} />
      <View style={{ width: size * 0.26, height: size * 0.9, borderWidth: 2, borderColor: color, borderRadius: 2 }} />
      <View style={{ width: size * 0.26, height: size * 0.78, borderWidth: 2, borderColor: color, borderRadius: 2 }} />
    </View>
  );
}

/** 時計（最近使った場所）。 */
export function ClockIcon({ size = 18, color }: IconProps): ReactElement {
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color },
        ]}
      />
      <View style={{ position: 'absolute', width: 2, height: size * 0.3, backgroundColor: color, bottom: size * 0.5 }} />
      <View
        style={{
          position: 'absolute',
          width: size * 0.28,
          height: 2,
          backgroundColor: color,
          left: size * 0.5,
          top: size * 0.48,
        }}
      />
    </View>
  );
}

/** 星（お気に入り）。 */
export function StarIcon({ size = 18, color }: IconProps): ReactElement {
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderWidth: 2,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'relative',
  },
  circle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchHandle: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  linkBarA: {
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    top: '20%',
    left: '4%',
  },
  linkBarB: {
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    bottom: '20%',
    right: '4%',
  },
});

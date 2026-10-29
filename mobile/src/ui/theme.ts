import type { GpsAccuracyClass, HeadingAccuracyClass } from '../domain/types';

/**
 * テーマ（色・余白・文字サイズ）。§9.8。
 *
 * - 色は**補助**。精度・鮮度・状態は必ず文字ラベルを併記する（NFR-08 / D-12）。
 * - `react-native` を import しない（StyleSheet はコンポーネント側）。
 */

/** 区分色のキー（色だけに依存しないための「強さ」表現）。 */
export type Tone = 'good' | 'fair' | 'poor' | 'unknown';

/** 区分色（good/fair/poor/unknown の 4 色）。§9.4 / §9.8。 */
export const TONE_COLORS: Readonly<Record<Tone, string>> = {
  good: '#1E7B4F',
  fair: '#B7791F',
  poor: '#B23A2E',
  unknown: '#6B7280',
};

/** 背景・文字・アクセント。深緑＋クリームのブランド配色。 */
export const COLORS = {
  background: '#F7F3E8',
  surface: '#FFFFFF',
  surfaceAlt: '#EFE9D8',
  text: '#1C2B24',
  textMuted: '#5A6B61',
  primary: '#1F5D4C',
  onPrimary: '#F7F3E8',
  border: '#D9D2C0',
  warning: '#B23A2E',
  disabled: '#B9B2A0',
  overlay: 'rgba(28, 43, 36, 0.08)',
} as const;

/** 余白（4 の倍数）。 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** 文字サイズ。 */
export const FONT_SIZE = {
  caption: 12,
  body: 14,
  bodyLarge: 16,
  title: 20,
  heading: 24,
  display: 30,
  huge: 44,
} as const;

/** 角丸。 */
export const RADIUS = {
  sm: 8,
  md: 12,
  pill: 999,
} as const;

/** GPS 精度区分 → 区分色。 */
export function gpsAccuracyColor(accuracyClass: GpsAccuracyClass): string {
  return TONE_COLORS[accuracyClass];
}

/** 方位精度区分 → 区分色（`uncalibrated` は `poor` と同じ扱い）。 */
export function headingAccuracyColor(accuracyClass: HeadingAccuracyClass): string {
  switch (accuracyClass) {
    case 'good':
      return TONE_COLORS.good;
    case 'fair':
      return TONE_COLORS.fair;
    case 'poor':
    case 'uncalibrated':
      return TONE_COLORS.poor;
    case 'unknown':
      return TONE_COLORS.unknown;
  }
}

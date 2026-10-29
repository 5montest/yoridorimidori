import { normalizeDegrees360 } from './normalize';

/** 未取得・不正値の表示。UI 文言ではなく「値が無い」記号として domain に置く（§6.10）。 */
const PLACEHOLDER = '—';

/**
 * 距離表示。FR-07 / E-13。
 *
 * - `null` / 負値 / 非有限 → `'—'`。
 * - **生値**が 1,000 未満はメートル表記（`Math.round` で整数。例: `999.6 → '1000 m'`）。
 * - 1,000 以上は km 表記（小数 2 桁。例: `1000 → '1.00 km'`）。
 * - 表示専用であり内部値は丸めない。
 */
export function formatDistanceM(distanceM: number | null): string {
  if (distanceM === null || !Number.isFinite(distanceM) || distanceM < 0) {
    return PLACEHOLDER;
  }
  // 閾値判定は丸め前の生値（E-13 の確定解釈）。
  if (distanceM < 1_000) {
    return `${Math.round(distanceM)} m`;
  }
  return `${(distanceM / 1_000).toFixed(2)} km`;
}

/**
 * 経過時間表示（秒）。FR-08。
 *
 * - `null` / 負値 / 非有限 → `'—'`。
 * - それ以外は `Math.round(ms / 1000)` + `' 秒'`（例: `12_000 → '12 秒'`）。
 */
export function formatAgeMs(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) {
    return PLACEHOLDER;
  }
  return `${Math.round(ageMs / 1_000)} 秒`;
}

/**
 * 方位表示。FR-04 / FR-08。
 *
 * - `null` / 非有限 → `'—'`。
 * - `normalizeDegrees360` → 整数へ丸め → 丸め後 360 なら `0`（`359.6 → '0°'`）。
 */
export function formatBearingDeg(bearingDeg: number | null): string {
  if (bearingDeg === null || !Number.isFinite(bearingDeg)) {
    return PLACEHOLDER;
  }
  const normalized = normalizeDegrees360(bearingDeg);
  const rounded = Math.round(normalized);
  const degree = rounded === 360 ? 0 : rounded;
  return `${degree}°`;
}

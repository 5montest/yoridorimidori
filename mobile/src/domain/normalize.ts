import { DEG2RAD, RAD2DEG } from './constants';

/**
 * 度 → ラジアン。式の直前に 1 度だけ使う（途中で丸めない。§6.3）。
 */
export function toRadians(deg: number): number {
  return deg * DEG2RAD;
}

/**
 * ラジアン → 度。
 */
export function toDegrees(rad: number): number {
  return rad * RAD2DEG;
}

/**
 * `[0, 360)` へ正規化する（目標方位・見た目の角度）。
 *
 * - 非有限（NaN / ±Infinity）は `NaN` を返す（呼び出し側がガードする契約）。
 * - `-0` は `0` に正規化する（`-0` をデータモデルに入れない。§3.2 / 付録C-6）。
 * - 浮動小数の誤差で 360 になるケースを `>= 360` で潰す（§6.2 参照実装）。
 */
export function normalizeDegrees360(deg: number): number {
  if (!Number.isFinite(deg)) {
    return NaN;
  }
  let r = deg % 360; // JS の % は被除数の符号を引き継ぐ: -1 % 360 === -1
  if (r < 0) {
    r += 360;
  }
  if (r >= 360) {
    r -= 360; // 浮動小数の誤差で 360 になるのを防ぐ
  }
  return r === 0 ? 0 : r; // -0 を 0 に落とす
}

/**
 * `(-180, 180]` へ正規化する（相対方位）。
 *
 * - 一意性のため `-180` は `180` に寄せる（`r <= -180` を `+360`）。
 * - 非有限は `NaN`、`-0` は `0`。
 */
export function normalizeSignedDegrees(deg: number): number {
  if (!Number.isFinite(deg)) {
    return NaN;
  }
  let r = deg % 360;
  if (r <= -180) {
    r += 360; // -180 → 180（一意性のため）
  }
  if (r > 180) {
    r -= 360;
  }
  return r === 0 ? 0 : r; // -0 → 0
}

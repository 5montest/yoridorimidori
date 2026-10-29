import { normalizeDegrees360, normalizeSignedDegrees } from './normalize';

/**
 * 前回の累積回転角から、目標の画面角度へ**最短経路**で向かう「次の累積角度」を返す。§6.9 / E-14。
 *
 * @param previousContinuousDeg 前回の累積回転角（連続値。負も可・360 を超えてもよい）
 * @param targetScreenDeg 目標の画面角度（`(-180, 180]` の相対方位。鳥の向き）
 *
 * - 359° → 1° は `+2°`（`361°`）。`-358°` の逆回転はしない。
 * - `-180` は一意性規則により `180` 側に寄せる。
 * - 非有限が混じった場合は `previousContinuousDeg` をそのまま返す（防御）。
 * - ニュートラル（`relativeBearingDeg === null`）や到着時の目標 `0°` は呼び出し側の責務（ADR-03）。
 */
export function nextContinuousAngleDeg(
  previousContinuousDeg: number,
  targetScreenDeg: number,
): number {
  if (!Number.isFinite(previousContinuousDeg) || !Number.isFinite(targetScreenDeg)) {
    return previousContinuousDeg;
  }
  const base = normalizeDegrees360(previousContinuousDeg); // 前回の見た目の角度
  const delta = normalizeSignedDegrees(targetScreenDeg - base); // 最短差分 (-180, 180]
  const next = previousContinuousDeg + delta;
  return next === 0 ? 0 : next; // -0 をデータに入れない
}

/**
 * 見た目が同一の 360° 単位で累積値を巻き戻す（数値の肥大化防止）。§6.9。
 *
 * @param maxAbsDeg 許容する絶対値（既定 720°）。0 以下・非有限は既定値として扱う（防御）。
 */
export function reduceContinuousAngle(continuousDeg: number, maxAbsDeg: number = 720): number {
  if (!Number.isFinite(continuousDeg)) {
    return 0;
  }
  const limit = Number.isFinite(maxAbsDeg) && maxAbsDeg > 0 ? maxAbsDeg : 720;
  let reduced = continuousDeg;
  while (reduced > limit) {
    reduced -= 360;
  }
  while (reduced < -limit) {
    reduced += 360;
  }
  return reduced === 0 ? 0 : reduced;
}

import { normalizeDegrees360 } from './normalize';
import type {
  HeadingAccuracyLevel,
  HeadingFix,
  SensorFix,
  SensorSource,
} from './types';
import { isValidGeoPoint } from './validation';

/**
 * expo-location の `LocationObject` と**構造互換**の読み取り型（§5.3）。
 * ライブラリ型を import しないことで domain の外部依存ゼロを守る。
 */
export interface LocationReadingLike {
  readonly coords: {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracy: number | null;
  };
  readonly timestamp: number;
}

/** expo-location の `LocationHeadingObject` と構造互換の読み取り型（§5.3 / §2.6）。 */
export interface HeadingReadingLike {
  readonly trueHeading: number;
  readonly magHeading: number;
  readonly accuracy: number;
}

/**
 * `LocationObject` → `SensorFix`（§5.1 / §6.11）。
 *
 * - 緯度・経度が不正（NaN / ±Infinity / 範囲外）なら `null`（呼び出し側が `invalid-data` にする）。
 * - `accuracy` は有限かつ `>= 0` のときのみ採用、それ以外は `null`（§5.1 手順 2。0 はそのまま渡す）。
 * - `timestamp` は有限なら `capturedAtEpochMs` に採用、それ以外は `null`（鮮度には使わない）。
 * - `receivedAt*` と `source` は呼び出し側（アダプタ）が付与する。
 * - **`coords.heading`（進行方向）は参照しない**（方位ではない。§2.4）。
 */
export function mapLocationReading(
  reading: LocationReadingLike,
  receivedAtMonotonicMs: number,
  receivedAtEpochMs: number,
  source: SensorSource,
): SensorFix | null {
  const raw: unknown = reading;
  if (!isRecord(raw)) {
    return null;
  }
  const coords = raw.coords;
  if (!isRecord(coords)) {
    return null;
  }
  const latitude = coords.latitude;
  const longitude = coords.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  if (!isValidGeoPoint({ latitude, longitude })) {
    return null;
  }
  const rawAccuracy = coords.accuracy;
  const accuracyM =
    typeof rawAccuracy === 'number' && Number.isFinite(rawAccuracy) && rawAccuracy >= 0
      ? rawAccuracy
      : null;
  const rawTimestamp = raw.timestamp;
  const capturedAtEpochMs =
    typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp) ? rawTimestamp : null;

  return {
    point: { latitude, longitude },
    accuracyM,
    capturedAtEpochMs,
    receivedAtMonotonicMs,
    receivedAtEpochMs,
    source,
  };
}

/**
 * `LocationHeadingObject` → `HeadingFix`（D-05 / §5.2）。throw しない。
 *
 * 1. `accuracy` を `toHeadingAccuracyLevel()` で 0〜3 / null に正規化。
 * 2. `trueHeading` が有限かつ `0 <= x <= 360` → `normalizeDegrees360` + `'true-north'`。
 * 3. だめなら `magHeading` が有効なら `'magnetic-north'` にフォールバック（**磁北基準の注記対象**）。
 * 4. どちらも不可 → `headingDeg: null`, `reference: 'unknown'`（UI は「方位不明」＋ニュートラル）。
 * - `-1`（位置権限なし）は「不明」として扱う（防御的に負値・範囲外・NaN はすべて不明）。
 * - **`coords.heading` は参照しない**。
 */
export function mapHeadingReading(
  reading: HeadingReadingLike,
  receivedAtMonotonicMs: number,
  receivedAtEpochMs: number,
  source: SensorSource,
): HeadingFix {
  const raw: unknown = reading;
  const trueHeading = isRecord(raw) ? toFiniteNumber(raw.trueHeading) : null;
  const magHeading = isRecord(raw) ? toFiniteNumber(raw.magHeading) : null;
  const accuracy = isRecord(raw) ? toHeadingAccuracyLevel(raw.accuracy) : null;

  const trueDeg = toCompassDegrees(trueHeading);
  if (trueDeg !== null) {
    return {
      headingDeg: trueDeg,
      reference: 'true-north',
      accuracy,
      receivedAtMonotonicMs,
      receivedAtEpochMs,
      source,
    };
  }
  const magDeg = toCompassDegrees(magHeading);
  if (magDeg !== null) {
    return {
      headingDeg: magDeg,
      reference: 'magnetic-north',
      accuracy,
      receivedAtMonotonicMs,
      receivedAtEpochMs,
      source,
    };
  }
  return {
    headingDeg: null,
    reference: 'unknown',
    accuracy,
    receivedAtMonotonicMs,
    receivedAtEpochMs,
    source,
  };
}

/** コンパス校正レベル（ライブラリは number を返す）を 0〜3 / null に正規化する。§6.7。 */
export function toHeadingAccuracyLevel(value: unknown): HeadingAccuracyLevel | null {
  switch (value) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    default:
      return null; // 4 / -1 / 1.5 / NaN / Infinity / 文字列など
  }
}

/** コンパス方位として妥当（有限かつ 0〜360）なら `[0, 360)` に正規化する。 */
function toCompassDegrees(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 360) {
    return null;
  }
  return normalizeDegrees360(value);
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

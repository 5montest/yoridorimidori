import type { GeoPoint } from './types';

/**
 * 目的地入力の検証結果。
 * `ok: true` のとき `value` が入り、`ok: false` のとき `errorKey` が入る（UI 文言キー）。
 */
export interface ValidationResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  /** 失敗理由（UI 文言キー）。 */
  readonly errorKey?:
    | 'name-required'
    | 'name-too-long'
    | 'latitude-invalid'
    | 'longitude-invalid'
    | 'point-invalid';
}

/** 目的地名の最大文字数（trim 後）。FR-01 / §6.11。 */
export const DESTINATION_NAME_MAX_LENGTH = 50;

/** 緯度として妥当か（有限かつ [-90, 90]）。E-12。 */
export function isValidLatitude(lat: number): boolean {
  return isLatitudeValue(lat);
}

/** 経度として妥当か（有限かつ [-180, 180]）。E-12。 */
export function isValidLongitude(lon: number): boolean {
  return isLongitudeValue(lon);
}

/**
 * 座標として妥当か（型不正・NaN・Infinity・範囲外をすべて拒否）。
 * 実行時の防御のため `GeoPoint` 型でも中身を検査する。
 */
export function isValidGeoPoint(point: GeoPoint): boolean {
  const raw: unknown = point;
  if (!isRecord(raw)) {
    return false;
  }
  return isLatitudeValue(raw.latitude) && isLongitudeValue(raw.longitude);
}

/**
 * 目的地の登録・更新入力を検証する（FR-01 / E-12）。
 *
 * - 前後空白を除去した名前が 1〜50 文字であること。
 * - 緯度・経度が有限かつ範囲内であること。
 * - 判定順は `name-required` → `name-too-long` → `latitude-invalid` →
 *   `longitude-invalid`（両方不正なら `latitude-invalid`）。`point-invalid` は
 *   point が null / 非オブジェクトなど「型そのものが不正」なときだけ返す。
 * - 例外を投げない。`origin`（DestinationOrigin）は呼び出し側が付与する（§6.11 注記）。
 */
export function validateDestinationInput(input: {
  readonly name: string;
  readonly point: GeoPoint;
}): ValidationResult<{ readonly name: string; readonly point: GeoPoint }> {
  const raw: unknown = input;
  if (!isRecord(raw)) {
    return { ok: false, errorKey: 'point-invalid' };
  }

  const rawName = raw.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (name.length === 0) {
    return { ok: false, errorKey: 'name-required' };
  }
  if (name.length > DESTINATION_NAME_MAX_LENGTH) {
    return { ok: false, errorKey: 'name-too-long' };
  }

  const rawPoint = raw.point;
  if (!isRecord(rawPoint)) {
    return { ok: false, errorKey: 'point-invalid' };
  }
  const latitude = rawPoint.latitude;
  if (!isLatitudeValue(latitude)) {
    return { ok: false, errorKey: 'latitude-invalid' };
  }
  const longitude = rawPoint.longitude;
  if (!isLongitudeValue(longitude)) {
    return { ok: false, errorKey: 'longitude-invalid' };
  }

  return { ok: true, value: { name, point: { latitude, longitude } } };
}

/** 実行時の unknown を安全にオブジェクトとして扱うためのガード。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLatitudeValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitudeValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

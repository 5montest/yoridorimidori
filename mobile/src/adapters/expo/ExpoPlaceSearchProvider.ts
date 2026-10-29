import * as Location from 'expo-location';
import { Platform } from 'react-native';
import {
  buildAddressLine,
  buildDestinationName,
  createPlaceCandidate,
  type GeocodedAddressLike,
  type PlaceCandidate,
} from '../../domain/placeCandidate';
import type { GeoPoint } from '../../domain/types';
import { isValidGeoPoint } from '../../domain/validation';
import type { Clock } from '../../ports/clock';
import type { ProviderError, ProviderErrorCode } from '../../ports/common';
import type { PlaceSearchProvider } from '../../ports/placeSearch';

export interface ExpoPlaceSearchProviderOptions {
  readonly clock: Clock;
  /** `Platform.OS` を注入する（テスト用）。省略時は react-native の `Platform.OS`。 */
  readonly platform?: string;
  /** geocode API の有無を注入する（テスト用）。省略時は関数の存在で判定。 */
  readonly hasGeocode?: boolean;
  /** 失敗の通知先（ログ・開発画面用）。ポートを汚さない実装詳細。 */
  readonly onError?: (error: ProviderError) => void;
}

/**
 * `expo-location` のジオコーディングによる `PlaceSearchProvider`（Phase 4 / U03）。
 *
 * 使用する確定 API（research §1.2。**これ以外は使わない**）:
 *  - `Location.geocodeAsync(address): Promise<LocationGeocodedLocation[]>`
 *    — Expo Go 同梱・API キー不要・**Android 実装は最大 1 件**・ネットワーク必須・
 *    Android では前景位置権限が必要。
 *  - `Location.reverseGeocodeAsync({ latitude, longitude }): Promise<LocationGeocodedAddress[]>`
 *
 * 設計:
 *  - **throw しない**。失敗時は `search` は `[]`、`reverse` は `null`（UI は「地図から選ぶ」へ誘導）。
 *  - geocode は座標しか返さないため、検索候補の `name` は**検索語**、`address` は `null`
 *    （research §1.5。候補リストを複数件前提にしない）。
 *  - 逆ジオコーディングの表示名は `buildDestinationName`（住所連結・フォールバック込み）。
 *  - geocode は Android / iOS のみ（Web 非対応）。`isAvailable()` で判定する。
 */
export class ExpoPlaceSearchProvider implements PlaceSearchProvider {
  private readonly clock: Clock;
  private readonly platform: string;
  private readonly hasGeocode: boolean;
  private readonly onError: (error: ProviderError) => void;

  constructor(options: ExpoPlaceSearchProviderOptions) {
    this.clock = options.clock;
    this.platform = options.platform ?? Platform.OS;
    this.hasGeocode = options.hasGeocode ?? typeof Location.geocodeAsync === 'function';
    this.onError = options.onError ?? (() => undefined);
  }

  isAvailable(): Promise<boolean> {
    const supportedPlatform = this.platform === 'android' || this.platform === 'ios';
    return Promise.resolve(supportedPlatform && this.hasGeocode);
  }

  async search(query: string): Promise<readonly PlaceCandidate[]> {
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (trimmed.length === 0 || !this.hasGeocode) {
      return [];
    }
    try {
      const results = await Location.geocodeAsync(trimmed);
      if (!Array.isArray(results)) {
        return [];
      }
      const candidates: PlaceCandidate[] = [];
      for (const result of results) {
        const point = toGeoPoint(result);
        if (point === null) {
          continue; // 不正な戻り値は捨てる（§11.3 #9）
        }
        const candidate = createPlaceCandidate({
          id: candidateId('geocode', point),
          name: trimmed,
          address: null,
          point,
          source: 'geocode',
        });
        if (candidate !== null) {
          candidates.push(candidate);
        }
      }
      return candidates;
    } catch (error) {
      this.report('runtime-error', '場所検索に失敗しました', error);
      return [];
    }
  }

  async reverse(point: GeoPoint): Promise<PlaceCandidate | null> {
    if (!isValidGeoPoint(point) || !this.hasGeocode) {
      return null;
    }
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: point.latitude,
        longitude: point.longitude,
      });
      const first = Array.isArray(results) ? results[0] : undefined;
      if (first === undefined || first === null || typeof first !== 'object') {
        return null;
      }
      const address = first as GeocodedAddressLike;
      return createPlaceCandidate({
        id: candidateId('reverse', point),
        name: buildDestinationName(address),
        address: buildAddressLine(address),
        point: { latitude: point.latitude, longitude: point.longitude },
        source: 'reverse-geocode',
      });
    } catch (error) {
      this.report('runtime-error', '場所名の取得に失敗しました', error);
      return null;
    }
  }

  private report(code: ProviderErrorCode, message: string, detail?: unknown): void {
    this.onError({
      code,
      message,
      atMonotonicMs: this.clock.nowMonotonicMs(),
      ...(toDetail(detail) === undefined ? {} : { detail: toDetail(detail) }),
    });
  }
}

function candidateId(prefix: string, point: GeoPoint): string {
  return `${prefix}:${point.latitude},${point.longitude}`;
}

function toGeoPoint(value: unknown): GeoPoint | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as { readonly latitude?: unknown; readonly longitude?: unknown };
  const latitude = record.latitude;
  const longitude = record.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  const point: GeoPoint = { latitude, longitude };
  return isValidGeoPoint(point) ? point : null;
}

function toDetail(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : undefined;
}

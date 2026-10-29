import { DEFAULT_THRESHOLDS } from '../../domain/constants';
import { normalizeDegrees360 } from '../../domain/normalize';
import { ringTrim } from '../../domain/ringBuffer';
import type {
  Destination,
  DestinationOrigin,
  HeadingAccuracyLevel,
  HeadingReference,
  SampleLogEntry,
} from '../../domain/types';
import { isValidLatitude, isValidLongitude } from '../../domain/validation';

/**
 * 永続化 JSON の encode / decode（§10.1〜§10.3）。**純粋関数**（AsyncStorage に依存しない）。
 *
 * - decode は**例外を投げず**判別可能な結果を返す。
 * - 要素単位の検証で、型不正・座標範囲外の要素だけを読み飛ばす（`droppedCount`）。
 * - 重複 `id` は**先勝ち**。`selectedId` が items に無ければ `null` に補正。
 * - 未知フィールドは無視（前方互換）。`schemaVersion` 欠落は v1 として読む。
 * - **目的地ストアは v1 → v2 の移行を decode 内で行う**（Phase 4 / U04）:
 *   旧データ（`favorite` / `lastUsedAtEpochMs` なし）は既定値（`false` / `null`）で補完し、
 *   `migratedFromVersion` を返す（呼び出し側が v2 へ書き戻す判断に使う）。
 */

/** 目的地ストアの現行スキーマバージョン（v2 で favorite / lastUsedAtEpochMs を追加）。 */
export const DESTINATIONS_SCHEMA_VERSION = 2;

/** 目的地ストアの旧スキーマバージョン（移行元）。 */
export const LEGACY_DESTINATIONS_SCHEMA_VERSION = 1;

/** サンプルストアの現行スキーマバージョン（変更なし）。 */
export const SAMPLES_SCHEMA_VERSION = 1;

/** サンプルの文字列長がこれを超えたら縮小保存する（§10.5。Android の 1 エントリ約 2 MB 対策）。 */
export const SAMPLES_CHAR_BUDGET = 200_000;

/** 文字数超過時に残す件数（§10.5 の「最新 150 件」）。 */
export const SAMPLES_FALLBACK_KEEP_COUNT = 150;

/** 目的地名の最大文字数（保存形式の防御的検証。§6.11）。 */
const DESTINATION_NAME_MAX_LENGTH = 50;

export type DecodeFailureReason = 'parse' | 'shape' | 'future-version';

/** decode の結果。`ok: false` のときは生文字列（退避用）も返す。 */
export type DecodeResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly droppedCount: number;
      /** 旧スキーマから読み替えた場合の元バージョン（書き戻しの判断に使う）。 */
      readonly migratedFromVersion?: number;
    }
  | { readonly ok: false; readonly reason: DecodeFailureReason; readonly raw: string };

/** 目的地ストアの値。 */
export interface DestinationStoreValue {
  readonly items: readonly Destination[];
  readonly selectedId: string | null;
}

/** サンプルストアの値（古い順）。 */
export interface SampleStoreValue {
  readonly items: readonly SampleLogEntry[];
}

/** 目的地ストアを JSON 化する。 */
export function encodeDestinations(
  items: readonly Destination[],
  selectedId: string | null,
): string {
  return JSON.stringify({ schemaVersion: DESTINATIONS_SCHEMA_VERSION, items, selectedId });
}

/** サンプルストアを JSON 化する（古い順の配列をそのまま書く）。 */
export function encodeSamples(items: readonly SampleLogEntry[]): string {
  return JSON.stringify({ schemaVersion: SAMPLES_SCHEMA_VERSION, items });
}

/** 目的地ストアを復号する。破損・型不正でも throw しない（v1 は v2 に読み替える）。 */
export function decodeDestinations(raw: string): DecodeResult<DestinationStoreValue> {
  const envelope = parseEnvelope(raw, DESTINATIONS_SCHEMA_VERSION);
  if (!envelope.ok) {
    return envelope;
  }
  const rawItems = envelope.value.items;
  if (!Array.isArray(rawItems)) {
    return { ok: false, reason: 'shape', raw };
  }

  const items: Destination[] = [];
  const seenIds = new Set<string>();
  let droppedCount = 0;
  for (const rawItem of rawItems as readonly unknown[]) {
    const destination = decodeDestination(rawItem);
    if (destination === null || seenIds.has(destination.id)) {
      droppedCount += 1; // 型不正 or 重複 id（先勝ち）
      continue;
    }
    seenIds.add(destination.id);
    items.push(destination);
  }

  const rawSelectedId = envelope.value.selectedId;
  const selectedId =
    typeof rawSelectedId === 'string' && seenIds.has(rawSelectedId) ? rawSelectedId : null;

  const value: DestinationStoreValue = { items, selectedId };
  return envelope.version < DESTINATIONS_SCHEMA_VERSION
    ? { ok: true, value, droppedCount, migratedFromVersion: envelope.version }
    : { ok: true, value, droppedCount };
}

/**
 * サンプルストアを復号する。容量超過分は `ringTrim` で「新しい方から容量分」に切り詰める。
 *
 * @param capacity リング容量（既定は `DEFAULT_THRESHOLDS.sampleLogCapacity` = 300）
 */
export function decodeSamples(
  raw: string,
  capacity: number = DEFAULT_THRESHOLDS.sampleLogCapacity,
): DecodeResult<SampleStoreValue> {
  const envelope = parseEnvelope(raw, SAMPLES_SCHEMA_VERSION);
  if (!envelope.ok) {
    return envelope;
  }
  const rawItems = envelope.value.items;
  if (!Array.isArray(rawItems)) {
    return { ok: false, reason: 'shape', raw };
  }

  const items: SampleLogEntry[] = [];
  let droppedCount = 0;
  for (const rawItem of rawItems as readonly unknown[]) {
    const sample = decodeSample(rawItem);
    if (sample === null) {
      droppedCount += 1;
      continue;
    }
    items.push(sample);
  }

  return {
    ok: true,
    value: { items: ringTrim(items, capacity) },
    droppedCount,
  };
}

/**
 * 文字数が `maxChars` を超えたとき、**最新側**から `keepLast` 件だけ残す（§10.5 のサイズ防御）。
 * 超えていなければ入力をそのまま返す（コピーはしない）。空配列は空配列。
 */
export function trimSamplesToCharBudget(
  entries: readonly SampleLogEntry[],
  maxChars: number,
  keepLast: number = SAMPLES_FALLBACK_KEEP_COUNT,
): readonly SampleLogEntry[] {
  if (entries.length === 0) {
    return [];
  }
  if (encodeSamples(entries).length <= maxChars) {
    return entries;
  }
  const keep =
    Number.isFinite(keepLast) && keepLast >= 1
      ? Math.floor(keepLast)
      : SAMPLES_FALLBACK_KEEP_COUNT;
  return entries.slice(Math.max(0, entries.length - keep));
}

// ── 内部ヘルパー ───────────────────────────────────────────────────────────

type EnvelopeResult =
  | {
      readonly ok: true;
      readonly value: Record<string, unknown>;
      /** 実データのスキーマバージョン（欠落は v1 とみなす）。 */
      readonly version: number;
    }
  | { readonly ok: false; readonly reason: DecodeFailureReason; readonly raw: string };

/**
 * ルートの JSON を解析し schemaVersion を検査する。
 * 欠落は v1（旧形式）とみなし、`currentVersion` 以下の旧バージョンは移行対象として受け入れる。
 */
function parseEnvelope(raw: string, currentVersion: number): EnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'parse', raw };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reason: 'shape', raw };
  }
  const rawVersion = parsed.schemaVersion;
  const version = rawVersion === undefined || rawVersion === null ? 1 : rawVersion; // 欠落は v1
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'shape', raw };
  }
  if (version > currentVersion) {
    return { ok: false, reason: 'future-version', raw }; // 将来バージョンは上書きしない
  }
  return { ok: true, value: parsed, version };
}

function decodeDestination(value: unknown): Destination | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = value.id;
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }
  const rawName = value.name;
  if (typeof rawName !== 'string') {
    return null;
  }
  const name = rawName.trim();
  if (name.length < 1 || name.length > DESTINATION_NAME_MAX_LENGTH) {
    return null;
  }
  const createdAtEpochMs = value.createdAtEpochMs;
  if (typeof createdAtEpochMs !== 'number' || !Number.isFinite(createdAtEpochMs)) {
    return null;
  }
  const origin = value.origin;
  if (!isDestinationOrigin(origin)) {
    return null;
  }
  const point = decodeGeoPoint(value.point);
  if (point === null) {
    return null;
  }
  // Phase 4（UX 刷新）で追加。既存データ（favorite / lastUsedAtEpochMs なし）は既定値で補完する（U04 の移行）。
  const favorite = value.favorite === true;
  const rawLastUsedAt = value.lastUsedAtEpochMs;
  const lastUsedAtEpochMs =
    typeof rawLastUsedAt === 'number' && Number.isFinite(rawLastUsedAt) ? rawLastUsedAt : null;
  return { id, name, point, createdAtEpochMs, origin, favorite, lastUsedAtEpochMs };
}

function decodeSample(value: unknown): SampleLogEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const recordedAtEpochMs = value.recordedAtEpochMs;
  if (typeof recordedAtEpochMs !== 'number' || !Number.isFinite(recordedAtEpochMs)) {
    return null;
  }
  const point = decodeGeoPoint(value);
  if (point === null) {
    return null;
  }
  const gpsAccuracyM = decodeNullableNonNegative(value.gpsAccuracyM);
  if (gpsAccuracyM === undefined) {
    return null;
  }
  const headingDeg = decodeHeadingDeg(value.headingDeg);
  if (headingDeg === undefined) {
    return null;
  }
  const headingReference = value.headingReference;
  if (!isHeadingReference(headingReference)) {
    return null;
  }
  const headingAccuracy = decodeHeadingAccuracy(value.headingAccuracy);
  if (headingAccuracy === undefined) {
    return null;
  }
  const locationAgeMs = decodeNonNegative(value.locationAgeMs);
  if (locationAgeMs === undefined) {
    return null;
  }
  const headingAgeMs = decodeNullableNonNegative(value.headingAgeMs);
  if (headingAgeMs === undefined) {
    return null;
  }
  return {
    recordedAtEpochMs,
    latitude: point.latitude,
    longitude: point.longitude,
    gpsAccuracyM,
    headingDeg,
    headingReference,
    headingAccuracy,
    locationAgeMs,
    headingAgeMs,
  };
}

/** `{ latitude, longitude }` を検証する（値オブジェクト、または item 自体から読む）。 */
function decodeGeoPoint(value: unknown): { readonly latitude: number; readonly longitude: number } | null {
  if (!isRecord(value)) {
    return null;
  }
  const latitude = value.latitude;
  const longitude = value.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

/** null または有限の 0 以上を返す。`undefined` は「型不正」を意味する。 */
function decodeNullableNonNegative(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return decodeNonNegative(value);
}

function decodeNonNegative(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

/** null または [0,360) の数値。`undefined` は型不正。 */
function decodeHeadingDeg(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return normalizeDegrees360(value);
}

function decodeHeadingAccuracy(value: unknown): HeadingAccuracyLevel | null | undefined {
  if (value === null) {
    return null;
  }
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return value;
  }
  return undefined;
}

function isDestinationOrigin(value: unknown): value is DestinationOrigin {
  return value === 'manual' || value === 'preset' || value === 'current-location';
}

function isHeadingReference(value: unknown): value is HeadingReference {
  return value === 'true-north' || value === 'magnetic-north' || value === 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

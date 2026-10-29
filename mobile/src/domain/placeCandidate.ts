import type { GeoPoint } from './types';
import { DESTINATION_NAME_MAX_LENGTH, isValidGeoPoint } from './validation';

/**
 * 場所候補（S5 検索結果・S4 地図タップの逆ジオコーディング結果）。
 * 外部ライブラリ型は使わない（domain の外部依存ゼロ）。
 */
export type PlaceCandidateSource = 'geocode' | 'reverse-geocode' | 'map';

export interface PlaceCandidate {
  /** 候補の一意 ID（呼び出し側が生成。'geocode:35.6,139.7' 等）。 */
  readonly id: string;
  /** 表示名（1〜50 文字）。 */
  readonly name: string;
  /** 住所（補助表示。無ければ null）。 */
  readonly address: string | null;
  readonly point: GeoPoint;
  readonly source: PlaceCandidateSource;
}

/**
 * expo-location の `LocationGeocodedAddress` と構造互換の読み取り型（型 import はしない）。
 * すべて `string | null`（notes / destination-ux-apis §1.2）。
 */
export interface GeocodedAddressLike {
  readonly name?: string | null;
  readonly streetNumber?: string | null;
  readonly street?: string | null;
  readonly district?: string | null;
  readonly subregion?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly country?: string | null;
  readonly postalCode?: string | null;
  readonly formattedAddress?: string | null;
}

/**
 * 住所から目的地名を作れなかったときのフォールバック。
 *
 * 原則として文言は `ui/labels.ts` だが、「逆ジオコーディング結果から名前を作る純粋関数」に
 * フォールバック文言を含めることが U01 の指示（Lead 決定）のため、ここに定数として置く。
 */
export const FALLBACK_DESTINATION_NAME = '選択した地点';

// ── テキストからの場所名推定（共有リンク・クリップボード） ─────────────────

/**
 * 共有テキストから場所名候補を取り出す。
 *
 * - 行単位で見て、**URL・`geo:` URI・座標ペアを除いた残り**が非空の最初の行を名前とする
 *   （例: `東京タワー\n35.6586, 139.7454\nhttps://maps.app.goo.gl/...` → `東京タワー`）。
 * - 座標ペアだけの行・URL だけの行はスキップする。
 * - 前後空白を除去し、内部の連続空白は 1 つに畳む。50 文字を超える場合は切り詰める。
 * - 候補が無ければ `null`。
 */
export function buildDestinationName(text: string): string | null;
/**
 * 逆ジオコーディング結果（`LocationGeocodedAddress` 互換）から表示名を作る。
 *
 * 優先順: `name` → `formattedAddress` → 住所の連結（`streetNumber + street + district + city + region`）。
 * どれも空なら {@link FALLBACK_DESTINATION_NAME} を返す（例: 海上・山中等で住所が無い場合）。
 */
export function buildDestinationName(address: GeocodedAddressLike | null | undefined): string;
export function buildDestinationName(
  source: string | GeocodedAddressLike | null | undefined,
): string | null {
  if (typeof source === 'string') {
    return placeNameFromText(source);
  }
  return placeNameFromAddress(source);
}

/** 住所の補助表示用文字列（`formattedAddress` 優先、無ければ構造化フィールドの連結）。 */
export function buildAddressLine(address: GeocodedAddressLike | null | undefined): string | null {
  if (!isRecord(address)) {
    return null;
  }
  const formatted = cleanText(address.formattedAddress);
  if (formatted.length > 0) {
    return formatted;
  }
  const parts = [
    cleanText(address.streetNumber),
    cleanText(address.street),
    cleanText(address.district),
    cleanText(address.city),
    cleanText(address.region),
  ].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * 場所候補を生成する（検証付き）。不正なら `null`（throw しない）。
 * 名前が空なら住所で代替し、どちらも空なら `null`。
 */
export function createPlaceCandidate(input: {
  readonly id?: string;
  readonly name?: string | null;
  readonly address?: string | null;
  readonly point: GeoPoint;
  readonly source: PlaceCandidateSource;
}): PlaceCandidate | null {
  const raw: unknown = input;
  if (!isRecord(raw)) {
    return null;
  }
  const point = raw.point;
  if (!isValidGeoPoint(point as GeoPoint)) {
    return null;
  }
  const id = cleanText(typeof raw.id === 'string' ? raw.id : '');
  if (id.length === 0) {
    return null;
  }
  const source = raw.source;
  if (source !== 'geocode' && source !== 'reverse-geocode' && source !== 'map') {
    return null;
  }
  const address = cleanText(typeof raw.address === 'string' ? raw.address : '');
  const nameSource = cleanText(typeof raw.name === 'string' ? raw.name : '');
  const name = nameSource.length > 0 ? nameSource : address;
  if (name.length === 0) {
    return null;
  }
  return {
    id,
    name: truncateName(name),
    address: address.length > 0 ? address : null,
    point: { latitude: (point as GeoPoint).latitude, longitude: (point as GeoPoint).longitude },
    source,
  };
}

// ── 共有テキストの低レベル抽出（shareLink.ts からも使う） ──────────────────

/** 共有テキストに現れる URL を抽出する（`http(s)://` と `geo:` のみ。ASCII の URL 文字）。 */
export function extractUrls(text: string): readonly string[] {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }
  const urls: string[] = [];
  const pattern = UrlPattern();
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    const url = (match[0] ?? '').replace(/[.,;:!?]+$/u, '');
    if (url.length > 0) {
      urls.push(url);
    }
    match = pattern.exec(text);
  }
  return urls;
}

/** 本文中で最初に見つかった有効な座標ペア（`35.6586, 139.7454`）。無ければ `null`。 */
export function extractCoordinatePair(text: string): GeoPoint | null {
  if (typeof text !== 'string' || text.length === 0) {
    return null;
  }
  const pattern = CoordinatePairPattern();
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    const latitude = Number(match[2]);
    const longitude = Number(match[3]);
    const point: GeoPoint = { latitude, longitude };
    if (isValidGeoPoint(point)) {
      return point;
    }
    match = pattern.exec(text);
  }
  return null;
}

// ── 内部ヘルパー ───────────────────────────────────────────────────────────

/** 抽出対象の URL パターン（状態を持たないよう毎回生成する）。 */
function UrlPattern(): RegExp {
  return /(?:https?:\/\/|geo:)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/gi;
}

/**
 * 座標ペアのパターン。group 1 = 直前の 1 文字（置換時に保持用）、2 = 緯度、3 = 経度。
 * `(?!\d|\.\d)` で「12.3.4」「139.7454.5」のような数値の一部を誤検出しない
 * （文末の「139.7454.」は許容する）。
 */
function CoordinatePairPattern(): RegExp {
  return /(^|[^\d.,])(-?\d{1,3}(?:\.\d+)?)\s*[,、，]\s*(-?\d{1,3}(?:\.\d+)?)(?!\d|\.\d)/g;
}

function placeNameFromText(text: string): string | null {
  if (typeof text !== 'string') {
    return null;
  }
  for (const line of text.split(/\r?\n/)) {
    const withoutUrls = line.replace(UrlPattern(), ' ');
    const withoutCoordinates = withoutUrls.replace(CoordinatePairPattern(), '$1');
    const candidate = cleanNameCandidate(withoutCoordinates);
    if (candidate.length > 0) {
      return truncateName(candidate);
    }
  }
  return null;
}

function placeNameFromAddress(address: GeocodedAddressLike | null | undefined): string {
  if (!isRecord(address)) {
    return FALLBACK_DESTINATION_NAME;
  }
  const name = cleanText(address.name);
  if (name.length > 0) {
    return truncateName(name);
  }
  const formatted = cleanText(address.formattedAddress);
  if (formatted.length > 0) {
    return truncateName(formatted);
  }
  const addressLine = buildAddressLine(address);
  if (addressLine !== null) {
    return truncateName(addressLine);
  }
  return FALLBACK_DESTINATION_NAME;
}

/** 名前候補の前後にある区切り記号・括弧・文末記号を落とし、空白を畳む。 */
function cleanNameCandidate(value: string): string {
  const collapsed = cleanText(value);
  return collapsed
    .replace(/^[\s,、，:：;；\-–—.。!！?？()（）\[\]【】「」『』]+/u, '')
    .replace(/[\s,、，:：;；\-–—.。!！?？()（）\[\]【】「」『』]+$/u, '')
    .trim();
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/gu, ' ').trim();
}

function truncateName(name: string): string {
  return name.length > DESTINATION_NAME_MAX_LENGTH
    ? name.slice(0, DESTINATION_NAME_MAX_LENGTH)
    : name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

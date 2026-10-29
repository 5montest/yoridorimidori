import { buildDestinationName, extractCoordinatePair, extractUrls } from './placeCandidate';
import type { GeoPoint } from './types';
import { isValidGeoPoint } from './validation';

/** 共有リンク・テキストの種類。 */
export type SharedLocationKind = 'geo-uri' | 'google-maps-url' | 'coordinates';

/**
 * 共有テキストから取り出した目的地情報（U01）。
 *
 * - `point` は座標が取れた場合のみ。短縮リンクは `null`（`needsResolution: true`）。
 * - `needsResolution` が true のとき、UI は「座標を含む形式でコピーし直してください」と案内する。
 *   **短縮リンクの URL 解決（HTTP リダイレクト）は行わない**（NFR-02: 外部通信ゼロを維持）。
 */
export interface SharedLocation {
  readonly point: GeoPoint | null;
  readonly name: string | null;
  readonly kind: SharedLocationKind;
  readonly needsResolution: boolean;
}

/** 短縮リンクのホスト（`maps.app.goo.gl`）。 */
const SHORT_MAP_LINK_PATTERN = /^(?:https?:\/\/)?maps\.app\.goo\.gl(?:\/|$)/i;

/** Google マップ URL で座標を探すクエリパラメータ（research §4.1 で確認した形式）。 */
const COORDINATE_QUERY_KEYS: readonly string[] = [
  'q',
  'query',
  'll',
  'daddr',
  'destination',
];

/**
 * 短縮リンク（`maps.app.goo.gl/...`）かどうか。前後の空白は無視する。
 * 短縮リンクは座標を持たないため、パーサは `{ point: null, needsResolution: true }` を返す。
 */
export function isShortMapLink(url: string): boolean {
  if (typeof url !== 'string') {
    return false;
  }
  const candidate = url.trim();
  if (candidate.length === 0) {
    return false;
  }
  return SHORT_MAP_LINK_PATTERN.test(candidate);
}

/**
 * 共有テキスト・クリップボード文字列・ディープリンク URL から目的地を解析する（U01）。
 *
 * 対応形式（research §4.1 / §4.3 で確定したもののみ。**短縮リンクの解決はしない**）:
 *  1. `geo:35.6586,139.7454`（`?q=lat,lon(label)`・`;z=...` などパラメータ付きも可）
 *  2. Google マップ URL の明示座標: `?q=` / `?query=` / `?ll=` / `?daddr=` / `?destination=`
 *     （値は `lat,lon` または `lat,lon(label)`。カンマは `%2C` でも可）
 *  3. 本文中の `35.6586, 139.7454`（前後の場所名テキストは name として抽出）
 *  4. 上記に該当しない短縮リンク → `{ point: null, needsResolution: true }`
 *
 * 複数の URL がある場合は、(1)(2) の座標が取れるものを優先し、無ければ短縮リンク、
 * 無ければ本文中の座標を使う。範囲外・NaN・未知形式は `null`（throw しない）。
 */
export function parseSharedLocation(text: string): SharedLocation | null {
  if (typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const urls = extractUrls(trimmed);
  const name = buildDestinationName(trimmed);

  // 1) geo: URI（明示座標）
  for (const url of urls) {
    const geo = parseGeoUri(url);
    if (geo !== null) {
      return { point: geo.point, name: geo.name ?? name, kind: 'geo-uri', needsResolution: false };
    }
  }

  // 2) Google マップ URL の明示座標
  for (const url of urls) {
    const maps = parseGoogleMapsUrl(url);
    if (maps !== null) {
      return {
        point: maps.point,
        name: maps.name ?? name,
        kind: 'google-maps-url',
        needsResolution: false,
      };
    }
  }

  // 3) 本文中の座標ペア（URL 部分を除いてから探す）
  const textWithoutUrls = removeUrls(trimmed, urls);
  const plainPoint = extractCoordinatePair(textWithoutUrls);
  if (plainPoint !== null) {
    return { point: plainPoint, name, kind: 'coordinates', needsResolution: false };
  }

  // 4) 短縮リンクのみ（座標なし。解決は行わない）
  for (const url of urls) {
    if (isShortMapLink(url)) {
      return { point: null, name, kind: 'google-maps-url', needsResolution: true };
    }
  }

  return null;
}

// ── geo: URI ───────────────────────────────────────────────────────────────

interface ParsedCoordinates {
  readonly point: GeoPoint;
  readonly name: string | null;
}

function parseGeoUri(url: string): ParsedCoordinates | null {
  if (!/^geo:/i.test(url)) {
    return null;
  }
  const body = url.slice(4); // 'geo:' を除く
  const separatorIndex = body.search(/[?;]/);
  const head = separatorIndex >= 0 ? body.slice(0, separatorIndex) : body;
  const paramsPart = separatorIndex >= 0 ? body.slice(separatorIndex + 1) : '';
  const params = parseQueryParams(paramsPart);

  // geo:lat,lon（;z=... や ?q= が続く形も先頭の座標を優先）
  const headPair = parseLatLonPair(head);
  if (headPair !== null && !(headPair.latitude === 0 && headPair.longitude === 0)) {
    return { point: headPair, name: null };
  }

  // geo:0,0?q=lat,lon(label) 形式
  const query = params.get('q');
  if (query !== undefined && query !== null) {
    const parsed = parseCoordinateValue(query);
    if (parsed !== null) {
      return parsed;
    }
  }

  // `geo:0,0` は「位置指定なし」の意味なので座標として扱わない
  return null;
}

// ── Google マップ URL ─────────────────────────────────────────────────────

function parseGoogleMapsUrl(url: string): ParsedCoordinates | null {
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }
  const { host, path, query } = splitUrl(url);
  if (!isGoogleMapsHost(host, path)) {
    return null;
  }
  const params = parseQueryParams(query);
  for (const key of COORDINATE_QUERY_KEYS) {
    const raw = params.get(key);
    if (raw === undefined || raw === null) {
      continue;
    }
    const parsed = parseCoordinateValue(raw);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

/** Google マップの URL か（`maps.google.*` か、`google.*` の `/maps` 配下）。 */
function isGoogleMapsHost(host: string, path: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized.startsWith('maps.')) {
    return /(^|\.)google\.[a-z.]+$/i.test(normalized);
  }
  return /^(?:www\.)?google\.[a-z.]+$/i.test(normalized) && path.toLowerCase().startsWith('/maps');
}

/** `?a=b&c=d` / `;z=15` 形式のパラメータを Map にする（値はデコード済み）。 */
function parseQueryParams(query: string): ReadonlyMap<string, string> {
  const params = new Map<string, string>();
  if (typeof query !== 'string' || query.length === 0) {
    return params;
  }
  for (const chunk of query.split(/[&;]/)) {
    const separatorIndex = chunk.indexOf('=');
    const rawKey = separatorIndex >= 0 ? chunk.slice(0, separatorIndex) : chunk;
    const rawValue = separatorIndex >= 0 ? chunk.slice(separatorIndex + 1) : '';
    const key = safeDecode(rawKey).trim();
    if (key.length === 0) {
      continue;
    }
    params.set(key, safeDecode(rawValue).replace(/\+/g, ' ').trim());
  }
  return params;
}

// ── 座標値の解析 ───────────────────────────────────────────────────────────

/**
 * `lat,lon` / `lat,lon(label)` / `lat, lon` を解析する。
 * 範囲外・NaN は `null`。カンマは `,`・`、`・`，` を許容する（本文の日本語テキスト対策）。
 */
function parseCoordinateValue(value: string): ParsedCoordinates | null {
  const decoded = safeDecode(value).replace(/\+/g, ' ').trim();
  if (decoded.length === 0) {
    return null;
  }
  let coordinatesPart = decoded;
  let name: string | null = null;
  const labelStart = decoded.lastIndexOf('(');
  if (labelStart > 0 && decoded.endsWith(')')) {
    const label = decoded.slice(labelStart + 1, decoded.length - 1).trim();
    coordinatesPart = decoded.slice(0, labelStart);
    name = label.length > 0 ? label : null;
  }
  const point = parseLatLonPair(coordinatesPart);
  return point === null ? null : { point, name };
}

/** `lat,lon` の 2 値を範囲検証して返す。 */
function parseLatLonPair(value: string): GeoPoint | null {
  const match = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,、，]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(value);
  if (match === null) {
    return null;
  }
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  const point: GeoPoint = { latitude, longitude };
  return isValidGeoPoint(point) ? point : null;
}

/** URL をホスト・パス・クエリに分解する（`URL` を使わない純粋実装）。 */
function splitUrl(url: string): { readonly host: string; readonly path: string; readonly query: string } {
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const hashIndex = withoutScheme.indexOf('#');
  const hashLess = hashIndex >= 0 ? withoutScheme.slice(0, hashIndex) : withoutScheme;
  const queryIndex = hashLess.indexOf('?');
  const beforeQuery = queryIndex >= 0 ? hashLess.slice(0, queryIndex) : hashLess;
  const query = queryIndex >= 0 ? hashLess.slice(queryIndex + 1) : '';
  const slashIndex = beforeQuery.indexOf('/');
  const authority = slashIndex >= 0 ? beforeQuery.slice(0, slashIndex) : beforeQuery;
  const path = slashIndex >= 0 ? beforeQuery.slice(slashIndex) : '/';
  const host = authority.replace(/^.*@/u, '').replace(/:\d+$/u, '');
  return { host, path, query };
}

/** URL 文字列から URL 部分を取り除く（本文中の座標探索用）。 */
function removeUrls(text: string, urls: readonly string[]): string {
  let result = text;
  for (const url of urls) {
    result = result.split(url).join(' ');
  }
  return result;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // 不正なパーセントエンコーディングはそのまま扱う（throw しない）
  }
}

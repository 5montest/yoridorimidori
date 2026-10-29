import { extractUrls } from '../../domain/placeCandidate';
import {
  extractGoogleMapsPathCoordinates,
  isShortMapLink,
  parseSharedLocation,
} from '../../domain/shareLink';
import type { GeoPoint } from '../../domain/types';

/** 共有テキストから解決した目的地。 */
export interface ResolvedSharedDestination {
  readonly point: GeoPoint;
  readonly name: string | null;
}

/** `fetch` の最小契約（テストで差し替え可能にする）。 */
export interface FetchResponseLike {
  readonly url: string;
  /** HTML 本文（取得できない実装でもよい）。 */
  readonly text?: () => Promise<string>;
}

export type FetchLike = (
  input: string,
  init?: { readonly method?: string; readonly redirect?: 'follow' | 'manual' | 'error' },
) => Promise<FetchResponseLike>;

/**
 * 短縮リンク・地図 URL の応答から座標を抽出するパターン。
 *
 * Google マップの共有 URL は非公式形式で、展開先の HTML に座標が埋まっていることが多い。
 * 代表的な形式を優先順に試す（`!3d/!4d` は地点座標、`@` は地図中心）。
 */
const COORDINATE_PATTERNS: readonly RegExp[] = [
  /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/u,
  /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/u,
  /"latitude":\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*"longitude":\s*(-?\d{1,3}(?:\.\d+)?)/u,
  /[?&](?:ll|center|q|destination|daddr)=(-?\d{1,3}(?:\.\d+)?)(?:,|%2C)(-?\d{1,3}(?:\.\d+)?)/iu,
  /center=(-?\d{1,3}(?:\.\d+)?)%2C(-?\d{1,3}(?:\.\d+)?)/iu,
];

/** テキスト（URL や HTML）から座標を抽出する。 */
export function extractCoordinatesFromText(text: string): GeoPoint | null {
  if (typeof text !== 'string' || text.length === 0) {
    return null;
  }
  for (const pattern of COORDINATE_PATTERNS) {
    const match = pattern.exec(text);
    if (match === null) {
      continue;
    }
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      continue;
    }
    if (latitude === 0 && longitude === 0) {
      continue;
    }
    return { latitude, longitude };
  }
  return null;
}

/** 共有テキスト中で「展開を試す価値のある URL」を選ぶ（短縮リンク優先）。 */
function pickMapUrl(text: string): string | null {
  const urls = extractUrls(text);
  const shortUrl = urls.find((url) => isShortMapLink(url));
  if (shortUrl !== undefined) {
    return shortUrl;
  }
  const mapsUrl = urls.find((url) => /google\.[a-z.]+\/maps|maps\.google\./iu.test(url));
  return mapsUrl ?? null;
}

/**
 * 共有テキストから場所名を取り出す（URL を除いた残り）。
 *
 * Google マップの共有本文は「場所名 + 短縮リンク」の形式のため、URL を除いた部分を名前にする。
 */
export function extractNameFromSharedText(text: string): string | null {
  if (typeof text !== 'string') {
    return null;
  }
  const withoutUrls = text
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (withoutUrls.length === 0) {
    return null;
  }
  return withoutUrls.length > 50 ? withoutUrls.slice(0, 50) : withoutUrls;
}
/**
 * 展開先 HTML から場所名を取り出す（`og:title` → `<title>` の順）。
 *
 * Google マップの共有は `EXTRA_TEXT` に URL しか入らないことが多いため、
 * 短縮リンクを展開した地点ページのタイトルを目的地名として使う。
 * 「 - Google マップ」「 - Google Maps」等の接尾辞は取り除く。
 */
export function extractTitleFromHtml(html: string): string | null {
  if (typeof html !== 'string' || html.length === 0) {
    return null;
  }
  const ogTitle = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/iu.exec(html)
    ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/iu.exec(html);
  const rawTitle = ogTitle?.[1] ?? /<title[^>]*>([^<]+)<\/title>/iu.exec(html)?.[1] ?? null;
  if (rawTitle === null) {
    return null;
  }
  const decoded = rawTitle
    .replace(/&amp;/gu, '&')
    .replace(/&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>');
  const cleaned = decoded
    .replace(/\s*[-|·]\s*Google\s*(マップ|Maps).*$/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.length > 50 ? cleaned.slice(0, 50) : cleaned;
}
/**
 * 「Google マップ」「Google Maps」等の汎用タイトルか（目的地名として使わない）。
 */
export function isGenericMapTitle(name: string | null): boolean {
  if (name === null) {
    return true;
  }
  const normalized = name.replace(/\s+/gu, ' ').trim();
  return (
    normalized.length === 0 ||
    /^(google\s*(maps|マップ)|google|maps|地図|マップ)$/iu.test(normalized)
  );
}

/** 目的地名として使える名前だけを返す（汎用名・空は null）。 */
export function sanitizeDestinationName(name: string | null | undefined): string | null {
  if (name === null || name === undefined) {
    return null;
  }
  const trimmed = name.replace(/\s+/gu, ' ').trim();
  if (isGenericMapTitle(trimmed)) {
    return null;
  }
  return trimmed.length > 50 ? trimmed.slice(0, 50) : trimmed;
}

/**
 * 共有されたテキスト（Google マップの共有本文など）から目的地を解決する（FR-16 / FR-17）。
 *
 * - まず `parseSharedLocation` で座標・geo URI・座標入り URL を解析する（オフラインで完結）。
 * - 座標が無い地図 URL（短縮リンク `maps.app.goo.gl` や地点 URL）は **HTTP で取得**し、
 *   リダイレクト先 URL・HTML 本文から座標を抽出する。ユーザー操作（共有）起点の例外通信（NFR-02 の例外）。
 * - 解決できない場合・通信失敗は `null`（throw しない）。
 */
export async function resolveSharedText(
  text: string,
  fetchImpl?: FetchLike,
  nameHint?: string | null,
): Promise<ResolvedSharedDestination | null> {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  const parsed = parseSharedLocation(text);
  const name =
    sanitizeDestinationName(parsed?.name) ??
    sanitizeDestinationName(extractNameFromSharedText(text)) ??
    sanitizeDestinationName(nameHint);
  if (parsed !== null && parsed.point !== null) {
    return { point: parsed.point, name };
  }

  const url = pickMapUrl(text);
  if (url === null) {
    return null;
  }

  const doFetch: FetchLike | null =
    fetchImpl ??
    (typeof fetch === 'function'
      ? (input, init) => fetch(input, init) as unknown as Promise<FetchResponseLike>
      : null);
  if (doFetch === null) {
    return null;
  }

  try {
    const response = await doFetch(url, { method: 'GET', redirect: 'follow' });

    // 1) リダイレクト先 URL（RN の fetch は最終 URL を返さないことがあるため、あれば使う）
    const fromFinalUrl = parseSharedLocation(response.url)?.point ?? null;
    if (fromFinalUrl !== null) {
      return { point: fromFinalUrl, name };
    }
    const fromFinalPath = extractGoogleMapsPathCoordinates(response.url);
    if (fromFinalPath !== null) {
      return { point: fromFinalPath, name };
    }

    // 2) HTML 本文から座標を抽出（Google マップの地点ページ等）
    if (typeof response.text === 'function') {
      const body = await response.text();
      const fromBody = extractCoordinatesFromText(body);
      if (fromBody !== null) {
        return { point: fromBody, name: name ?? sanitizeDestinationName(extractTitleFromHtml(body)) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

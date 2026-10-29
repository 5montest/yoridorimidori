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
export type FetchLike = (
  input: string,
  init?: { readonly method?: string; readonly redirect?: 'follow' | 'manual' | 'error' },
) => Promise<{ readonly url: string }>;

/**
 * 共有されたテキスト（Google マップの共有本文など）から目的地を解決する（FR-16 / FR-17）。
 *
 * - まず `parseSharedLocation` で座標・geo URI・座標入り URL を解析する（オフラインで完結）。
 * - 短縮リンク（`maps.app.goo.gl` 等）のみの場合は、**HTTP リダイレクトを辿って**展開先 URL から座標を解析する。
 *   これはユーザー操作（共有）起点の例外通信であり、通常のナビ動作はオフラインのまま（NFR-02 の例外）。
 * - 解決できない場合・通信失敗は `null`（throw しない）。
 */
export async function resolveSharedText(
  text: string,
  fetchImpl?: FetchLike,
): Promise<ResolvedSharedDestination | null> {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  const parsed = parseSharedLocation(text);
  if (parsed === null) {
    return null;
  }
  if (parsed.point !== null) {
    return { point: parsed.point, name: parsed.name };
  }
  if (!parsed.needsResolution) {
    return null;
  }

  const shortUrl = extractUrls(text).find((candidate) => isShortMapLink(candidate));
  if (shortUrl === undefined) {
    return null;
  }

  const doFetch: FetchLike | null =
    fetchImpl ??
    (typeof fetch === 'function'
      ? (input, init) => fetch(input, init) as Promise<{ readonly url: string }>
      : null);
  if (doFetch === null) {
    return null;
  }

  try {
    const response = await doFetch(shortUrl, { method: 'GET', redirect: 'follow' });
    const finalUrl = typeof response.url === 'string' && response.url.length > 0 ? response.url : shortUrl;
    const resolved = parseSharedLocation(finalUrl);
    if (resolved !== null && resolved.point !== null) {
      return { point: resolved.point, name: parsed.name ?? resolved.name };
    }
    // 展開先 URL が `/@lat,lng` 形式のみでも座標を救済する（地図中心）。
    const pathPoint = extractGoogleMapsPathCoordinates(finalUrl);
    if (pathPoint !== null) {
      return { point: pathPoint, name: parsed.name };
    }
  } catch {
    return null;
  }
  return null;
}

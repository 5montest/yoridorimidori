import { formatDistanceM } from './format';

/** バックグラウンド案内の通知タイトル（アプリ名）。 */
export const GUIDANCE_NOTIFICATION_TITLE = '寄鳥美鳥地';

/** 通知本文の材料。 */
export interface GuidanceNotificationInput {
  /** 選択中の目的地名（未選択なら `null`）。 */
  readonly destinationName: string | null;
  /** 目的地までの距離（m）。不明なら `null`。 */
  readonly distanceM: number | null;
}

/** 通知に出す本文。 */
export interface GuidanceNotificationContent {
  readonly title: string;
  readonly body: string;
}

/**
 * バックグラウンド案内の通知本文を作る（純粋関数）。
 *
 * - 目的地名と距離が分かるとき: `目的地「東京駅」まで 1.20 km`
 * - 距離だけ分かるとき: `目的地まで 1.20 km`
 * - 目的地名だけ分かるとき: `目的地「東京駅」へ案内中`
 * - どちらも無いとき: `案内中`
 */
export function buildGuidanceNotificationBody(input: GuidanceNotificationInput): string {
  const trimmedName = input.destinationName?.trim() ?? '';
  const hasName = trimmedName.length > 0;
  const distance = input.distanceM;

  if (distance === null || !Number.isFinite(distance) || distance < 0) {
    return hasName ? `目的地「${trimmedName}」へ案内中` : '案内中';
  }
  const distanceText = formatDistanceM(distance);
  return hasName ? `目的地「${trimmedName}」まで ${distanceText}` : `目的地まで ${distanceText}`;
}

/** 通知タイトルと本文をまとめて作る。 */
export function buildGuidanceNotification(
  input: GuidanceNotificationInput,
): GuidanceNotificationContent {
  return {
    title: GUIDANCE_NOTIFICATION_TITLE,
    body: buildGuidanceNotificationBody(input),
  };
}

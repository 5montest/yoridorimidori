import type { Destination } from './types';

/**
 * デモ用プリセット目的地（§10.6 / D-07）。
 *
 * - 座標は**デモ用の概値**（厳密な駅代表点ではない）。実在駅の距離はテストで範囲検証する。
 * - `createdAtEpochMs` は保存側が付与するため、定義データでは `0`（未保存）とする。
 * - `id` は投入時に採番し直してよい（一意性の目印として定義だけ持つ）。
 * - `favorite` は既定 false・`lastUsedAtEpochMs` は未使用のため null。
 */
export const DEMO_PRESETS: readonly Destination[] = [
  {
    id: 'preset-tokyo-station',
    name: '東京駅',
    point: { latitude: 35.681236, longitude: 139.767125 },
    createdAtEpochMs: 0,
    origin: 'preset',
    favorite: false,
    lastUsedAtEpochMs: null,
  },
  {
    id: 'preset-shinjuku-station',
    name: '新宿駅',
    point: { latitude: 35.689592, longitude: 139.700413 },
    createdAtEpochMs: 0,
    origin: 'preset',
    favorite: false,
    lastUsedAtEpochMs: null,
  },
  {
    id: 'preset-tokyo-tower',
    name: '東京タワー',
    point: { latitude: 35.658581, longitude: 139.745433 },
    createdAtEpochMs: 0,
    origin: 'preset',
    favorite: false,
    lastUsedAtEpochMs: null,
  },
];

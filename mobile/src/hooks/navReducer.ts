import type { ScenarioId } from '../domain/scenario';
import { ringPush, ringTrim } from '../domain/ringBuffer';
import type {
  Destination,
  HeadingFix,
  SampleLogEntry,
  SensorFix,
} from '../domain/types';
import type { PermissionOutcome, ProviderError } from '../ports/common';
import type { NavAppState } from './navState';

/** 保持するエラーの最大件数。§7.2。 */
export const MAX_ERRORS = 10;
/** 保持する保存警告の最大件数（UI は控えめに表示するため上限を設ける）。 */
export const MAX_STORAGE_WARNINGS = 20;

/** リデューサが受け付けるアクション。§7.2。 */
export type NavAction =
  | {
      readonly type: 'boot/completed';
      readonly destinations: readonly Destination[];
      readonly selectedDestinationId: string | null;
      readonly nowMonotonicMs: number;
    }
  | { readonly type: 'permission/changed'; readonly permission: PermissionOutcome }
  | { readonly type: 'sensor/location'; readonly fix: SensorFix }
  | { readonly type: 'sensor/heading'; readonly fix: HeadingFix }
  | { readonly type: 'sensor/reset' }
  | { readonly type: 'heading/unavailable' }
  | { readonly type: 'provider/error'; readonly error: ProviderError }
  | { readonly type: 'tick'; readonly nowMonotonicMs: number }
  | { readonly type: 'destination/selected'; readonly id: string | null }
  | { readonly type: 'destination/added'; readonly destination: Destination; readonly select: boolean }
  | { readonly type: 'destination/updated'; readonly destination: Destination }
  | { readonly type: 'destination/removed'; readonly id: string }
  | { readonly type: 'destinations/replaced'; readonly destinations: readonly Destination[] }
  | { readonly type: 'samples/loaded'; readonly samples: readonly SampleLogEntry[] }
  | { readonly type: 'samples/appended'; readonly entry: SampleLogEntry }
  | { readonly type: 'mock/toggled'; readonly enabled: boolean }
  | { readonly type: 'mock/scenario'; readonly scenarioId: ScenarioId | null }
  | { readonly type: 'storage/warning'; readonly message: string }
  | { readonly type: 'errors/cleared' };

/**
 * 純粋リデューサ。§7.2。
 *
 * - `Date.now()` / `Math.random()` / ストレージ呼び出しを一切しない。
 * - 元の state を変更せず、常に新しいオブジェクトを返す（同じ入力には同じ出力）。
 * - `sensor/location` の `nowMonotonicMs` は `Math.max` で単調性を保証する
 *   （未来の tick 値で過去のフィックス受信時刻を上書きしない）。
 * - `mock/toggled` は `sensor/reset` 相当（古い位置・方位の破棄）も同時に行う。
 */
export function navReducer(state: NavAppState, action: NavAction): NavAppState {
  switch (action.type) {
    case 'boot/completed':
      return {
        ...state,
        booted: true,
        destinations: action.destinations,
        selectedDestinationId: action.selectedDestinationId,
        nowMonotonicMs: Math.max(state.nowMonotonicMs, action.nowMonotonicMs),
      };

    case 'permission/changed':
      return { ...state, permission: action.permission };

    case 'sensor/location':
      return {
        ...state,
        location: action.fix,
        nowMonotonicMs: Math.max(state.nowMonotonicMs, action.fix.receivedAtMonotonicMs),
      };

    case 'sensor/heading':
      return { ...state, heading: action.fix };

    case 'sensor/reset':
      return { ...state, location: null, heading: null };

    case 'heading/unavailable':
      return { ...state, headingUnavailable: true };

    case 'provider/error':
      return { ...state, errors: appendError(state.errors, action.error) };

    case 'tick':
      return {
        ...state,
        nowMonotonicMs: Math.max(state.nowMonotonicMs, action.nowMonotonicMs),
      };

    case 'destination/selected':
      return { ...state, selectedDestinationId: action.id };

    case 'destination/added':
      return {
        ...state,
        destinations: [...state.destinations, action.destination],
        selectedDestinationId: action.select
          ? action.destination.id
          : state.selectedDestinationId,
      };

    case 'destination/updated':
      return {
        ...state,
        destinations: state.destinations.map((destination) =>
          destination.id === action.destination.id ? action.destination : destination,
        ),
      };

    case 'destination/removed': {
      const destinations = state.destinations.filter(
        (destination) => destination.id !== action.id,
      );
      return {
        ...state,
        destinations,
        selectedDestinationId:
          state.selectedDestinationId === action.id ? null : state.selectedDestinationId,
      };
    }

    case 'destinations/replaced': {
      const selectionExists =
        state.selectedDestinationId !== null &&
        action.destinations.some(
          (destination) => destination.id === state.selectedDestinationId,
        );
      return {
        ...state,
        destinations: action.destinations,
        selectedDestinationId: selectionExists ? state.selectedDestinationId : null,
      };
    }

    case 'samples/loaded':
      return {
        ...state,
        samples: ringTrim(action.samples, state.thresholds.sampleLogCapacity),
      };

    case 'samples/appended':
      return {
        ...state,
        samples: ringPush(state.samples, action.entry, state.thresholds.sampleLogCapacity),
      };

    case 'mock/toggled':
      return {
        ...state,
        mockMode: action.enabled,
        // プロバイダ切替時は古いセンサー値を破棄する（§7.2 / §11.5）。
        location: null,
        heading: null,
        headingUnavailable: false,
        scenarioId: action.enabled ? state.scenarioId : null,
      };

    case 'mock/scenario':
      return { ...state, scenarioId: action.scenarioId };

    case 'storage/warning':
      return {
        ...state,
        storageWarnings: [...state.storageWarnings, action.message].slice(
          -MAX_STORAGE_WARNINGS,
        ),
      };

    case 'errors/cleared':
      return { ...state, errors: [] };

    default:
      // 網羅性チェック（全アクションを処理済み）。未知のアクションでは状態を変えない。
      return state;
  }
}

/**
 * エラーを新しい順に追加する。§7.2。
 *
 * - 直近と同一 `code` が連続する場合は置き換える（スパム防止）。
 * - 上限 `MAX_ERRORS` 件を超えた古いものは捨てる。
 */
function appendError(
  errors: readonly ProviderError[],
  error: ProviderError,
): readonly ProviderError[] {
  const latest = errors[0];
  if (latest !== undefined && latest.code === error.code) {
    return [error, ...errors.slice(1)];
  }
  return [error, ...errors].slice(0, MAX_ERRORS);
}

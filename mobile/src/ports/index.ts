// ports の再 export。hooks / adapters / App はここ経由で契約を参照する。
// 注意: ./mockSensor は T11（ScenarioId 作成後）に追記する（tasks.md T01 / 0.3-2）。

export type {
  PermissionOutcome,
  ProviderError,
  ProviderErrorCode,
  Unsubscribe,
} from './common';
export type { DestinationRepository } from './destinationRepository';
export type { HeadingProvider } from './heading';
export type { LocationProvider } from './location';
export type { SampleLogRepository } from './sampleLogRepository';
export type { Clock } from './clock';

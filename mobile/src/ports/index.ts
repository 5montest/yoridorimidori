// ports の再 export。hooks / adapters / App はここ経由で契約を参照する。

export type {
  PermissionOutcome,
  ProviderError,
  ProviderErrorCode,
  Unsubscribe,
} from './common';
export type { ClipboardProvider } from './clipboard';
export type { DeepLinkProvider } from './deepLink';
export type { DestinationRepository } from './destinationRepository';
export type { HeadingProvider } from './heading';
export type { LocationProvider } from './location';
export type { MockMode, MockSensorController, MockSensorSnapshot } from './mockSensor';
export type { PlaceCandidate, PlaceCandidateSource, PlaceSearchProvider } from './placeSearch';
export type { PreferencesRepository } from './preferences';
export type { SampleLogRepository } from './sampleLogRepository';
export type { Clock } from './clock';

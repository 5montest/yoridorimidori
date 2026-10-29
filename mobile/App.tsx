import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';
import { SystemClock } from './src/adapters/clock/SystemClock';
import { ExpoClipboardProvider } from './src/adapters/expo/ExpoClipboardProvider';
import { ExpoHeadingProvider } from './src/adapters/expo/ExpoHeadingProvider';
import { ExpoLinkingProvider } from './src/adapters/expo/ExpoLinkingProvider';
import { ExpoLocationProvider } from './src/adapters/expo/ExpoLocationProvider';
import { ExpoPlaceSearchProvider } from './src/adapters/expo/ExpoPlaceSearchProvider';
import { MockHeadingProvider } from './src/adapters/mock/MockHeadingProvider';
import { MockLocationProvider } from './src/adapters/mock/MockLocationProvider';
import { MockSensorControllerImpl } from './src/adapters/mock/MockSensorControllerImpl';
import { startMockTicker } from './src/adapters/mock/mockTicker';
import { AsyncStorageDestinationRepository } from './src/adapters/storage/AsyncStorageDestinationRepository';
import { AsyncStoragePreferencesRepository } from './src/adapters/storage/AsyncStoragePreferencesRepository';
import { AsyncStorageSampleLogRepository } from './src/adapters/storage/AsyncStorageSampleLogRepository';
import { DEFAULT_THRESHOLDS } from './src/domain/constants';
import { filterFavorites, recentDestinations } from './src/domain/destinationOrder';
import type { DestinationInput } from './src/domain/types';
import {
  resolveSharedText,
  type ResolvedSharedDestination,
} from './src/adapters/network/SharedTextResolver';
import { useDestinationPicker } from './src/hooks/useDestinationPicker';
import { useShareIntentBridge } from './src/hooks/useShareIntentBridge';
import { selectSelectedDestination } from './src/hooks/selectors';
import { useNavApp, type NavAppDeps } from './src/hooks/useNavApp';
import type { ClipboardProvider } from './src/ports/clipboard';
import type { DeepLinkProvider } from './src/ports/deepLink';
import type { MockSensorController } from './src/ports/mockSensor';
import type { PlaceSearchProvider } from './src/ports/placeSearch';
import type { PreferencesRepository } from './src/ports/preferences';
import { ErrorBoundary } from './src/ui/components/ErrorBoundary';
import { ScreenSwitcher } from './src/ui/components/ScreenSwitcher';
import { SharedDestinationSheet } from './src/ui/components/SharedDestinationSheet';
import {
  UI_TEXT,
  type ScreenId,
  type SearchStatus,
  type ShareLinkState,
} from './src/ui/labels';
import { DestinationAddScreen } from './src/ui/screens/DestinationAddScreen';
import { DestinationPickerScreen } from './src/ui/screens/DestinationPickerScreen';
import { DevLogScreen } from './src/ui/screens/DevLogScreen';
import { MainScreen } from './src/ui/screens/MainScreen';
import { MapScreen } from './src/ui/screens/MapScreen';
import { OnboardingScreen } from './src/ui/screens/OnboardingScreen';
import { SearchResultsScreen } from './src/ui/screens/SearchResultsScreen';
import { COLORS, statusBarTopInset } from './src/ui/theme';

/** Mock センサーを駆動するティッカーの間隔（ms）。実センサーの更新頻度に合わせる。 */
const MOCK_TICKER_INTERVAL_MS = 100;

/** 目的地 ID の連番（モジュール内でのみ使用。一意性のためのカウンタ）。 */
let destinationIdSequence = 0;

/**
 * 目的地 ID 生成。`Date.now()` は**ID の一意性のためだけ**に使い、鮮度計算には使わない
 * （鮮度は `Clock.nowMonotonicMs()` の差分のみ。付録C-5）。
 */
function createDestinationIdFactory(): () => string {
  return () => {
    destinationIdSequence += 1;
    return `dest-${Date.now()}-${destinationIdSequence}`;
  };
}

/** 実アダプタ一式（App だけが具体型を知る）。 */
interface AppRuntime {
  readonly deps: NavAppDeps;
  readonly controller: MockSensorController;
  /** 目的地設定 UX（U03 アダプタ）。 */
  readonly placeSearch: PlaceSearchProvider;
  readonly clipboard: ClipboardProvider;
  readonly deepLink: DeepLinkProvider;
  /**
   * オンボーディング表示履歴（U03 アダプタ追加後に注入）。
   * `null` の間はオンボーディングをスキップする（表示制御は App の責務）。
   */
  readonly preferences: PreferencesRepository | null;
}

/**
 * 具象実装を生成する（**この関数が唯一の生成場所**）。
 *
 * - 実センサー（Expo）と Mock プロバイダの両方を生成し、`useNavApp` にポートとして注入する。
 * - 目的地設定用の検索・クリップボード・ディープリンクもここで生成して
 *   `useDestinationPicker` に注入する（`ui/` は具体型を知らない）。
 * - Mock コントローラは開発メニューへ直接渡す（`useNavApp` には渡さない＝§7.4）。
 */
function createRuntime(): AppRuntime {
  const clock = new SystemClock();
  const controller = new MockSensorControllerImpl();

  const locationProvider = new ExpoLocationProvider({ clock });
  const headingProvider = new ExpoHeadingProvider({ clock });
  const mockLocationProvider = new MockLocationProvider(controller, clock);
  const mockHeadingProvider = new MockHeadingProvider(controller, clock);

  const destinationRepository = new AsyncStorageDestinationRepository(
    clock,
    createDestinationIdFactory(),
  );
  const sampleLogRepository = new AsyncStorageSampleLogRepository(clock);

  const placeSearch = new ExpoPlaceSearchProvider({ clock });
  const clipboard = new ExpoClipboardProvider({ clock });
  const deepLink = new ExpoLinkingProvider({ clock });
  const preferences = new AsyncStoragePreferencesRepository();

  const deps: NavAppDeps = {
    clock,
    locationProvider,
    headingProvider,
    mockLocationProvider,
    mockHeadingProvider,
    destinationRepository,
    sampleLogRepository,
    thresholds: DEFAULT_THRESHOLDS,
    devToolsVisible: __DEV__,
  };

  return {
    deps,
    controller,
    placeSearch,
    clipboard,
    deepLink,
    preferences,
  };
}

/** `useDestinationPicker` の検索状態 → UI の表示状態。`pending`（debounce 待ち）は loading。 */
function toUiSearchStatus(status: string): SearchStatus {
  switch (status) {
    case 'loading':
    case 'pending':
      return 'loading';
    case 'success':
      return 'success';
    case 'empty':
      return 'empty';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

interface ShareStateInput {
  readonly clipboardStatus: 'idle' | 'checking' | 'none';
  readonly pendingSource: 'clipboard' | 'deep-link' | null;
  readonly bannerKind: 'ready' | 'needs-resolution' | null;
}

/** クリップボード取り込みの状態 → S3 の表示状態。 */
function toShareLinkState(input: ShareStateInput): ShareLinkState {
  if (input.clipboardStatus === 'checking') {
    return 'reading';
  }
  if (input.pendingSource === 'clipboard') {
    return input.bannerKind === 'needs-resolution' ? 'needs-resolution' : 'ready';
  }
  if (input.clipboardStatus === 'none') {
    return 'no-url';
  }
  return 'idle';
}

/**
 * アプリのコンポジションルート。§2.4 / §7.5 / §11.2 / U13。
 *
 * - 責務は**生成と注入だけ**。具体実装を生成して `useNavApp` / `useDestinationPicker` に注入し、
 *   画面へ props を渡す。計算・判定ロジックは書かない。
 * - 画面遷移は `useState<ScreenId>`（ADR-07。`react-navigation` は使わない）。
 * - 開発メニュー（S7）はタイトル長押しの隠し導線（UX-6）。座標入力はそこからのみ到達する。
 */
export default function App(): ReactElement {
  const [screen, setScreen] = useState<ScreenId>('main');
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const runtime = useMemo(createRuntime, []);
  const { state, nav, actions } = useNavApp(runtime.deps);
  const selectedDestination = selectSelectedDestination(state);
  const devToolsVisible = state.devToolsVisible;
  // ステータスバー（時刻・バッテリー）との重なりを避ける。safe-area-context は追加しない。
  const statusBarPaddingTop = statusBarTopInset(NativeStatusBar.currentHeight);

  // 目的地選択（S3〜S5）のオーケストレーション（検索/クリップボード/ディープリンク/地図）。
  const recent = useMemo(() => recentDestinations(state.destinations), [state.destinations]);
  const favorites = useMemo(() => filterFavorites(state.destinations), [state.destinations]);

  const confirmDestination = useCallback(
    (input: DestinationInput) => {
      void (async () => {
        const saved = await actions.addDestination(input, { select: true });
        if (saved) {
          setScreen('main');
        }
      })();
    },
    [actions],
  );

  const toggleFavoriteById = useCallback(
    (id: string) => {
      const target = state.destinations.find((destination) => destination.id === id);
      if (target !== undefined) {
        void actions.setFavorite(id, !target.favorite);
      }
    },
    [actions, state.destinations],
  );

  const picker = useDestinationPicker({
    placeSearch: runtime.placeSearch,
    clipboard: runtime.clipboard,
    deepLink: runtime.deepLink,
    recent,
    favorites,
    currentPoint: state.location?.point ?? null,
    fallbackName: UI_TEXT.destinationPicker.fallbackName,
    onConfirm: confirmDestination,
    onToggleFavorite: toggleFavoriteById,
  });

  // 共有インテント（FR-17）: 他アプリ（Google マップ等）から共有された地点を目的地にする。
  // Expo Go では無効（payload は常に null）。APK / development build でのみ受信する。
  const shareIntent = useShareIntentBridge();
  const sharedText = shareIntent.payload?.text ?? null;
  const [incomingShared, setIncomingShared] = useState<{
    readonly kind: 'ready' | 'needs-resolution';
    readonly destination: ResolvedSharedDestination | null;
  } | null>(null);

  useEffect(() => {
    if (sharedText === null) {
      return undefined;
    }
    const titleHint = shareIntent.payload?.title ?? null;
    let disposed = false;
    void (async () => {
      const resolved = await resolveSharedText(sharedText, undefined, titleHint);
      if (disposed) {
        return;
      }
      if (resolved === null && __DEV__) {
        // 実機検証用: 解決できなかった共有内容を logcat に残す。
        console.log('[share-intent] unresolved:', sharedText);
      }
      setIncomingShared(
        resolved === null
          ? { kind: 'needs-resolution', destination: null }
          : { kind: 'ready', destination: resolved },
      );
      shareIntent.clear();
    })();
    return () => {
      disposed = true;
    };
  }, [sharedText, shareIntent]);

  // 初回起動のオンボーディング（S1）。表示済みフラグは PreferencesRepository（U03 アダプタ待ち）。
  useEffect(() => {
    const preferences = runtime.preferences;
    if (preferences === null) {
      setOnboardingChecked(true);
      return undefined;
    }
    let disposed = false;
    void preferences
      .getOnboardingSeen()
      .then((seen) => {
        if (!disposed) {
          setOnboardingVisible(!seen);
          setOnboardingChecked(true);
        }
      })
      .catch(() => {
        if (!disposed) {
          setOnboardingVisible(false);
          setOnboardingChecked(true);
        }
      });
    return () => {
      disposed = true;
    };
  }, [runtime.preferences]);

  const finishOnboarding = useCallback((): void => {
    setOnboardingVisible(false);
    const preferences = runtime.preferences;
    if (preferences !== null) {
      void preferences.setOnboardingSeen(true).catch(() => undefined);
    }
  }, [runtime.preferences]);

  const resetOnboarding = useMemo<(() => void) | undefined>(() => {
    const preferences = runtime.preferences;
    if (preferences === null) {
      return undefined;
    }
    return () => {
      void preferences.setOnboardingSeen(false).catch(() => undefined);
      setOnboardingVisible(true);
      setScreen('main');
    };
  }, [runtime.preferences]);

  // Mock モードの間だけ Mock センサーの時計を進める（開発ビルドのみ有効）。
  useEffect(() => {
    if (!state.mockMode) {
      return undefined;
    }
    return startMockTicker(runtime.controller, MOCK_TICKER_INTERVAL_MS);
  }, [state.mockMode, runtime.controller]);

  let content: ReactElement;
  if (screen === 'destinations') {
    const shareLinkState = toShareLinkState({
      clipboardStatus: picker.state.clipboardStatus,
      pendingSource: picker.state.pendingShared?.source ?? null,
      bannerKind: picker.derived.sharedBannerKind,
    });
    content = (
      <DestinationPickerScreen
        searchQuery={picker.state.query}
        onSubmitSearch={(query) => {
          picker.actions.setQuery(query);
          setScreen('search');
        }}
        currentLocationAvailable={
          state.location !== null && nav.locationFreshness !== 'lost'
        }
        currentLocationLost={nav.locationFreshness === 'lost'}
        onUseCurrentLocation={() => {
          void (async () => {
            const saved = await actions.useCurrentLocationAsDestination('');
            if (saved) {
              setScreen('main');
            }
          })();
        }}
        onOpenMapPick={() => {
          picker.actions.clearMapPoint();
          setScreen('map');
        }}
        recent={recent.map((destination) => ({
          id: destination.id,
          name: destination.name,
        }))}
        favorites={favorites.map((destination) => ({
          id: destination.id,
          name: destination.name,
        }))}
        onSelectRecent={(id) => {
          actions.selectDestination(id);
          setScreen('main');
        }}
        onSelectFavorite={(id) => {
          actions.selectDestination(id);
          setScreen('main');
        }}
        shareLinkState={shareLinkState}
        onImportShareLink={() => {
          void picker.actions.checkClipboard();
        }}
        onConfirmShared={picker.actions.confirmShared}
        onDismissShared={picker.actions.dismissShared}
        onBack={() => setScreen('main')}
      />
    );
  } else if (screen === 'search') {
    content = (
      <SearchResultsScreen
        query={picker.state.query}
        status={toUiSearchStatus(picker.state.searchStatus)}
        results={picker.state.results.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          address: candidate.address,
        }))}
        errorMessage={null}
        onSelect={(id) => {
          const candidate = picker.state.results.find((item) => item.id === id);
          if (candidate !== undefined) {
            picker.actions.selectSearchResult(candidate);
          }
        }}
        onRetry={() => picker.actions.retrySearch()}
        onOpenMapPick={() => {
          picker.actions.clearMapPoint();
          setScreen('map');
        }}
        onUseCurrentLocation={() => {
          void (async () => {
            const saved = await actions.useCurrentLocationAsDestination('');
            if (saved) {
              setScreen('main');
            }
          })();
        }}
        onBack={() => setScreen('destinations')}
      />
    );
  } else if (screen === 'add') {
    // 座標入力は開発メニュー（S7）からのみ到達する（UX-1 / UX-6）。
    content = (
      <DestinationAddScreen
        currentPoint={state.location?.point ?? null}
        locationFreshness={nav.locationFreshness}
        onAdd={async (input) => {
          const saved = await actions.addDestination({
            name: input.name,
            point: input.point,
            origin: 'manual',
          });
          if (saved) {
            setScreen('dev');
          }
          return saved;
        }}
        onUseCurrentLocation={async (name) => {
          const saved = await actions.useCurrentLocationAsDestination(name);
          if (saved) {
            setScreen('dev');
          }
          return saved;
        }}
        onBack={() => setScreen('dev')}
      />
    );
  } else if (screen === 'dev') {
    content = (
      <DevLogScreen
        samples={state.samples}
        storageWarnings={state.storageWarnings}
        errors={state.errors}
        thresholds={state.thresholds}
        controller={runtime.controller}
        mockMode={state.mockMode}
        scenarioId={state.scenarioId}
        devToolsVisible={devToolsVisible}
        onToggleMock={() => actions.toggleMockMode()}
        onSelectScenario={(id) => actions.selectScenario(id)}
        onOpenCoordinateSetting={() => setScreen('add')}
        onResetOnboarding={resetOnboarding}
        onBack={() => setScreen('main')}
      />
    );
  } else if (screen === 'map') {
    content = (
      <ErrorBoundary onReturnToMain={() => setScreen('destinations')}>
        <MapScreen
          initialPoint={state.location?.point ?? null}
          selectedPoint={picker.state.mapPoint}
          selectedLabel={
            picker.state.mapCandidate === null ? null : picker.state.mapCandidate.name
          }
          resolving={picker.state.mapStatus === 'resolving'}
          onPick={picker.actions.selectMapPoint}
          onConfirm={picker.actions.confirmMapPoint}
          onBack={() => {
            picker.actions.clearMapPoint();
            setScreen('destinations');
          }}
        />
      </ErrorBoundary>
    );
  } else {
    content = (
      <ErrorBoundary onReturnToMain={() => setScreen('main')}>
        <MainScreen
          nav={nav}
          destinationName={selectedDestination?.name ?? null}
          destinationFavorite={selectedDestination?.favorite ?? null}
          gpsAccuracyM={state.location?.accuracyM ?? null}
          permission={state.permission}
          onOpenDestinationPicker={() => setScreen('destinations')}
          onToggleFavorite={() => {
            if (selectedDestination !== null) {
              void actions.setFavorite(
                selectedDestination.id,
                !selectedDestination.favorite,
              );
            }
          }}
          onRequestPermission={() => {
            void actions.retryPermission();
          }}
          onRetryLocation={() => actions.retryLocation()}
          onOpenDevMenu={() => setScreen('dev')}
        />
      </ErrorBoundary>
    );
  }

  if (!onboardingChecked) {
    return (
      <View style={[styles.root, { paddingTop: statusBarPaddingTop }]}>
        <ExpoStatusBar style="dark" />
      </View>
    );
  }

  if (onboardingVisible) {
    return (
      <View style={[styles.root, { paddingTop: statusBarPaddingTop }]}>
        <ExpoStatusBar style="dark" />
        <OnboardingScreen onComplete={finishOnboarding} onSkip={finishOnboarding} />
      </View>
    );
  }

  const pendingShared = picker.state.pendingShared;
  const deepLinkReady =
    pendingShared !== null &&
    pendingShared.source === 'deep-link' &&
    picker.derived.sharedBannerKind === 'ready';

  return (
    <View style={[styles.root, { paddingTop: statusBarPaddingTop }]}>
      <ExpoStatusBar style="dark" />
      <ScreenSwitcher screen={screen} onChange={setScreen}>
        {content}
      </ScreenSwitcher>
      <SharedDestinationSheet
        visible={pendingShared !== null && pendingShared.source === 'deep-link'}
        kind={deepLinkReady ? 'ready' : 'needs-resolution'}
        onConfirm={picker.actions.confirmShared}
        onDismiss={picker.actions.dismissShared}
      />
      <SharedDestinationSheet
        visible={incomingShared !== null}
        kind={incomingShared?.kind ?? 'needs-resolution'}
        onConfirm={() => {
          const destination = incomingShared?.destination ?? null;
          setIncomingShared(null);
          if (destination !== null) {
            confirmDestination({
              name: destination.name ?? UI_TEXT.destinationPicker.fallbackName,
              point: destination.point,
              origin: 'manual',
            });
          }
        }}
        onDismiss={() => setIncomingShared(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});

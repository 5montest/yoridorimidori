import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';
import { SystemClock } from './src/adapters/clock/SystemClock';
import { ExpoHeadingProvider } from './src/adapters/expo/ExpoHeadingProvider';
import { ExpoLocationProvider } from './src/adapters/expo/ExpoLocationProvider';
import { MockHeadingProvider } from './src/adapters/mock/MockHeadingProvider';
import { MockLocationProvider } from './src/adapters/mock/MockLocationProvider';
import { MockSensorControllerImpl } from './src/adapters/mock/MockSensorControllerImpl';
import { startMockTicker } from './src/adapters/mock/mockTicker';
import { AsyncStorageDestinationRepository } from './src/adapters/storage/AsyncStorageDestinationRepository';
import { AsyncStorageSampleLogRepository } from './src/adapters/storage/AsyncStorageSampleLogRepository';
import { DEFAULT_THRESHOLDS } from './src/domain/constants';
import { selectSelectedDestination } from './src/hooks/selectors';
import { useNavApp, type NavAppDeps } from './src/hooks/useNavApp';
import type { MockSensorController } from './src/ports/mockSensor';
import { ErrorBoundary } from './src/ui/components/ErrorBoundary';
import { PermissionNotice } from './src/ui/components/PermissionNotice';
import { ScreenSwitcher } from './src/ui/components/ScreenSwitcher';
import { type ScreenId } from './src/ui/labels';
import { DestinationAddScreen } from './src/ui/screens/DestinationAddScreen';
import { DestinationListScreen } from './src/ui/screens/DestinationListScreen';
import { DevLogScreen } from './src/ui/screens/DevLogScreen';
import { MainScreen } from './src/ui/screens/MainScreen';
import { MapScreen } from './src/ui/screens/MapScreen';
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
}

/**
 * 具象実装を生成する（**この関数が唯一の生成場所**）。
 *
 * - 実センサー（Expo）と Mock プロバイダの両方を生成し、`useNavApp` にポートとして注入する。
 * - Mock コントローラは開発画面へ直接渡す（`useNavApp` には渡さない＝§7.4）。
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

  return { deps, controller };
}

/**
 * アプリのコンポジションルート。§2.4 / §7.5 / §11.2 / T25。
 *
 * - 責務は**生成と注入だけ**。具体実装（Clock・リポジトリ・実/Mock プロバイダ）を生成して
 *   `useNavApp` に注入し、画面へ props を渡す。計算・判定ロジックは書かない。
 * - 画面遷移は `useState<ScreenId>`（ADR-07。`react-navigation` は使わない）。
 * - 権限拒否の案内はメイン画面のステータス領域に常設する（§11.2）。
 * - 開発画面への導線・Mock 切替は `__DEV__`（`devToolsVisible`）のときだけ出す（§9.7）。
 */
export default function App(): ReactElement {
  const [screen, setScreen] = useState<ScreenId>('main');
  const runtime = useMemo(createRuntime, []);
  const { state, nav, actions } = useNavApp(runtime.deps);
  const selectedDestination = selectSelectedDestination(state);
  const devToolsVisible = state.devToolsVisible;
  // ステータスバー（時刻・バッテリー）との重なりを避ける。safe-area-context は追加しない。
  const statusBarPaddingTop = statusBarTopInset(NativeStatusBar.currentHeight);

  // Mock モードの間だけ Mock センサーの時計を進める（開発ビルドのみ有効）。
  useEffect(() => {
    if (!state.mockMode) {
      return;
    }
    return startMockTicker(runtime.controller, MOCK_TICKER_INTERVAL_MS);
  }, [state.mockMode, runtime.controller]);

  const permissionNotice = (
    <PermissionNotice
      permission={state.permission}
      mockMode={state.mockMode}
      canStartMock={devToolsVisible}
      onRetry={() => {
        void actions.retryPermission();
      }}
      onStartMock={() => actions.toggleMockMode()}
    />
  );

  let content: ReactElement;
  if (screen === 'destinations') {
    content = (
      <DestinationListScreen
        destinations={state.destinations}
        selectedId={state.selectedDestinationId}
        onSelect={(id) => {
          actions.selectDestination(id);
          setScreen('main');
        }}
        onDelete={(id) => {
          void actions.removeDestination(id);
        }}
        onAddNew={() => setScreen('add')}
        onBack={() => setScreen('main')}
      />
    );
  } else if (screen === 'add') {
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
            setScreen('main');
          }
          return saved;
        }}
        onUseCurrentLocation={async (name) => {
          const saved = await actions.useCurrentLocationAsDestination(name);
          if (saved) {
            setScreen('main');
          }
          return saved;
        }}
        onBack={() => setScreen('destinations')}
      />
    );
  } else if (screen === 'dev' && devToolsVisible) {
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
        onBack={() => setScreen('main')}
      />
    );
  } else if (screen === 'map') {
    content = (
      <ErrorBoundary onReturnToMain={() => setScreen('main')}>
        <MapScreen
          currentPoint={state.location?.point ?? null}
          destinationName={selectedDestination?.name ?? null}
          destinationPoint={selectedDestination?.point ?? null}
          nav={nav}
          onBack={() => setScreen('main')}
        />
      </ErrorBoundary>
    );
  } else {
    content = (
      <ErrorBoundary onReturnToMain={() => setScreen('main')}>
        <MainScreen
          nav={nav}
          destinationName={selectedDestination?.name ?? null}
          gpsAccuracyM={state.location?.accuracyM ?? null}
          headingAccuracyLevel={state.heading?.accuracy ?? null}
          mockMode={state.mockMode}
          devToolsVisible={devToolsVisible}
          permissionNotice={permissionNotice}
          onChangeDestination={() => setScreen('destinations')}
          onOpenDestinations={() => setScreen('destinations')}
          onOpenMap={() => setScreen('map')}
          onOpenDevLog={() => setScreen('dev')}
          onToggleMock={() => actions.toggleMockMode()}
        />
      </ErrorBoundary>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: statusBarPaddingTop }]}>
      <ExpoStatusBar style="dark" />
      <ScreenSwitcher screen={screen} onChange={setScreen} devToolsVisible={devToolsVisible}>
        {content}
      </ScreenSwitcher>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});

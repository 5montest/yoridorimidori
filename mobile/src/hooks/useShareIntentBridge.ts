import { useCallback, useMemo } from 'react';
import Constants from 'expo-constants';

/** 共有インテントで受け取った内容（必要な項目のみ）。 */
export interface ShareIntentPayload {
  readonly text: string | null;
  readonly webUrl: string | null;
  readonly title: string | null;
}

/** アプリ側が使う共有インテントのブリッジ。 */
export interface ShareIntentBridge {
  /** 共有内容（無ければ null）。 */
  readonly payload: ShareIntentPayload | null;
  /** 処理後にネイティブ側の共有状態をクリアする。 */
  readonly clear: () => void;
}

/** `expo-share-intent` の `useShareIntent` の最小契約（公式型定義より）。 */
interface NativeUseShareIntent {
  (options?: { debug?: boolean; resetOnBackground?: boolean }): {
    readonly isReady: boolean;
    readonly hasShareIntent: boolean;
    readonly shareIntent: {
      readonly text?: string | null;
      readonly webUrl: string | null;
      readonly meta?: { readonly title?: string } | null;
    };
    readonly resetShareIntent: (clearNativeModule?: boolean) => void;
    readonly error: string | null;
  };
}

/**
 * Expo Go かどうか。`expo-share-intent` は Expo Go 非対応（ネイティブモジュールが無い）ため、
 * Expo Go では共有インテント機能を無効化する。
 */
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

/**
 * ネイティブモジュールを「あれば使う」形で遅延読み込みする。
 * Expo Go やテスト環境では読み込みに失敗するが、catch して null にフォールバックする。
 */
const nativeUseShareIntent: NativeUseShareIntent | null = (() => {
  if (IS_EXPO_GO) {
    return null;
  }
  try {
    const moduleUnknown = require('expo-share-intent') as {
      readonly useShareIntent?: unknown;
    };
    return typeof moduleUnknown.useShareIntent === 'function'
      ? (moduleUnknown.useShareIntent as NativeUseShareIntent)
      : null;
  } catch {
    return null;
  }
})();

const NOOP_BRIDGE: ShareIntentBridge = {
  payload: null,
  clear: () => undefined,
};

/** ネイティブ実装がある場合のフック（ビルド単位で一定なのでフック順序は安定）。 */
function useNativeShareIntent(hook: NativeUseShareIntent): ShareIntentBridge {
  const { hasShareIntent, shareIntent, resetShareIntent } = hook();

  const payload = useMemo<ShareIntentPayload | null>(() => {
    if (!hasShareIntent) {
      return null;
    }
    const text = shareIntent.text ?? shareIntent.webUrl ?? null;
    if (text === null || text.trim().length === 0) {
      return null;
    }
    return {
      text,
      webUrl: shareIntent.webUrl ?? null,
      title: shareIntent.meta?.title ?? null,
    };
  }, [hasShareIntent, shareIntent]);

  const clear = useCallback((): void => {
    resetShareIntent(true);
  }, [resetShareIntent]);

  return { payload, clear };
}

/**
 * 共有インテントの受信を扱うフック（FR-17）。
 *
 * - ネイティブ実装（development build / APK）がある場合のみ受信する。
 * - Expo Go では常に `payload: null`（機能無効）。アプリは落ちない。
 */
export function useShareIntentBridge(): ShareIntentBridge {
  // ビルド単位で一定の分岐なので、レンダー間でフック順序は変わらない。
  return nativeUseShareIntent !== null
    ? useNativeShareIntent(nativeUseShareIntent)
    : NOOP_BRIDGE;
}

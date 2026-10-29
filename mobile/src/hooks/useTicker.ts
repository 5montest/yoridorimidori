import { useEffect } from 'react';
import { TICK_INTERVAL_MS } from '../domain/constants';

/**
 * 鮮度表示を更新するための 1 秒ティッカー（薄いフック）。§7.4。
 *
 * - `enabled` が true の間だけ `setInterval` を回し、アンマウント/依存変化で `clearInterval` する。
 * - 「画面がメインのときだけ動かす」等の制御は呼び出し側（`useNavApp`）が `enabled` で行う。
 * - テスト対象外（§12.6）。時間を進めるテストは `FakeClock` を使う（`jest.useFakeTimers()` は禁止）。
 */
export function useTicker(
  enabled: boolean,
  onTick: () => void,
  intervalMs: number = TICK_INTERVAL_MS,
): void {
  useEffect(() => {
    if (!enabled || !Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }
    const timer = setInterval(onTick, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [enabled, intervalMs, onTick]);
}

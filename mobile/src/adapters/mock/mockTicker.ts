import type { MockSensorController } from '../../ports/mockSensor';

/**
 * 実アプリで Mock センサーを駆動する薄いティッカー（§8.2）。
 *
 * - `setInterval` はアダプタ層にのみ置く。**テスト対象外**（§12.4 のタイマー不使用方針。
 *   Jest では `controller.advance()` を明示的に呼ぶ）。
 * - 時間加速は `MockSensorControllerImpl.advance()` 内部で `timeScale` を掛けるため、
 *   ここでは実時間分だけ進める（100ms ティッカーなら `advance(100)`）。
 *
 * @returns 停止関数（冪等）
 */
export function startMockTicker(
  controller: MockSensorController,
  intervalMs: number,
): () => void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return () => undefined;
  }
  const timer = setInterval(() => {
    controller.advance(intervalMs);
  }, intervalMs);

  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    clearInterval(timer);
  };
}

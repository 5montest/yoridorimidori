import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { mapHeadingReading } from '../../domain/sensorMapping';
import type { HeadingFix } from '../../domain/types';
import type { Clock } from '../../ports/clock';
import type { ProviderError, ProviderErrorCode, Unsubscribe } from '../../ports/common';
import type { HeadingProvider } from '../../ports/heading';
import { decideHeadingAvailability } from './headingStrategy';

export interface ExpoHeadingProviderOptions {
  readonly clock: Clock;
  /** `Platform.OS` を注入する（テスト用）。省略時は react-native の `Platform.OS`。 */
  readonly platform?: string;
  /** 方位 API の有無を注入する（テスト用）。省略時は `watchHeadingAsync` の存在で判定。 */
  readonly hasWatchHeading?: boolean;
}

const NOOP_UNSUBSCRIBE: Unsubscribe = () => undefined;

/**
 * `expo-location` のコンパスによる `HeadingProvider`（§5.2 / D-05）。
 *
 * - `watchHeadingAsync` は Android / iOS のみ（【確定】notes §2.6）。Web 等は
 *   `unsupported-platform` を onError して購読しない。
 * - `trueHeading` が `-1`（位置権限なし）等なら `magHeading` にフォールバックし、
 *   `reference: 'magnetic-north'` を立てる（変換は T16 の `mapHeadingReading`）。
 * - **`coords.heading`（進行方向）は参照しない**。
 * - **`start()` は絶対に throw しない**。
 *
 * `Platform` の参照はこのアダプタ 1 箇所のみ（NFR-03）。
 */
export class ExpoHeadingProvider implements HeadingProvider {
  readonly id = 'expo-location';

  private readonly clock: Clock;
  private readonly platform: string;
  private readonly hasWatchHeading: boolean;

  constructor(options: ExpoHeadingProviderOptions) {
    this.clock = options.clock;
    this.platform = options.platform ?? Platform.OS;
    this.hasWatchHeading =
      options.hasWatchHeading ?? typeof Location.watchHeadingAsync === 'function';
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(
      decideHeadingAvailability({
        platform: this.platform,
        hasWatchHeading: this.hasWatchHeading,
      }) === 'available',
    );
  }

  async start(
    onFix: (fix: HeadingFix) => void,
    onError: (error: ProviderError) => void,
  ): Promise<Unsubscribe> {
    const availability = decideHeadingAvailability({
      platform: this.platform,
      hasWatchHeading: this.hasWatchHeading,
    });
    if (availability !== 'available') {
      onError(
        this.createError(
          availability === 'unsupported-platform' ? 'unsupported-platform' : 'unavailable',
          availability === 'unsupported-platform'
            ? 'この環境では方位を取得できません'
            : '方位 API が見つかりません',
          availability,
        ),
      );
      return NOOP_UNSUBSCRIBE;
    }

    try {
      const subscription = await Location.watchHeadingAsync(
        (heading) => {
          onFix(
            mapHeadingReading(
              heading,
              this.clock.nowMonotonicMs(),
              this.clock.nowEpochMs(),
              'device',
            ),
          );
        },
        (reason) => {
          onError(this.createError('runtime-error', '方位の取得でエラーが発生しました', reason));
        },
      );

      let active = true;
      return () => {
        if (!active) {
          return; // 冪等
        }
        active = false;
        try {
          subscription.remove();
        } catch {
          // 解除失敗は無視
        }
      };
    } catch (error) {
      onError(
        this.createError(
          'runtime-error',
          '方位の購読に失敗しました',
          error instanceof Error ? error.message : undefined,
        ),
      );
      return NOOP_UNSUBSCRIBE;
    }
  }

  private createError(
    code: ProviderErrorCode,
    message: string,
    detail?: string,
  ): ProviderError {
    const base: ProviderError = { code, message, atMonotonicMs: this.clock.nowMonotonicMs() };
    return detail === undefined ? base : { ...base, detail };
  }
}

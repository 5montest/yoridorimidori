import { decideHeadingAvailability } from '../expo/headingStrategy';

describe('decideHeadingAvailability — §5.2 / NFR-03', () => {
  it('Android / iOS で API があれば available', () => {
    expect(
      decideHeadingAvailability({ platform: 'android', hasWatchHeading: true }),
    ).toBe('available');
    expect(decideHeadingAvailability({ platform: 'ios', hasWatchHeading: true })).toBe('available');
  });

  it('Web は API があっても unsupported-platform（watchHeadingAsync は Web 非対応）', () => {
    expect(decideHeadingAvailability({ platform: 'web', hasWatchHeading: true })).toBe(
      'unsupported-platform',
    );
    expect(decideHeadingAvailability({ platform: 'windows', hasWatchHeading: true })).toBe(
      'unsupported-platform',
    );
  });

  it('対応プラットフォームで API が無ければ missing-api', () => {
    expect(decideHeadingAvailability({ platform: 'android', hasWatchHeading: false })).toBe(
      'missing-api',
    );
    expect(decideHeadingAvailability({ platform: 'ios', hasWatchHeading: false })).toBe(
      'missing-api',
    );
  });

  it('Web かつ API 無しは unsupported-platform（プラットフォーム判定が先）', () => {
    expect(decideHeadingAvailability({ platform: 'web', hasWatchHeading: false })).toBe(
      'unsupported-platform',
    );
  });
});

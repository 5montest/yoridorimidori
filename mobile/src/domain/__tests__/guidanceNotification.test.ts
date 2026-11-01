import { buildGuidanceNotificationBody } from '../guidanceNotification';

describe('buildGuidanceNotificationBody', () => {
  it('目的地名と距離があるときは両方出す', () => {
    expect(
      buildGuidanceNotificationBody({ destinationName: '東京駅', distanceM: 1200 }),
    ).toBe('目的地「東京駅」まで 1.20 km');
    expect(
      buildGuidanceNotificationBody({ destinationName: '東京駅', distanceM: 850 }),
    ).toBe('目的地「東京駅」まで 850 m');
  });

  it('距離だけ分かるときは目的地名を出さない', () => {
    expect(buildGuidanceNotificationBody({ destinationName: null, distanceM: 850 })).toBe(
      '目的地まで 850 m',
    );
  });

  it('目的地名だけ分かるときは「へ案内中」', () => {
    expect(buildGuidanceNotificationBody({ destinationName: '東京駅', distanceM: null })).toBe(
      '目的地「東京駅」へ案内中',
    );
  });

  it('どちらも無いときは「案内中」', () => {
    expect(buildGuidanceNotificationBody({ destinationName: null, distanceM: null })).toBe(
      '案内中',
    );
  });

  it('距離が不正（負値・NaN・Infinity）なら距離を出さない', () => {
    for (const distance of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildGuidanceNotificationBody({ destinationName: '東京駅', distanceM: distance })).toBe(
        '目的地「東京駅」へ案内中',
      );
    }
  });

  it('名前が空白だけなら未設定として扱う', () => {
    expect(buildGuidanceNotificationBody({ destinationName: '   ', distanceM: 10 })).toBe(
      '目的地まで 10 m',
    );
  });
});

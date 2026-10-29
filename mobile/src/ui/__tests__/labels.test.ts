import type {
  Freshness,
  GpsAccuracyClass,
  HeadingAccuracyClass,
  HeadingReference,
  NavStatus,
  WarningCode,
} from '../../domain/types';
import {
  UI_TEXT,
  birdAccessibilityLabel,
  freshnessLabel,
  freshnessWithAgeLabel,
  gpsAccuracyLabel,
  gpsAccuracyWithValueLabel,
  headingAccuracyLabel,
  headingAccuracyWithValueLabel,
  headingReferenceLabel,
  navStatusLabel,
  relativeDirectionLabel,
  screenLabel,
  validationErrorLabel,
  warningLabel,
  type ScreenId,
  type ValidationErrorKey,
} from '../labels';

const NAV_STATUSES: readonly NavStatus[] = [
  'no-destination',
  'locating',
  'position-lost',
  'heading-unknown',
  'arrived',
  'navigating',
];

const FRESHNESS_VALUES: readonly (Freshness | null)[] = ['fresh', 'aging', 'stale', 'lost', null];

const GPS_ACCURACY_CLASSES: readonly GpsAccuracyClass[] = ['good', 'fair', 'poor', 'unknown'];

const HEADING_ACCURACY_CLASSES: readonly HeadingAccuracyClass[] = [
  'good',
  'fair',
  'poor',
  'uncalibrated',
  'unknown',
];

const HEADING_REFERENCES: readonly HeadingReference[] = [
  'true-north',
  'magnetic-north',
  'unknown',
];

const WARNING_CODES: readonly WarningCode[] = [
  'location-stale',
  'location-lost',
  'heading-stale',
  'heading-lost',
  'heading-low-accuracy',
  'heading-uncalibrated',
  'heading-unavailable',
  'magnetic-reference',
  'gps-low-accuracy',
];

const VALIDATION_ERROR_KEYS: readonly ValidationErrorKey[] = [
  'name-required',
  'name-too-long',
  'latitude-invalid',
  'longitude-invalid',
  'point-invalid',
];

const SCREENS: readonly ScreenId[] = ['main', 'destinations', 'add', 'dev', 'map'];

/** 全て非空文字列であることを表明する。 */
function expectNonEmpty(label: string): void {
  expect(typeof label).toBe('string');
  expect(label.trim().length).toBeGreaterThan(0);
}

describe('navStatusLabel', () => {
  it('NavStatus 全 6 値が非空で相互に一意', () => {
    const labels = NAV_STATUSES.map(navStatusLabel);
    labels.forEach(expectNonEmpty);
    expect(new Set(labels).size).toBe(NAV_STATUSES.length);
  });

  it('§9.4 の代表文言を含む', () => {
    expect(navStatusLabel('no-destination')).toContain('目的地');
    expect(navStatusLabel('arrived')).toBe('到着');
    expect(navStatusLabel('navigating')).toContain('ナビゲーション');
  });
});

describe('freshnessLabel', () => {
  it('fresh/aging/stale/lost/null がすべて非空', () => {
    FRESHNESS_VALUES.forEach((value) => expectNonEmpty(freshnessLabel(value)));
  });
});

describe('gpsAccuracyLabel', () => {
  it('全 4 区分が非空', () => {
    GPS_ACCURACY_CLASSES.forEach((value) => expectNonEmpty(gpsAccuracyLabel(value)));
  });
});

describe('headingAccuracyLabel', () => {
  it('全 5 区分が非空', () => {
    HEADING_ACCURACY_CLASSES.forEach((value) => expectNonEmpty(headingAccuracyLabel(value)));
  });

  it('uncalibrated（要校正）と unknown（不明）の文言が異なる', () => {
    expect(headingAccuracyLabel('uncalibrated')).not.toBe(headingAccuracyLabel('unknown'));
    expect(headingAccuracyLabel('uncalibrated')).toContain('校正');
    expect(headingAccuracyLabel('unknown')).toContain('不明');
  });
});

describe('headingReferenceLabel', () => {
  it('全 3 値が非空・相互に一意', () => {
    const labels = HEADING_REFERENCES.map(headingReferenceLabel);
    labels.forEach(expectNonEmpty);
    expect(new Set(labels).size).toBe(HEADING_REFERENCES.length);
  });

  it("'magnetic-north' の文言に「磁北」を含む", () => {
    expect(headingReferenceLabel('magnetic-north')).toContain('磁北');
  });
});

describe('warningLabel', () => {
  it('WarningCode 全 9 値が非空・相互に一意', () => {
    const labels = WARNING_CODES.map(warningLabel);
    labels.forEach(expectNonEmpty);
    expect(new Set(labels).size).toBe(WARNING_CODES.length);
  });
});

describe('validationErrorLabel', () => {
  it('errorKey 全 5 値が非空・相互に一意', () => {
    const labels = VALIDATION_ERROR_KEYS.map(validationErrorLabel);
    labels.forEach(expectNonEmpty);
    expect(new Set(labels).size).toBe(VALIDATION_ERROR_KEYS.length);
  });

  it('名前・緯度・経度のエラーが区別できる', () => {
    expect(validationErrorLabel('name-required')).toContain('名前');
    expect(validationErrorLabel('latitude-invalid')).toContain('緯度');
    expect(validationErrorLabel('longitude-invalid')).toContain('経度');
  });
});

describe('表示の合成', () => {
  it('freshnessWithAgeLabel: 経過秒を併記し、null は鮮度のみ', () => {
    expect(freshnessWithAgeLabel('fresh', 1_000)).toBe('最新（1 秒前）');
    expect(freshnessWithAgeLabel('stale', 25_000)).toBe('古い（25 秒前）');
    expect(freshnessWithAgeLabel('fresh', null)).toBe('最新');
    expect(freshnessWithAgeLabel(null, null)).toBe('未取得');
  });

  it('gpsAccuracyWithValueLabel: 生値と区分を併記する', () => {
    expect(gpsAccuracyWithValueLabel(8, 'good')).toBe('8 m（良好）');
    expect(gpsAccuracyWithValueLabel(null, 'unknown')).toBe('—（不明）');
    expect(gpsAccuracyWithValueLabel(Number.NaN, 'unknown')).toBe('—（不明）');
  });

  it('headingAccuracyWithValueLabel: 生値と区分を併記する', () => {
    expect(headingAccuracyWithValueLabel(2, 'fair')).toBe('2（普通）');
    expect(headingAccuracyWithValueLabel(null, 'unknown')).toBe('—（不明）');
    expect(headingAccuracyWithValueLabel(0, 'uncalibrated')).toContain('要校正');
  });

  it('relativeDirectionLabel: 角度を方角の言葉にする', () => {
    expect(relativeDirectionLabel(null)).toBe('不明');
    expect(relativeDirectionLabel(0)).toBe('正面');
    expect(relativeDirectionLabel(45)).toBe('右斜め前');
    expect(relativeDirectionLabel(-45)).toBe('左斜め前');
    expect(relativeDirectionLabel(90)).toBe('右');
    expect(relativeDirectionLabel(-90)).toBe('左');
    expect(relativeDirectionLabel(135)).toBe('右後ろ');
    expect(relativeDirectionLabel(-135)).toBe('左後ろ');
    expect(relativeDirectionLabel(180)).toBe('真後ろ');
    expect(relativeDirectionLabel(Number.NaN)).toBe('不明');
  });

  it('birdAccessibilityLabel: 到着・不明・方角を含む', () => {
    expect(birdAccessibilityLabel(null, true)).toContain('到着');
    expect(birdAccessibilityLabel(null, false)).toContain('分かりません');
    expect(birdAccessibilityLabel(90, false)).toContain('右');
  });
});

describe('screenLabel / UI_TEXT', () => {
  it('全画面の文言が非空・相互に一意', () => {
    const labels = SCREENS.map(screenLabel);
    labels.forEach(expectNonEmpty);
    expect(new Set(labels).size).toBe(SCREENS.length);
  });

  it('UI_TEXT 内の全文言が非空', () => {
    const strings: string[] = [];
    collectStrings(UI_TEXT, strings);
    expect(strings.length).toBeGreaterThan(0);
    strings.forEach(expectNonEmpty);
  });
});

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) {
      collectStrings(item, out);
    }
  }
}

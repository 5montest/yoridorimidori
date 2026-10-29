import type { GeoPoint } from '../types';
import {
  DESTINATION_NAME_MAX_LENGTH,
  isValidGeoPoint,
  isValidLatitude,
  isValidLongitude,
  validateDestinationInput,
  type ValidationResult,
} from '../validation';

/**
 * 型では防げない「実行時の不正入力」を検証する関数なので、テストでは unknown 経由で渡す。
 * （`any` は使わない。NFR-05）
 */
type ValidatedValue = { readonly name: string; readonly point: GeoPoint };

function validate(raw: unknown): ValidationResult<ValidatedValue> {
  return validateDestinationInput(raw as { readonly name: string; readonly point: GeoPoint });
}

function repeat(char: string, count: number): string {
  return char.repeat(count);
}

describe('isValidLatitude — E-12', () => {
  it('NaN / Infinity / 範囲外は false', () => {
    expect(isValidLatitude(NaN)).toBe(false);
    expect(isValidLatitude(Infinity)).toBe(false);
    expect(isValidLatitude(-Infinity)).toBe(false);
    expect(isValidLatitude(91)).toBe(false);
    expect(isValidLatitude(-90.0001)).toBe(false);
  });

  it('境界（±90）と通常値は true', () => {
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(35.681236)).toBe(true);
  });
});

describe('isValidLongitude — E-12', () => {
  it('NaN / Infinity / 範囲外は false', () => {
    expect(isValidLongitude(NaN)).toBe(false);
    expect(isValidLongitude(Infinity)).toBe(false);
    expect(isValidLongitude(-Infinity)).toBe(false);
    expect(isValidLongitude(181)).toBe(false);
    expect(isValidLongitude(-180.0001)).toBe(false);
  });

  it('境界（±180）と通常値は true', () => {
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(0)).toBe(true);
    expect(isValidLongitude(139.767125)).toBe(true);
  });
});

describe('isValidGeoPoint — E-12', () => {
  it('いずれかの座標が不正なら false', () => {
    expect(isValidGeoPoint({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(isValidGeoPoint({ latitude: 0, longitude: NaN })).toBe(false);
    expect(isValidGeoPoint({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidGeoPoint({ latitude: 0, longitude: -181 })).toBe(false);
  });

  it('境界値（北極・南極・日付変更線）は true', () => {
    expect(isValidGeoPoint({ latitude: 90, longitude: 180 })).toBe(true);
    expect(isValidGeoPoint({ latitude: -90, longitude: -180 })).toBe(true);
    expect(isValidGeoPoint({ latitude: 0, longitude: 0 })).toBe(true);
  });

  it('型不正（null / 非オブジェクト / 欠損フィールド）でも throw せず false', () => {
    expect(isValidGeoPoint(null as unknown as GeoPoint)).toBe(false);
    expect(isValidGeoPoint(undefined as unknown as GeoPoint)).toBe(false);
    expect(isValidGeoPoint('35.6,139.7' as unknown as GeoPoint)).toBe(false);
    expect(isValidGeoPoint({} as unknown as GeoPoint)).toBe(false);
    expect(isValidGeoPoint({ latitude: 35.6 } as unknown as GeoPoint)).toBe(false);
    expect(isValidGeoPoint({ latitude: '35.6', longitude: '139.7' } as unknown as GeoPoint)).toBe(
      false,
    );
  });
});

describe('validateDestinationInput — 名前（FR-01 / §6.11）', () => {
  const point: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };

  it('前後の空白を除去し、内部の空白は保持する', () => {
    const result = validate({ name: '  東京駅  ', point });
    expect(result.ok).toBe(true);
    expect(result.value?.name).toBe('東京駅');
    expect(result.errorKey).toBeUndefined();

    const inner = validate({ name: ' 東京 駅 ', point });
    expect(inner.value?.name).toBe('東京 駅');
  });

  it('空文字・空白のみは name-required', () => {
    expect(validate({ name: '', point })).toEqual({ ok: false, errorKey: 'name-required' });
    expect(validate({ name: '   ', point })).toEqual({ ok: false, errorKey: 'name-required' });
    expect(validate({ name: '\t\n', point })).toEqual({ ok: false, errorKey: 'name-required' });
  });

  it('50 文字は OK・51 文字は name-too-long（境界）', () => {
    expect(DESTINATION_NAME_MAX_LENGTH).toBe(50);
    const okResult = validate({ name: repeat('あ', 50), point });
    expect(okResult.ok).toBe(true);
    expect(okResult.value?.name).toHaveLength(50);

    const tooLong = validate({ name: repeat('あ', 51), point });
    expect(tooLong.ok).toBe(false);
    expect(tooLong.errorKey).toBe('name-too-long');
  });

  it('trim 後の長さで判定する（前後空白は文字数に含めない）', () => {
    const result = validate({ name: `  ${repeat('あ', 50)}  `, point });
    expect(result.ok).toBe(true);
    expect(result.value?.name).toHaveLength(50);
  });
});

describe('validateDestinationInput — 座標（E-12）', () => {
  it('緯度 91 は latitude-invalid', () => {
    const result = validate({ name: '東京駅', point: { latitude: 91, longitude: 139.7 } });
    expect(result).toEqual({ ok: false, errorKey: 'latitude-invalid' });
  });

  it('経度 -181 は longitude-invalid', () => {
    const result = validate({ name: '東京駅', point: { latitude: 35.6, longitude: -181 } });
    expect(result).toEqual({ ok: false, errorKey: 'longitude-invalid' });
  });

  it('両方不正なら latitude-invalid（判定順の固定）', () => {
    const result = validate({ name: '東京駅', point: { latitude: 91, longitude: -181 } });
    expect(result.errorKey).toBe('latitude-invalid');
  });

  it('NaN / Infinity は必ず拒否する', () => {
    expect(validate({ name: 'x', point: { latitude: NaN, longitude: 0 } }).ok).toBe(false);
    expect(validate({ name: 'x', point: { latitude: Infinity, longitude: 0 } }).errorKey).toBe(
      'latitude-invalid',
    );
    expect(validate({ name: 'x', point: { latitude: 0, longitude: -Infinity } }).errorKey).toBe(
      'longitude-invalid',
    );
  });

  it('境界値（±90 / ±180）は受理する', () => {
    const result = validate({ name: '極点', point: { latitude: 90, longitude: 180 } });
    expect(result.ok).toBe(true);
    expect(result.value?.point).toEqual({ latitude: 90, longitude: 180 });
  });

  it('point が null / 非オブジェクトなら point-invalid（throw しない）', () => {
    expect(validate({ name: 'x', point: null })).toEqual({ ok: false, errorKey: 'point-invalid' });
    expect(validate({ name: 'x', point: '35.6,139.7' })).toEqual({
      ok: false,
      errorKey: 'point-invalid',
    });
    expect(validate({ name: 'x' })).toEqual({ ok: false, errorKey: 'point-invalid' });
    expect(validate(null)).toEqual({ ok: false, errorKey: 'point-invalid' });
    expect(validate(undefined)).toEqual({ ok: false, errorKey: 'point-invalid' });
  });
});

describe('validateDestinationInput — 戻り値の形', () => {
  it('ok のとき value は trim 済み name と point のみ（origin は含まない）', () => {
    const result = validate({
      name: '  新宿駅 ',
      point: { latitude: 35.689592, longitude: 139.700413 },
    });
    expect(result.ok).toBe(true);
    expect(result.errorKey).toBeUndefined();
    expect(result.value).toEqual({
      name: '新宿駅',
      point: { latitude: 35.689592, longitude: 139.700413 },
    });
    expect(result.value === undefined ? [] : Object.keys(result.value)).not.toContain('origin');
  });

  it('どの入力でも例外を投げない', () => {
    const inputs: readonly unknown[] = [
      null,
      undefined,
      0,
      '',
      [],
      {},
      { name: 1, point: { latitude: 0, longitude: 0 } },
      { name: 'x', point: [] },
      { name: 'x', point: { latitude: null, longitude: null } },
    ];
    for (const input of inputs) {
      expect(() => validate(input)).not.toThrow();
      expect(validate(input).ok).toBe(false);
    }
  });
});

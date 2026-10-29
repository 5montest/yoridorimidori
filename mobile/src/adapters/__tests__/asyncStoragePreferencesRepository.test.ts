import AsyncStorage from '@react-native-async-storage/async-storage';
import { AsyncStoragePreferencesRepository } from '../storage/AsyncStoragePreferencesRepository';
import { PREFERENCES_KEY } from '../storage/storageKeys';
import { PREFERENCES_SCHEMA_VERSION, decodePreferences, encodePreferences } from '../storage/codec';

function getItemMock(): jest.Mock {
  return AsyncStorage.getItem as unknown as jest.Mock;
}

function setItemMock(): jest.Mock {
  return AsyncStorage.setItem as unknown as jest.Mock;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('AsyncStoragePreferencesRepository — オンボーディング表示済みフラグ', () => {
  it('未設定は false（初回起動扱い）', async () => {
    const repository = new AsyncStoragePreferencesRepository();
    await expect(repository.getOnboardingSeen()).resolves.toBe(false);
  });

  it('setOnboardingSeen(true) が永続化される（新しいインスタンスでも true）', async () => {
    const repository = new AsyncStoragePreferencesRepository();
    await repository.setOnboardingSeen(true);
    await expect(repository.getOnboardingSeen()).resolves.toBe(true);

    const reopened = new AsyncStoragePreferencesRepository();
    await expect(reopened.getOnboardingSeen()).resolves.toBe(true);
  });

  it('false に戻せる', async () => {
    const repository = new AsyncStoragePreferencesRepository();
    await repository.setOnboardingSeen(true);
    await repository.setOnboardingSeen(false);
    await expect(repository.getOnboardingSeen()).resolves.toBe(false);
  });

  it('保存形式は { schemaVersion, onboardingSeen }（既存 codec の流儀）', async () => {
    const repository = new AsyncStoragePreferencesRepository();
    await repository.setOnboardingSeen(true);
    const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
    expect(raw).not.toBeNull();
    const parsed = raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
    expect(parsed?.schemaVersion).toBe(PREFERENCES_SCHEMA_VERSION);
    expect(parsed?.onboardingSeen).toBe(true);
  });
});

describe('AsyncStoragePreferencesRepository — 破損・失敗時のフォールバック（throw しない）', () => {
  it('破損 JSON は false', async () => {
    await AsyncStorage.setItem(PREFERENCES_KEY, '{broken');
    const warnings: string[] = [];
    const repository = new AsyncStoragePreferencesRepository((message) => warnings.push(message));
    await expect(repository.getOnboardingSeen()).resolves.toBe(false);
    expect(warnings).toEqual([]); // 破損は「未見」なので警告なしでよい
  });

  it('型不正（onboardingSeen が文字列・root が配列・未知バージョン）は false', async () => {
    const repository = new AsyncStoragePreferencesRepository();

    await AsyncStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ schemaVersion: 1, onboardingSeen: 'yes' }),
    );
    await expect(repository.getOnboardingSeen()).resolves.toBe(false);

    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify([true]));
    await expect(repository.getOnboardingSeen()).resolves.toBe(false);

    await AsyncStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ schemaVersion: 2, onboardingSeen: true }),
    );
    await expect(repository.getOnboardingSeen()).resolves.toBe(false);
  });

  it('読み取り失敗（getItem reject）は false を返し onWarning に通知する', async () => {
    const warnings: string[] = [];
    const repository = new AsyncStoragePreferencesRepository((message) => warnings.push(message));
    getItemMock().mockImplementationOnce(() => Promise.reject(new Error('io')));
    await expect(repository.getOnboardingSeen()).resolves.toBe(false);
    expect(warnings).toHaveLength(1);
  });

  it('保存失敗（setItem reject）は throw せず onWarning に通知する', async () => {
    const warnings: string[] = [];
    const repository = new AsyncStoragePreferencesRepository((message) => warnings.push(message));
    setItemMock().mockImplementationOnce(() => Promise.reject(new Error('quota')));
    await expect(repository.setOnboardingSeen(true)).resolves.toBeUndefined();
    expect(warnings).toHaveLength(1);
    await expect(repository.getOnboardingSeen()).resolves.toBe(false); // 保存できていない
  });
});

describe('preferences codec（純粋関数）', () => {
  it('encode / decode のラウンドトリップ', () => {
    expect(decodePreferences(encodePreferences(true))).toBe(true);
    expect(decodePreferences(encodePreferences(false))).toBe(false);
  });

  it('null・空文字・破損・未知形式は false', () => {
    expect(decodePreferences(null)).toBe(false);
    expect(decodePreferences('')).toBe(false);
    expect(decodePreferences('{broken')).toBe(false);
    expect(decodePreferences('[]')).toBe(false);
    expect(decodePreferences(JSON.stringify({ schemaVersion: 1 }))).toBe(false);
    expect(decodePreferences(JSON.stringify({ schemaVersion: 1, onboardingSeen: 1 }))).toBe(false);
    expect(decodePreferences(JSON.stringify({ schemaVersion: 3, onboardingSeen: true }))).toBe(
      false,
    );
  });

  it('schemaVersion 欠落は v1 として読む（防御的）', () => {
    expect(decodePreferences(JSON.stringify({ onboardingSeen: true }))).toBe(true);
  });
});

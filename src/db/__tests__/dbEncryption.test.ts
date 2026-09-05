/**
 * 暗号鍵のスロット移行のテスト。
 *
 * ここが壊れると「機種変更で全記録を失う」に直結するのに、実機でしか再現しない
 * （キーチェーンの保護属性は iOS 側の挙動）。せめてスロットの読み書きの筋は固定する。
 */
jest.mock('expo-secure-store', () => {
  const store = new Map<string, { value: string; accessible?: string }>();
  return {
    __store: store,
    WHEN_UNLOCKED: 'WHEN_UNLOCKED',
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (k: string) => store.get(k)?.value ?? null),
    setItemAsync: jest.fn(async (k: string, v: string, opts?: { keychainAccessible?: string }) => {
      const existing = store.get(k);
      // 実機の挙動を再現する: 既存項目への書き込みは SecItemUpdate に落ち、
      // 値だけが更新されて kSecAttrAccessible は据え置かれる。
      store.set(k, {
        value: v,
        accessible: existing ? existing.accessible : opts?.keychainAccessible,
      });
    }),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
  };
});
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (n: number) => new Uint8Array(n).fill(0xab)),
}));

import * as SecureStore from 'expo-secure-store';
import { getEncryptionKey, getOrCreateEncryptionKey, ensureKeyIsBackupable, deleteEncryptionKey, KeychainUnavailableError } from '../dbEncryption';

const CURRENT = 'fx_db_encryption_key_v2';
const LEGACY = 'fx_db_encryption_key';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store: Map<string, { value: string; accessible?: string }> = (SecureStore as any).__store;

beforeEach(() => store.clear());

describe('暗号鍵のスロット', () => {
  it('新規インストールでは現行スロットにバックアップ可能な属性で作られる', async () => {
    const key = await getOrCreateEncryptionKey();
    expect(store.get(CURRENT)).toEqual({ value: key, accessible: 'WHEN_UNLOCKED' });
    expect(store.has(LEGACY)).toBe(false);
  });

  it('旧スロットにしか無い鍵も読める', async () => {
    store.set(LEGACY, { value: 'abc', accessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    await expect(getEncryptionKey()).resolves.toBe('abc');
  });

  it('現行スロットを優先して読む', async () => {
    store.set(LEGACY, { value: 'old', accessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    store.set(CURRENT, { value: 'new', accessible: 'WHEN_UNLOCKED' });
    await expect(getEncryptionKey()).resolves.toBe('new');
  });

  it('既存ユーザーの鍵をバックアップ可能なスロットへ複製する', async () => {
    store.set(LEGACY, { value: 'abc', accessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    await ensureKeyIsBackupable('abc');
    expect(store.get(CURRENT)).toEqual({ value: 'abc', accessible: 'WHEN_UNLOCKED' });
    // 旧スロットは残す。移行の途中で失敗しても鍵が1つも無い状態を作らないため。
    expect(store.get(LEGACY)?.value).toBe('abc');
  });

  it('同じスロットへの書き直しでは保護属性が変わらない（この前提が2スロットの理由）', async () => {
    store.set(LEGACY, { value: 'abc', accessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    await SecureStore.setItemAsync(LEGACY, 'abc', { keychainAccessible: 'WHEN_UNLOCKED' as never });
    expect(store.get(LEGACY)?.accessible).toBe('WHEN_UNLOCKED_THIS_DEVICE_ONLY');
  });

  it('移行済みなら書き込まない', async () => {
    store.set(CURRENT, { value: 'abc', accessible: 'WHEN_UNLOCKED' });
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    await ensureKeyIsBackupable('abc');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('getOrCreate は既存の鍵を作り直さず、複製だけする', async () => {
    store.set(LEGACY, { value: 'abc', accessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    await expect(getOrCreateEncryptionKey()).resolves.toBe('abc');
    expect(store.get(CURRENT)?.value).toBe('abc');
  });

  it('削除は両方のスロットを消す（残すとリセット後に古い鍵を拾う）', async () => {
    store.set(LEGACY, { value: 'abc' });
    store.set(CURRENT, { value: 'abc' });
    await deleteEncryptionKey();
    expect(store.size).toBe(0);
  });

  describe('読み取り失敗と「鍵が無い」の区別', () => {
    // ここを取り違えると、一時的にキーチェーンが読めなかっただけのユーザーに
    // 「全データを削除する」ボタンしかない画面を出してしまう。
    const failOnce = (key: string) =>
      (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (k: string) => {
        if (k === key) throw new Error('errSecInteractionNotAllowed');
        return store.get(k)?.value ?? null;
      });

    afterEach(() => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation(
        async (k: string) => store.get(k)?.value ?? null
      );
    });

    it('両スロットとも正常に「無い」なら null（本当に鍵が無い）', async () => {
      await expect(getEncryptionKey()).resolves.toBeNull();
    });

    it('現行スロットが読めなくても、旧スロットに鍵があれば救う', async () => {
      store.set(LEGACY, { value: 'abc' });
      failOnce(CURRENT);
      await expect(getEncryptionKey()).resolves.toBe('abc');
    });

    it('現行スロットが読めず旧スロットも空なら、null ではなく専用エラー', async () => {
      // 旧スロットを持たない新規ユーザーで、これを null にすると
      // 「鍵が無い」と誤判定され全削除を促される。
      failOnce(CURRENT);
      await expect(getEncryptionKey()).rejects.toBeInstanceOf(KeychainUnavailableError);
    });
  });
});

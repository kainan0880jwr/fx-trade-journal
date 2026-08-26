import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const KEY_NAME = 'fx_db_encryption_key';

// 鍵を新規生成せず、既存の鍵があればそれだけを返す（なければnull）。
// 既に暗号化DBが存在する状態（migrated==='v1'）でこれがnullを返す場合、
// SecureStoreからの鍵取得に失敗している（Androidのキーストア無効化等）ことを意味し、
// 新規鍵を生成してはならない — 呼び出し側でgetOrCreateEncryptionKeyを使うと、
// 既存の暗号化DBを二度と復号できない鍵で上書きしてしまう。
export async function getEncryptionKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_NAME);
}

// SQLiteの暗号化パスフレーズとして使う。32バイトのランダム値を16進文字列化するため
// パスフレーズ自体に引用符等の特殊文字は含まれず、PRAGMA文へそのまま埋め込んで安全。
export async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await getEncryptionKey();
  if (existing) {
    // 既存インストールの鍵にも端末専用アクセス制限をかけ直し、以後のiCloudバックアップから除外する
    await SecureStore.setItemAsync(KEY_NAME, existing, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return existing;
  }

  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

/** 暗号化キーを削除する（DBリセット時、キーとDBファイルの不整合を解消するために使用） */
export async function deleteEncryptionKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME);
}

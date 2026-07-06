import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const KEY_NAME = 'fx_db_encryption_key';

// SQLiteの暗号化パスフレーズとして使う。32バイトのランダム値を16進文字列化するため
// パスフレーズ自体に引用符等の特殊文字は含まれず、PRAGMA文へそのまま埋め込んで安全。
export async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;

  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, key);
  return key;
}

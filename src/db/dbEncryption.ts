import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// 現行スロット。iOS では WHEN_UNLOCKED で保存され、端末のバックアップに含まれる。
const KEY_NAME = 'fx_db_encryption_key_v2';
// 旧スロット。iOS では WHEN_UNLOCKED_THIS_DEVICE_ONLY で保存されており、
// バックアップに含まれない。1.3.2 以前からのユーザーはここに鍵を持っている。
const LEGACY_KEY_NAME = 'fx_db_encryption_key';

// iOS のキーチェーン保護属性（`keychainAccessible` は iOS 専用で、Android では無視される）。
//
// 以前は WHEN_UNLOCKED_THIS_DEVICE_ONLY だった。これだと鍵は端末のバックアップに
// 含まれない一方、暗号化DBファイル（documentDirectory）と移行フラグ（オプション未指定＝
// 既定の WHEN_UNLOCKED）は iCloud 経由で新端末に復元される。この非対称のせいで、
// 機種変更すると「記録はあるのに鍵が無い」状態になり、手動バックアップを取っていない
// ユーザーは全記録を失っていた。鍵も一緒に運ばれるよう WHEN_UNLOCKED に揃える。
// 鍵が端末外（iCloudキーチェーン／暗号化バックアップ）に出ることは、機種変更での
// 全損を防ぐためのトレードオフとして受け入れている。
//
// Android では同じ手が使えない。expo-secure-store は値を Android Keystore の鍵で
// 暗号化して保存するが、Keystore の鍵は端末外に持ち出せないため、SecureStore の
// 保存内容を復元しても新端末では復号できない。あちらは app.json の
// android.allowBackup=false でDB側をバックアップ対象から外し、
// 「復元されるものが何も無い」状態に揃えてある。
const KEYCHAIN_ACCESSIBLE = SecureStore.WHEN_UNLOCKED;

// 鍵を新規生成せず、既存の鍵があればそれだけを返す（なければnull）。
// 既に暗号化DBが存在する状態（migrated==='v1'）でこれがnullを返す場合、
// SecureStoreからの鍵取得に失敗している（Androidのキーストア無効化等）ことを意味し、
// 新規鍵を生成してはならない — 呼び出し側でgetOrCreateEncryptionKeyを使うと、
// 既存の暗号化DBを二度と復号できない鍵で上書きしてしまう。
//
// 新旧どちらのスロットも見る。機種変更でiCloudから復元した端末には現行スロットだけが
// 来るが、アップデートしただけの端末には旧スロットしか無いこともある。
export async function getEncryptionKey(): Promise<string | null> {
  // 現行スロットの読み取り失敗は握り潰して旧スロットへ進む。ここで throw を
  // そのまま通すと、**旧スロットにしか鍵が無いユーザー**（この移行が救おうと
  // している当人）が、新スロットを足したせいで復号できなくなる。
  // 旧スロット側の失敗は握り潰さない — EncryptionKeyLostError と真の障害を
  // 区別できなくなるため。
  const current = await SecureStore.getItemAsync(KEY_NAME).catch(() => null);
  if (current) return current;
  return SecureStore.getItemAsync(LEGACY_KEY_NAME);
}

// SQLiteの暗号化パスフレーズとして使う。32バイトのランダム値を16進文字列化するため
// パスフレーズ自体に引用符等の特殊文字は含まれず、PRAGMA文へそのまま埋め込んで安全。
export async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await getEncryptionKey();
  if (existing) {
    // 複製は「次の機種変更のための備え」であって、DBを開く条件ではない。
    // ここで throw を通すと、鍵は正常に読めているのにキーチェーンへの書き込みが
    // 失敗しただけで起動不能になる（施錠中のバックグラウンド起動など）。
    // database.ts の2経路と同じく、失敗しても先へ進める。
    await ensureKeyIsBackupable(existing).catch(() => {});
    return existing;
  }

  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, key, {
    keychainAccessible: KEYCHAIN_ACCESSIBLE,
  });
  return key;
}

/**
 * 既存ユーザーの鍵を、バックアップに含まれる現行スロットへ複製する。
 *
 * **同じスロットに書き直しても保護属性は変わらない。** expo-secure-store の iOS 実装は
 * まず SecItemAdd を試し、既存項目があると errSecDuplicateItem を受けて SecItemUpdate に
 * 落ちるが、その更新辞書には kSecValueData しか入っていない（SecureStoreModule.swift）。
 * kSecAttrAccessible は据え置かれるため、keychainAccessible を変えて setItemAsync を
 * 呼んでも既存ユーザーには何の効果も無い。キーチェーン項目の主キーは
 * kSecAttrAccount（＝ここでのスロット名）なので、**別名で書けば新規追加**となり、
 * 指定した保護属性で作られる。それがスロットを2つ持つ理由。
 *
 * 旧スロットは消さない。「新スロットへ書けたことを確認してから旧を消す」順序でも
 * 安全ではあるが、消さなければ端末内に複製がもう1つ残るだけで害が無い一方、
 * 途中で失敗したときに鍵が1つも無くなる可能性を完全に排除できる。鍵の値は生成後に
 * 変化しないので、2つが食い違うこともない。
 *
 * 失敗してもDBは開けるので、呼び出し側は結果を待たなくてよい。
 *
 * 待たない代償として、getItemAsync と setItemAsync の間に deleteEncryptionKey()
 * が割り込むと、削除したはずの鍵が現行スロットに蘇りうる。ただし蘇るのは削除済みDBに
 * 対応する鍵で、次回起動時は開けずに同じ鍵で空DBが作り直されるだけなので実害は無い。
 */
export async function ensureKeyIsBackupable(key: string): Promise<void> {
  const current = await SecureStore.getItemAsync(KEY_NAME);
  if (current === key) return; // 移行済み
  await SecureStore.setItemAsync(KEY_NAME, key, {
    keychainAccessible: KEYCHAIN_ACCESSIBLE,
  });
}

/** 暗号化キーを削除する（DBリセット時、キーとDBファイルの不整合を解消するために使用） */
export async function deleteEncryptionKey(): Promise<void> {
  // 旧スロットを消し忘れると、リセット後の起動で古い鍵が拾われる。
  await SecureStore.deleteItemAsync(KEY_NAME);
  await SecureStore.deleteItemAsync(LEGACY_KEY_NAME);
}

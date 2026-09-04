import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Android で「暗号化DBだけが復元されて鍵が来ない」状態を作らないための回帰テスト。
 *
 * 背景: expo-secure-store は値を Android Keystore の鍵で暗号化して SharedPreferences に
 * 置くが、Keystore の鍵は端末外に持ち出せない。つまり iOS の案（鍵をキーチェーン経由で
 * 一緒に運ぶ）は Android では原理的に成立せず、代わりに「DB側もバックアップさせない」
 * ことで整合を取っている（案B）。この前提が崩れると、新端末に復号できないDBだけが
 * 復元され、ユーザーは全記録を失う。
 *
 * 守りは2重になっている。
 *  1. app.json の android.allowBackup=false（クラウドバックアップを止める）
 *  2. expo-secure-store が同梱する規則が `<include domain="sharedpref">` のみであること
 *     — Android の仕様上、include を1つでも書くと**書いたものだけ**がバックアップ/転送
 *     対象になるため、database / file ドメイン（DB本体とチャート画像）は自動的に外れる。
 *     端末間ダイレクト転送（device-transfer）は allowBackup では止まらないので、
 *     この2つ目が効いている。
 *
 * 2 は依存パッケージ側のファイルに乗っているだけなので、アップグレードで静かに
 * 変わりうる。変わったら気付けるようにここで固定する。
 */
const resDir = join(
  __dirname, '..', '..', '..',
  'node_modules', 'expo-secure-store', 'android', 'src', 'main', 'res', 'xml'
);

const readRules = (name: string) => readFileSync(join(resDir, name), 'utf8');

describe('Android Auto Backup の規則', () => {
  it('app.json でクラウドバックアップを無効にしている', () => {
    const appJson = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', 'app.json'), 'utf8')
    );
    expect(appJson.expo.android.allowBackup).toBe(false);
  });

  describe.each([
    ['secure_store_data_extraction_rules.xml'], // Android 12+（cloud-backup と device-transfer）
    ['secure_store_backup_rules.xml'],          // Android 11 以下
  ])('%s', (file) => {
    // 読み込みは it の中で行う。収集フェーズ（describe のコールバック本体）で読むと、
    // 依存パッケージの更新でファイルが移動したときに「規則が変わった」という
    // 分かりやすい失敗ではなく、スイート全体が収集時例外で落ちて原因が読めなくなる。
    it('include が sharedpref だけである（DBと画像を巻き込まない）', () => {
      const xml = readRules(file);
      const includes = [...xml.matchAll(/<include\s+domain="([^"]+)"/g)].map(m => m[1]);
      expect(includes.length).toBeGreaterThan(0);
      expect(new Set(includes)).toEqual(new Set(['sharedpref']));
    });

    it('SecureStore 自体は除外されている', () => {
      expect(readRules(file)).toContain('<exclude domain="sharedpref" path="SecureStore"/>');
    });
  });

  it('Android 12+ の規則は cloud-backup と device-transfer の両方を制限している', () => {
    const xml = readRules('secure_store_data_extraction_rules.xml');
    // device-transfer 側が抜けると、端末間ダイレクト転送でDBだけが新端末へ渡る。
    expect(xml).toContain('<cloud-backup>');
    expect(xml).toContain('<device-transfer>');
  });
});

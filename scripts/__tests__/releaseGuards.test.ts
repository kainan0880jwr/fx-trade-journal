/**
 * 配信前のガード2種（ビルド用・OTA用）が実際に止めることを固定する。
 *
 * **なぜ要るか。** `check-prod-keys.js` は 2026-09-17 まで
 *   - `eas update`（OTA）では一度も走らず
 *   - プレースホルダーかどうかしか見ず（Secret Key の誤投入を素通り）
 *   - 撮影モードを production プロファイルのときしか止めない
 * という3つの穴を抱えていた。OTA はこのプロジェクトの主要な配信経路で、
 * 手元の環境変数がプレースホルダーのまま配ると**課金と監視が同時に死に、
 * その事故自体が観測できない**。
 *
 * ガード自体にテストが無かったので、ここで固定する。
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ROOT = join(__dirname, '..', '..');

// 実行環境に残っている値がテストに漏れないよう、対象の変数は毎回明示的に消す。
// （撮影モードの環境変数が残ったシェルでテストを回すと、結果が変わってしまう）
const CLEARED: Record<string, string | undefined> = {
  EXPO_PUBLIC_RC_IOS_KEY: undefined,
  EXPO_PUBLIC_RC_ANDROID_KEY: undefined,
  EXPO_PUBLIC_SENTRY_DSN: undefined,
  EXPO_PUBLIC_SCREENSHOT_MODE: undefined,
  SCREENSHOT_BUILD: undefined,
  EAS_BUILD_PROFILE: undefined,
};

/** スクリプトを実行し、終了コードと出力を返す（throw しない） */
function run(script: string, env: Record<string, string>, args: string[] = []) {
  try {
    const out = execFileSync('node', [join(ROOT, 'scripts', script), ...args], {
      env: { ...process.env, ...CLEARED, ...env } as NodeJS.ProcessEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const VALID = {
  EXPO_PUBLIC_RC_IOS_KEY: 'appl_TestKeyNotReal',
  EXPO_PUBLIC_RC_ANDROID_KEY: 'goog_TestKeyNotReal',
  EXPO_PUBLIC_SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
};

describe('check-prod-keys（ビルド前のガード）', () => {
  it('正しい形式のキーなら通す', () => {
    expect(run('check-prod-keys.js', VALID).code).toBe(0);
  });

  it('Secret Key (sk_) はどのプロファイルでも中止する', () => {
    // EXPO_PUBLIC_* はバンドルにインラインされ全ユーザーに配られる。
    const r = run('check-prod-keys.js', { ...VALID, EXPO_PUBLIC_RC_IOS_KEY: 'sk_SecretNotReal12345' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('Secret Key');
  });

  it('iOS と Android のキーを取り違えたら中止する', () => {
    const r = run('check-prod-keys.js', { ...VALID, EXPO_PUBLIC_RC_IOS_KEY: 'goog_WrongPlatform' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('appl_');
  });

  it('撮影モードは production 以外のプロファイルでも中止する', () => {
    // 以前は production のときだけ止めていた。development ビルドでも撮影モードは
    // 動くので、そのビルドを渡した相手の記録が起動のたびに消える。
    const r = run('check-prod-keys.js', { ...VALID, EXPO_PUBLIC_SCREENSHOT_MODE: '1', EAS_BUILD_PROFILE: 'development' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('SCREENSHOT_MODE');
  });

  it('撮影ビルドは明示的なオプトインでのみ許可する', () => {
    const r = run('check-prod-keys.js', { ...VALID, EXPO_PUBLIC_SCREENSHOT_MODE: '1', SCREENSHOT_BUILD: '1' });
    expect(r.code).toBe(0);
  });

  it('production でキーが未設定なら中止する', () => {
    const r = run('check-prod-keys.js', { EAS_BUILD_PROFILE: 'production' });
    expect(r.code).toBe(1);
  });
});

describe('check-ota-bundle（OTA 前のガード）', () => {
  let dir: string;
  const bundle = (content: string) => {
    mkdirSync(join(dir, '_expo'), { recursive: true });
    writeFileSync(join(dir, '_expo', 'index.js'), content);
  };

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'otaguard-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('問題のないバンドルは通す', () => {
    bundle('var k="appl_LooksLikeARealKey";');
    expect(run('check-ota-bundle.js', {}, [dir]).code).toBe(0);
  });

  it('UUID v4 のテンプレートを誤検知しない', () => {
    // 依存ライブラリのバンドルに `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` が
    // 含まれており、`xxxxxxxx` 単体で探すと**正常なバンドルの配信を止めてしまう**
    // （2026-09-17 に実際に踏んだ）。誤検知するガードは、いずれ無視されるようになる。
    bundle('var t="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";var k="appl_LooksReal";');
    expect(run('check-ota-bundle.js', {}, [dir]).code).toBe(0);
  });

  it('Sentry DSN がプレースホルダーなら中止する', () => {
    bundle('var d="https://xxxxxxxx@o1.ingest.sentry.io/1";');
    const r = run('check-ota-bundle.js', {}, [dir]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('プレースホルダー');
  });

  it('プレースホルダーのキーが残っていたら中止する', () => {
    bundle('var k="appl_xxxxxxxxxxxx";');
    const r = run('check-ota-bundle.js', {}, [dir]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('プレースホルダー');
  });

  it('Secret Key が混ざっていたら中止する', () => {
    bundle('var k="sk_AbCdEfGhIjKlMnOpQrSt";');
    const r = run('check-ota-bundle.js', {}, [dir]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Secret Key');
  });

  it('撮影モードが有効なバンドルは中止する', () => {
    bundle('var e={"EXPO_PUBLIC_SCREENSHOT_MODE":"1"};');
    const r = run('check-ota-bundle.js', {}, [dir]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('撮影モード');
  });

  it('export していない（バンドルが無い）場合も中止する', () => {
    // 「検査が通った」と「検査するものが無かった」を取り違えないため。
    expect(run('check-ota-bundle.js', {}, [join(dir, 'missing')]).code).toBe(1);
    mkdirSync(join(dir, 'empty'));
    expect(run('check-ota-bundle.js', {}, [join(dir, 'empty')]).code).toBe(1);
  });
});

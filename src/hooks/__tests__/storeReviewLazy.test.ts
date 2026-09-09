import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `expo-store-review` をトップレベルで import していないことを固定する。
 *
 * `ExpoStoreReview.native.js` は `requireNativeModule('ExpoStoreReview')` を
 * **モジュール読み込み時**に評価するため、ネイティブモジュールを持たない
 * ビルドでは import した時点で例外になる。
 *
 * このフックは記録画面（app/trade/new.tsx）が読み込むので、トップレベルで
 * import すると **OTA でこの JS だけが先に届いた既存インストールで
 * 記録画面がまるごと開けなくなる**（runtimeVersion.policy は appVersion だが、
 * ネイティブ変更を伴わない修正を同じバージョンへ配ることは実際にある）。
 */
const SRC = readFileSync(join(__dirname, '..', 'useReviewPrompt.ts'), 'utf8');

describe('expo-store-review の読み込み', () => {
  it('トップレベルで import していない', () => {
    const topLevel = SRC.split('\n').filter((l) => /^import .*expo-store-review/.test(l));
    expect(topLevel).toEqual([]);
  });

  it('動的 import を使っていて、失敗を握り潰している', () => {
    expect(SRC).toMatch(/await import\('expo-store-review'\)/);
    // try/catch で囲われていること（catch が無いと OTA で落ちる）
    const fn = SRC.slice(SRC.indexOf('async function tryNativeReview'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
    expect(body).toMatch(/try \{[\s\S]*\} catch \{[\s\S]*return false;[\s\S]*\}/);
  });
});

/**
 * ペイウォールへ渡している source / feature が、集計側の既知値と一致することを固定する。
 *
 * **なぜ要るか。** 2026-09-17 に実測したところ、`settings` / `goals` / 画像上限からの
 * 流入がすべて `unknown` に丸められていた。`router.push` 側に文字列を書いても、
 * `paywallEvents.ts` の KNOWN_* に足し忘れると**黙って捨てられる**（型でも防げない。
 * params は string なので、型チェックを通り抜ける）。
 *
 * 落ちたときの直し方: `paywallEvents.ts` の PaywallSource / PremiumFeatureKey と
 * 対応する KNOWN_* Set に、呼び出し側で使っている値を追加すること。
 * 逆に呼び出し側の綴りが間違っているなら、そちらを直す。
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { normalizeSource, normalizeFeatureKey } from '../paywallEvents';

const ROOT = join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** `router.push({ pathname: '/paywall', params: { source: 'x', feature: 'y' } })` を拾う */
function collectPaywallParams(): { file: string; key: 'source' | 'feature'; value: string }[] {
  const found: { file: string; key: 'source' | 'feature'; value: string }[] = [];
  for (const file of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))]) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('/paywall')) continue;
    // pathname から続く200字の範囲に現れる source/feature の文字列リテラルを拾う
    const re = /['"]\/paywall['"][\s\S]{0,200}?\}/g;
    for (const block of text.match(re) ?? []) {
      for (const m of block.matchAll(/\b(source|feature)\s*:\s*['"]([a-z_]+)['"]/g)) {
        found.push({ file: file.replace(ROOT + '/', ''), key: m[1] as 'source' | 'feature', value: m[2] });
      }
    }
  }
  return found;
}

describe('ペイウォールの流入計測', () => {
  const params = collectPaywallParams();

  it('検出そのものが機能している（呼び出し箇所を1つ以上見つけられる）', () => {
    // この検査が空振りしていないことの確認。0件なら正規表現が壊れている。
    expect(params.length).toBeGreaterThanOrEqual(3);
  });

  it('渡している source がすべて既知の値（unknown に丸められない）', () => {
    const lost = params.filter(p => p.key === 'source' && normalizeSource(p.value) === 'unknown' && p.value !== 'unknown');
    expect(lost.map(p => `${p.file}: source='${p.value}'`)).toEqual([]);
  });

  it('渡している feature がすべて既知の値（unknown に丸められない）', () => {
    const lost = params.filter(p => p.key === 'feature' && normalizeFeatureKey(p.value) === 'unknown' && p.value !== 'unknown');
    expect(lost.map(p => `${p.file}: feature='${p.value}'`)).toEqual([]);
  });
});

/**
 * 「PRO で使える」と書いた機能が、本当に PRO でしか使えないことを固定する。
 *
 * **なぜ要るか。** 2026-09-19 まで `paywall_feature_mental` と `form_premium_hint` が
 * 11言語すべてで「ルール遵守チェック」を PRO の機能として挙げていたが、
 * `RuleChecklist`（app/trade/new.tsx）は `isPremium` を一切見ておらず、
 * クイック入力・詳細入力の両方で**無料ユーザーにも表示されていた**。
 *
 * これは単なる誤字ではない。買った人が「これ前から使えたのでは」となる種類の
 * 齟齬で、ペイウォールの信頼を直接削る（購入タップが全件キャンセルという実測の
 * 文脈では特に無視できない）。型でもレビューでも捕まらないので機械的に止める。
 *
 * 落ちたときの直し方:
 * - ルールを PRO にしたのなら、RuleChecklist を PRO セクション内へ移してから文言を戻す
 * - 文言だけ戻したのなら、それは嘘なので消す
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const FORM = join(ROOT, 'app', 'trade', 'new.tsx');

const LOCALES = ['ja', 'en', 'de', 'es', 'fr', 'it', 'pt', 'tr', 'hi', 'vi', 'id'] as const;

/** PRO の中身を説明している文言。ここに書いたものは PRO でしか使えないこと。 */
const PRO_CLAIM_KEYS = ['paywall_feature_mental', 'form_premium_hint'] as const;

/** 各言語での「ルール」。小文字化して部分一致で見る。 */
const RULE_WORDS = [
  'ルール',      // ja
  'rule',        // en
  'regel',       // de
  'regla',       // es
  'règle', 'regle', // fr
  'regol',       // it
  'regra',       // pt
  'kural',       // tr
  'नियम',        // hi
  'quy tắc',     // vi
  'aturan',      // id
];

/**
 * `{isPremium && premiumOpen && (` から始まる PRO セクションの中身を取り出す。
 * 括弧の深さを数えるだけの素朴な実装だが、対象が1ファイルの1箇所なので十分。
 */
function proSection(source: string): string {
  const marker = '{isPremium && premiumOpen && (';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('PRO セクションの開始が見つかりません（構造が変わった可能性）');
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('PRO セクションの終端が見つかりません');
}

describe('PRO の訴求文言と実際のゲート', () => {
  const formSource = readFileSync(FORM, 'utf8');

  it('検出そのものが機能している（RuleChecklist が記録画面にある）', () => {
    expect(formSource).toContain('<RuleChecklist');
  });

  it('ルール遵守チェックは PRO セクションの外にある（＝無料で使える）', () => {
    expect(proSection(formSource)).not.toContain('RuleChecklist');
  });

  it.each(LOCALES)('%s: PRO の訴求文言がルール遵守チェックを挙げていない', locale => {
    const source = readFileSync(join(ROOT, 'src', 'i18n', `${locale}.ts`), 'utf8');
    for (const key of PRO_CLAIM_KEYS) {
      const match = source.match(new RegExp(`^\\s*${key}:\\s*(['"])(.*?)\\1,?$`, 'm'));
      expect(match).not.toBeNull();
      const value = match![2].toLowerCase();
      const hit = RULE_WORDS.find(w => value.includes(w));
      expect(hit ? `${key}: ${match![2]}` : null).toBeNull();
    }
  });
});

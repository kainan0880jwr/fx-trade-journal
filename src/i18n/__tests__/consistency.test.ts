import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 11言語の翻訳ファイルの整合を機械的に見る。
 *
 * キーの過不足は `LangStrings` 型が防いでくれるが、**プレースホルダの食い違い**と
 * **翻訳漏れ（日本語の残留）**は型では防げない。どちらもその言語のユーザーにだけ
 * 壊れた表示が出るので、日本語で開発している限り気づけない。
 *
 * 実際、法務文書のほうでは「全言語版から削除したはず」の記述が5言語にしか
 * 適用されておらず、6言語に取り残されていた事例が2件あった。同じことは
 * i18n でも起こる。
 */
const LANGS = ['ja', 'en', 'de', 'fr', 'es', 'it', 'id', 'tr', 'hi', 'vi', 'pt'] as const;
const DIR = join(__dirname, '..');

function readSource(lang: string): string {
  return readFileSync(join(DIR, `${lang}.ts`), 'utf8');
}

/** `  key: '値',` の1行定義だけを拾う（配列や複数行の値は対象外）。 */
function parseSingleLine(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /^ {2}(\w+): ('([^']*)'|"([^"]*)"),$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out[m[1]] = m[3] !== undefined ? m[3] : m[4];
  }
  return out;
}

function keyNames(src: string): Set<string> {
  return new Set([...src.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
}

const SOURCES = Object.fromEntries(LANGS.map((l) => [l, readSource(l)])) as Record<string, string>;
const VALUES = Object.fromEntries(LANGS.map((l) => [l, parseSingleLine(SOURCES[l])])) as Record<
  string,
  Record<string, string>
>;

describe('翻訳ファイルの整合', () => {
  it('全言語のキーが一致する', () => {
    const base = [...keyNames(SOURCES.ja)].sort();
    for (const lang of LANGS) {
      expect({ lang, keys: [...keyNames(SOURCES[lang])].sort() }).toEqual({ lang, keys: base });
    }
  });

  it('プレースホルダが言語間で一致する', () => {
    // {n} や {date} が欠けたり増えたりすると、その言語だけ置換されない文字列が
    // そのまま画面に出る（例:「最大{n}枚」）。
    const placeholders = (s: string) => [...new Set(s.match(/\{[a-zA-Z]+\}/g) ?? [])].sort();
    const problems: string[] = [];
    for (const key of Object.keys(VALUES.ja)) {
      const ref = placeholders(VALUES.ja[key]);
      for (const lang of LANGS) {
        const v = VALUES[lang][key];
        if (v === undefined) continue;
        const got = placeholders(v);
        if (got.join(',') !== ref.join(',')) {
          problems.push(`${key}: ja=${ref.join('') || 'なし'} ${lang}=${got.join('') || 'なし'}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('ブランド名の旧表記が残っていない', () => {
    // 2026-09-09 時点で、同一ファイルの中で `FX Trade Journal` / `FX Trade Log` /
    // `FXトレード日記` が混在していた。オンボーディングで "Welcome to FX Trade Journal"
    // と名乗った直後にヘッダーが "FX Trade Log" になる、という状態。
    // ストアのタイトルは全ロケール `FX Trade Journal` なので、そちらに寄せてある。
    //
    // 注意: RevenueCat の entitlement id `FXトレード日記 Pro`（purchaseStore.ts）は
    // 内部IDなので**絶対に変えない**。ここが対象にしているのは表示文字列だけ。
    const OLD = ['FX Trade Log', 'FXトレード日記'];
    const problems: string[] = [];
    for (const lang of LANGS) {
      const src = readSource(lang);
      for (const old of OLD) {
        if (src.includes(old)) problems.push(`${lang}.ts に「${old}」が残っている`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('アプリ名が全言語で1つに決まっている', () => {
    const names = Object.fromEntries(LANGS.map((l) => [l, VALUES[l].app_name]));
    const nonJa = new Set(LANGS.filter((l) => l !== 'ja').map((l) => names[l]));
    // 日本語だけ `FXトレードログ`（定着済み・ストアタイトルも同じ）、他10言語は英語名で統一。
    expect({ ja: names.ja, others: [...nonJa] }).toEqual({
      ja: 'FXトレードログ',
      others: ['FX Trade Journal'],
    });
  });

  it('有料版の呼称が PRO に統一されている', () => {
    // 設定画面は "FX Trade Journal PRO"、課金画面は "FX Trade Journal Premium" と
    // 割れていた。ストアの説明文が既に PRO なので、そちらに寄せてある。
    // 変数名や型名（isPremium / PremiumGate / premium_* のキー名）は対象外 —
    // ここが見ているのは**ユーザーに見える値**だけ。
    const OLD = ['Premium', 'プレミアム', 'प्रीमियम'];
    const problems: string[] = [];
    for (const lang of LANGS) {
      for (const [key, v] of Object.entries(VALUES[lang])) {
        for (const old of OLD) if (v.includes(old)) problems.push(`${lang}/${key}: ${v.slice(0, 40)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('日本語以外の言語に日本語が残っていない', () => {
    const jp = /[ぁ-んァ-ヴ一-龥]/;
    const problems: string[] = [];
    for (const lang of LANGS) {
      if (lang === 'ja') continue;
      for (const [key, v] of Object.entries(VALUES[lang])) {
        if (jp.test(v)) problems.push(`${lang}/${key}: ${v.slice(0, 40)}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

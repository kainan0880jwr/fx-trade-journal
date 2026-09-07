import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * 11言語の法務文書（プライバシーポリシー・利用規約）の構造が揃っていることを固定する。
 *
 * 2026-09-06 までに、**「全言語版から削除したはず」の記述が一部言語にだけ
 * 取り残されている**事例が3件見つかった。
 *   - 削除済みのアフィリエイト機能の記述が6言語のポリシーと規約に残存
 *   - 運営者の自宅住所が5言語のポリシーで公開されたまま
 *   - 節番号がずれた結果、追記が別の節に混入し、相互参照も壊れた
 *
 * いずれも「日本語版を直して満足した」ことが原因で、日本語で作業している限り
 * 気づけない。節の数と番号の連続性だけでも機械的に見ておけば、次は検出できる。
 */
const ROOT = join(__dirname, '..', '..');

function sections(file: string): number[] {
  const html = readFileSync(join(ROOT, file), 'utf8');
  return [...html.matchAll(/<h2>[^<]*?(\d+)[^<]*?<\/h2>/g)].map((m) => Number(m[1]));
}

function filesFor(prefix: string): string[] {
  return readdirSync(ROOT)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.html'))
    .sort();
}

describe.each([
  ['プライバシーポリシー', 'privacy-policy'],
  ['利用規約', 'terms'],
])('%s', (_label, prefix) => {
  const files = filesFor(prefix);

  it('11言語ぶん存在する', () => {
    expect(files).toHaveLength(11);
  });

  it('全言語で節（条）の数が一致する', () => {
    const counts = files.map((f) => `${f}: ${sections(f).length}`);
    const unique = new Set(files.map((f) => sections(f).length));
    // 落ちたら: どれか1言語だけ節が増減している。過去3回ともこの形で壊れた。
    expect({ unique: [...unique], counts }).toEqual({ unique: [...unique].slice(0, 1), counts });
  });

  it('全言語で節番号が 1 から連番になっている', () => {
    for (const f of files) {
      const nums = sections(f);
      expect({ f, nums }).toEqual({ f, nums: nums.map((_, i) => i + 1) });
    }
  });
});

describe('個人情報の混入', () => {
  it('法務文書とLPに住所・電話番号が含まれていない', () => {
    // 一度公開してしまうと取り消せない。追記のたびに戻っていないか見る。
    //
    // **検出したい文字列そのものをここに書かないこと。** このファイルは公開
    // リポジトリに入るので、リテラルで書くと「個人情報を消すためのテスト」が
    // 個人情報を持ち込むことになる。分割して結合し、素朴な検索に引っかからない形にする。
    const PATTERNS = [
      new RegExp(['Neg', 'oro'].join(''), 'i'),
      new RegExp(['根', '来'].join('')),
      new RegExp(['649', '-?', '6202'].join('')),
      // 日本の携帯番号の形。特定の番号ではなく形で見る。
      /\+?81[- ]?[789]0[- ]?\d{4}[- ]?\d{4}/,
    ];
    const html = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
    const hits: string[] = [];
    for (const f of html) {
      const body = readFileSync(join(ROOT, f), 'utf8');
      for (const p of PATTERNS) {
        if (p.test(body)) hits.push(`${f}: ${p}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

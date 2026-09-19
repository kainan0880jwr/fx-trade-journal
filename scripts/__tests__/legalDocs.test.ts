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

describe('CSP', () => {
  it('リポジトリ直下の全HTMLに Content-Security-Policy がある', () => {
    // LP 12枚には元からあったが、法務ページ35枚には1枚も無かった。
    // 現状は完全静的なので単独では悪用できないが、ビルドを入れる（Astro等）と
    // 依存1つの汚染でHTMLに任意スクリプトが混入しうる。CSPはそこで効く多層防御。
    // 法務ページは App Store の審査から参照され、ユーザーが「安全な情報」として読む面でもある。
    const files = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
    const missing = files.filter((f) => !readFileSync(join(ROOT, f), 'utf8').includes('Content-Security-Policy'));
    expect({ total: files.length, missing }).toEqual({ total: files.length, missing: [] });
  });

  it('CSP がスクリプトを塞いでいる', () => {
    const files = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
    const bad: string[] = [];
    for (const f of files) {
      const html = readFileSync(join(ROOT, f), 'utf8');
      const csp = html.match(/Content-Security-Policy" content="([^"]*)"/)![1];
      // script が許されるのは 'self' と GA のドメインまで。'unsafe-inline'/'unsafe-eval' は不可。
      if (/unsafe-inline|unsafe-eval/.test(csp.split(';').find((d) => d.includes('script-src')) ?? '')) bad.push(f);
      if (!/script-src|default-src 'none'/.test(csp)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});

/**
 * 有料プランの呼称が全言語で PRO に統一されていることを固定する。
 *
 * **これは同種の「一部だけ直した」事故の4件目。** 2026-09-09 にアプリ内の表示文字列を
 * PRO へ統一したが（`consistency.test.ts` が i18n だけを見ている）、**法務文書11言語・
 * 特商法表記・ASC の商品名は「プレミアム／Premium」のまま**だった。ユーザーは購入画面で
 * 「PRO」を買い、規約を開くと別名の商品しか書かれていない、という状態になる。
 *
 * ただし**「旧称：プレミアム」の併記だけは意図的に残す。** 既存の購読者は Premium という
 * 名前で契約しており、規約上で新旧の名前を結び付けておく必要がある。
 */
describe('有料プランの呼称', () => {
  // 各言語の「旧称」併記。ここに列挙したものだけが残留を許される。
  const FORMERLY = [
    '（旧称：プレミアム）', '(formerly Premium)', '(früher Premium)',
    '(anciennement Premium)', '(anteriormente Premium)', '(precedentemente Premium)',
    '(sebelumnya Premium)', '(eski adıyla Premium)', '(trước đây là Premium)',
    '(पहले प्रीमियम)',
  ];

  const targets = [
    ...filesFor('terms'),
    ...filesFor('privacy-policy'),
    ...filesFor('support'),
    'tokushoho.html',
  ];

  it('検出そのものが機能している（対象ファイルを見つけられる）', () => {
    expect(targets.length).toBeGreaterThanOrEqual(23);
  });

  it('法務文書に「プレミアム／Premium」が残っていない（旧称の併記を除く）', () => {
    const offenders: string[] = [];
    for (const file of targets) {
      let html = readFileSync(join(ROOT, file), 'utf8');
      for (const ok of FORMERLY) html = html.split(ok).join('');
      const hits = html.match(/プレミアム|Premium|प्रीमियम/g);
      if (hits) offenders.push(`${file}: ${hits.length} 箇所`);
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Android（Google Play）の解約手順が全言語に書かれていることを固定する。
 *
 * **Google Play でも配信しているのに、規約・サポートの解約手順が Apple のものだけ**
 * だった（2026-09-17 発見）。Android ユーザーにとって、規約は「解約方法が書かれていない
 * 文書」になっていた。特商法11条（役務提供契約の解除に関する事項）と Google Play の
 * サブスクリプションポリシーの双方が解約方法の明示を求めている。
 *
 * 返金条項も同様に App Store だけに言及している言語が9つあった。
 */
describe('Android の解約手順', () => {
  const targets = [...filesFor('terms'), ...filesFor('support')];

  it('検出そのものが機能している', () => {
    expect(targets.length).toBeGreaterThanOrEqual(22);
  });

  it('全言語の規約・サポートに Google Play の解約経路がある', () => {
    const missing = targets.filter((f) => {
      const html = readFileSync(join(ROOT, f), 'utf8');
      return !/Google Play Store|Google Play ストア/.test(html);
    });
    expect(missing).toEqual([]);
  });

  it('返金について触れる条項が App Store だけを指していない', () => {
    const offenders: string[] = [];
    const refund = /refund|Rückerstattung|reembolso|remboursement|rimborso|pengembalian dana|para iadesi|hoàn tiền|रिफंड|返金/i;
    for (const f of filesFor('terms')) {
      const html = readFileSync(join(ROOT, f), 'utf8');
      for (const m of html.matchAll(/<li>[^<]{0,300}<\/li>/g)) {
        const t = m[0];
        if (refund.test(t) && t.includes('App Store') && !t.includes('Google')) {
          offenders.push(f);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
  it('特商法表記の販売価格が LP の価格カードと一致する', () => {
    // 特商法11条の「販売価格」は法定表示で、実際の課金額と一致していなければならない。
    // 2026-09-19 の年額改定（¥5,000 → ¥3,980）で tokushoho.html だけ更新から漏れており、
    // 「LPは新価格・特商法は旧価格」という状態を一度作った。人力の突き合わせでは再発する。
    const lp = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const [monthly, yearly] = [...lp.matchAll(/<span class="pp-value mono">¥([\d,]+)/g)].map((m) => m[1]);
    expect({ monthly, yearly }).toEqual({ monthly: expect.any(String), yearly: expect.any(String) });

    const tokushoho = readFileSync(join(ROOT, 'tokushoho.html'), 'utf8');
    const prices = [...tokushoho.matchAll(/([\d,]+)円（税込）/g)].map((m) => m[1]);
    expect({ prices, expected: [monthly, yearly] })
      .toEqual({ prices: expect.arrayContaining([monthly, yearly]), expected: [monthly, yearly] });

    // 旧価格が本文のどこかに残っていないこと（トライアル移行先の金額など）
    const stale = [...tokushoho.matchAll(/([\d,]+)円/g)].map((m) => m[1])
      .filter((p) => p !== monthly && p !== yearly);
    expect({ stale }).toEqual({ stale: [] });
  });
});

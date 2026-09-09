import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * LP 11言語（index.html + index-*.html）の構造・リンク・注記が揃っていることを固定する。
 *
 * 法務文書側では `legalDocs.test.ts` が同じ役割を担っている。LP 本体には同種の
 * 検査が無く、実際に以下のズレが放置されていた（2026-09-09 のレビューで発見）:
 *   - de/fr/it/es の App Store リンク24本が、**配信していない**EUのストアフロントを指していた
 *   - `<title>` と OGP だけ旧コピー（効果を示唆する文言）が10言語に残っていた
 *   - `region-notice` の位置が 6ファイルは header の前、5ファイルは後ろに割れていた
 *   - 同意バナーの `aria-label` が vi/pt で英語のまま（スクリーンリーダーにしか出ないため目視不可）
 *
 * いずれも「日本語版を見ている限り気づけない」種類の不具合で、
 * 11ファイルを手で維持する構造がある限り再発する。
 */
const ROOT = join(__dirname, '..', '..');
const APP_ID = '6786188634';

const LP_FILES = readdirSync(ROOT)
  .filter((f) => f === 'index.html' || (f.startsWith('index-') && f.endsWith('.html')))
  .sort();

const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const langOf = (f: string) => (f === 'index.html' ? 'ja' : f.slice('index-'.length, -'.html'.length));

describe('LP 11言語', () => {
  it('11ファイル存在する', () => {
    expect(LP_FILES).toHaveLength(11);
  });

  describe.each(LP_FILES)('%s', (file) => {
    const html = read(file);
    const lang = langOf(file);

    it('App Store リンクに国コードが入っていない', () => {
      // 国コード付きURLは、その国で配信していないと「ご利用いただけません」に着地する。
      // EU（de/fr/it/es）向けページで実際に起きていた。地域中立URLなら
      // Apple が閲覧者のストアフロントへ振り分けるので、配信国表と同期する必要が無くなる。
      const withCountry = html.match(new RegExp(`apps\\.apple\\.com/[a-z]{2}/app/id${APP_ID}`, 'g'));
      expect({ file, withCountry }).toEqual({ file, withCountry: null });
    });

    it('CTA の App Store リンクに ct（キャンペーントークン）が付いている', () => {
      // ASC の App Analytics で流入元を分けて見るために要る。これが無いと
      // 「LPを直したらインストールが増えた」を検証できない。
      const hrefs = [...html.matchAll(new RegExp(`href="https://apps\\.apple\\.com/app/id${APP_ID}([^"]*)"`, 'g'))].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const q of hrefs) expect({ file, q }).toEqual({ file, q: `?ct=lp-${lang}` });
    });

    it('gtag.js を静的に読み込んでいない', () => {
      // head に置くと、同意を拒否した人でも取得リクエストが Google に飛び、
      // IP・User-Agent・Referer が渡る。同意後に consent.js が動的注入する。
      expect(html).not.toMatch(/<script[^>]*googletagmanager\.com\/gtag\/js/);
    });

    it('同意の撤回リンクがある', () => {
      // 「同意は撤回と同じくらい容易でなければならない」（LGPD 8条5項 / インドDPDP法 6条 ほか）。
      expect(html).toContain('id="consentReset"');
    });

    it('Smart App Banner がある', () => {
      expect(html).toContain(`content="app-id=${APP_ID}`);
    });

    it('region-notice が header より後にある', () => {
      // 配信対象国の訪問者が最初に読む文が「この地域では配信していません」に
      // ならないようにする。11ファイルで位置を揃える。
      const rn = html.indexOf('class="region-notice"');
      const hdr = html.indexOf('</header>');
      expect({ file, ok: rn > hdr && rn > 0 }).toEqual({ file, ok: true });
    });

    it('title / og:title / twitter:title が一致している', () => {
      // 本文だけ直して head に届かない、という壊れ方を実際にした。
      const title = html.match(/<title>([^<]*)<\/title>/)![1];
      const og = html.match(/property="og:title" content="([^"]*)"/)![1];
      const tw = html.match(/name="twitter:title" content="([^"]*)"/)![1];
      expect({ file, og, tw }).toEqual({ file, og: title, tw: title });
    });

    it('title に効果・成果を断定する語が入っていない', () => {
      // 記録アプリについて「勝率が上がる」と読める表現は景表法5条1号（優良誤認）の
      // 典型。`<title>` と OGP は検索結果とSNSカードに出るので本文より露出が大きい。
      const title = html.match(/<title>([^<]*)<\/title>/)![1].toLowerCase();
      const banned = ['builds the next win rate', 'raise your win rate', 'tasa de acierto', 'trefferquote',
        'taux de réussite', 'win rate.', 'kazanma oranı', 'tỷ lệ thắng', 'taxa de acerto'];
      expect({ file, hit: banned.filter((w) => title.includes(w)) }).toEqual({ file, hit: [] });
    });

    it('モック画面の注記（sample-note）が5箇所ある', () => {
      // ヒーローの浮きバッジ・スマホ枠・分析・シェアカード・ウィジェットの5箇所。
      // 数値の近くに注記が無い状態は優良誤認と受け取られうる。
      expect({ file, n: (html.match(/class="sample-note[" ]/g) ?? []).length }).toEqual({ file, n: 5 });
      // 浮きバッジ（勝率・PF）はスマホ枠の外にあり、枠内の注記からは視覚的に離れている。
      expect({ file, chipNote: html.includes('sample-note chip-note') }).toEqual({ file, chipNote: true });
    });

    it('モックの成績数値が11言語で同一、かつ実スクショと一致する', () => {
      // 現実離れした数値（旧: 勝率78% / PF7.75）を出すと打消し表示が要る。
      // 実スクショを載せたので、残るモック（浮きバッジ・シェアカード・ウィジェット）は
      // スクショと同じデモデータに揃える。食い違うとページ内で矛盾する。
      // ストアのスクリーンショットとも同じ数字になっている。
      expect({ file, w: (html.match(/59\.1%/g) ?? []).length, pf: (html.match(/2\.09/g) ?? []).length })
        .toEqual({ file, w: 3, pf: 3 });
      expect(html).not.toMatch(/78%|7\.75|62%|1\.50/);
    });

    it('製品スクリーンショットが3枚あり、参照先が実在する', () => {
      // LPには <img> の製品画面が1枚も無く、手書きモックだけだった。
      const lang = langOf(file);
      for (const role of ['home', 'analysis', 'entry']) {
        const webp = `lp-assets/shots/${role}-${lang}.webp`;
        const avif = `lp-assets/shots/${role}-${lang}.avif`;
        expect({ file, role, ref: html.includes(webp) && html.includes(avif) })
          .toEqual({ file, role, ref: true });
        for (const p of [webp, avif]) {
          expect({ p, exists: existsSync(join(ROOT, p)) }).toEqual({ p, exists: true });
        }
      }
      // 幅・高さが無いと読み込み前に場所が確保されず CLS が出る
      const imgs = [...html.matchAll(/<img class="shot"[^>]*>/g)].map((m) => m[0]);
      expect({ file, n: imgs.length }).toEqual({ file, n: 3 });
      for (const img of imgs) {
        expect({ file, wh: /width="\d+" height="\d+"/.test(img), alt: /alt="[^"]{10,}"/.test(img) })
          .toEqual({ file, wh: true, alt: true });
      }
      // ヒーローだけ eager（LCP要素）、残りは lazy
      expect((html.match(/loading="eager"/g) ?? []).length).toBe(1);
      expect((html.match(/loading="lazy"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });

    it('同意バナーの aria-label が翻訳されている', () => {
      // スクリーンリーダーにしか出ないので目視では見つからない。
      const label = html.match(/id="consentBanner"[^>]*aria-label="([^"]*)"/)
        ?? html.match(/aria-label="([^"]*)"[^>]*id="consentBanner"/);
      expect({ file, found: label !== null }).toEqual({ file, found: true });
      if (lang !== 'en') expect({ file, label: label![1] }).not.toEqual({ file, label: 'Consent for analytics' });
    });

    it('hreflang が11言語 + x-default 揃っている', () => {
      const codes = [...html.matchAll(/hreflang="([^"]*)"/g)].map((m) => m[1]).sort();
      expect({ file, n: codes.length }).toEqual({ file, n: 12 });
      expect(codes).toContain('x-default');
    });

    it('canonical が自分自身を指している', () => {
      const canonical = html.match(/rel="canonical" href="([^"]*)"/)![1];
      const expected = file === 'index.html' ? '/' : `/${file}`;
      expect({ file, ok: canonical.endsWith(expected) }).toEqual({ file, ok: true });
    });

    it('参照している相対HTMLリンクが実在する', () => {
      const links = [...html.matchAll(/href="([a-z0-9-]+\.html)"/g)].map((m) => m[1]);
      const missing = [...new Set(links)].filter((l) => !readdirSync(ROOT).includes(l));
      expect({ file, missing }).toEqual({ file, missing: [] });
    });
  });

  it('全11ファイルでセクションの骨格（class と id）が一致する', () => {
    // タグ骨格が揃っていれば、「一部言語にだけ節が残っている / 抜けている」を検出できる。
    // id だけを見ると id を持たない section（hero / problem / stat-band / final-cta）を
    // 取りこぼすので、class も含めて比べる。
    const skeletonOf = (f: string) =>
      [...read(f).matchAll(/<section([^>]*)>/g)]
        .map((m) => {
          const cls = m[1].match(/class="([^"]*)"/)?.[1] ?? '';
          const id = m[1].match(/id="([^"]*)"/)?.[1] ?? '';
          return `${cls}#${id}`;
        })
        .join(' | ');
    const base = skeletonOf('index.html');
    const diff = LP_FILES.filter((f) => skeletonOf(f) !== base)
      .map((f) => ({ file: f, skeleton: skeletonOf(f) }));
    expect({ base, diff }).toEqual({ base, diff: [] });
  });

  it('全11ファイルで主要ブロックの数が一致する', () => {
    // section 以外の繰り返し要素も揃っていることを見る。
    const countsOf = (f: string) => {
      const h = read(f);
      const n = (re: RegExp) => (h.match(re) ?? []).length;
      return {
        panel: n(/class="panel"/g),
        priceplan: n(/class="pp-value"/g),
        faq: n(/<details/g),
        floatChip: n(/class="float-chip/g),
        footCol: n(/class="foot-col"/g),
      };
    };
    const base = countsOf('index.html');
    const diff = LP_FILES.filter((f) => JSON.stringify(countsOf(f)) !== JSON.stringify(base))
      .map((f) => ({ file: f, ...countsOf(f) }));
    expect({ base, diff }).toEqual({ base, diff: [] });
  });
});

describe('LP のコントラスト（WCAG AA）', () => {
  // アプリ本体は src/theme/__tests__/contrast.test.ts で同じ検査をしている。
  // LP 側には無く、アプリで潰した「白 on アクセント = 3.71:1」がそのまま残っていた。
  const css = readFileSync(join(ROOT, 'lp-assets', 'style.css'), 'utf8');

  const lum = (hex: string) => {
    const v = hex.replace('#', '').match(/../g)!.map((h) => parseInt(h, 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** rgba のティントを下地に合成する */
  const over = (tint: [number, number, number], alpha: number, base: string) => {
    const b = base.replace('#', '').match(/../g)!.map((h) => parseInt(h, 16));
    return '#' + tint.map((t, i) => Math.round(t * alpha + b[i] * (1 - alpha))
      .toString(16).padStart(2, '0')).join('');
  };

  /** 指定ブロックからトークンを読む */
  const tokens = (blockRe: RegExp) => {
    const block = css.match(blockRe)![0];
    const get = (name: string) => block.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))![1];
    return { get };
  };
  const dark = tokens(/:root\{[\s\S]*?\n\}/);
  const light = tokens(/@media \(prefers-color-scheme: light\)\{[\s\S]*?\n  \}/);

  it('アクセント塗りの上の前景（--on-accent）が 4.5:1 以上', () => {
    for (const [name, t] of [['dark', dark], ['light', light]] as const) {
      const r = ratio(t.get('on-accent'), t.get('accent'));
      expect({ name, ok: r >= 4.5, r: Number(r.toFixed(2)) }).toEqual({ name, ok: true, r: Number(r.toFixed(2)) });
    }
  });

  it('ライトの --profit / --loss が全ての面で 4.5:1 以上（ティント合成込み）', () => {
    const faces = ['surface', 'surface-2', 'bg', 'bg-alt'].map((n) => light.get(n));
    const cases: Array<[string, string, [number, number, number], number]> = [
      ['profit', light.get('profit'), [19, 148, 108], 0.12],
      ['loss', light.get('loss'), [217, 60, 49], 0.10],
    ];
    for (const [name, fg, tint, alpha] of cases) {
      for (const face of faces) {
        for (const bg of [face, over(tint, alpha, face)]) {
          const r = Number(ratio(fg, bg).toFixed(2));
          expect({ name, face, bg, ok: r >= 4.5, r }).toEqual({ name, face, bg, ok: true, r });
        }
      }
    }
  });

  it('図形用の --profit-large / --loss-large が輝度で判別できる（相互比 1.2 以上）', () => {
    // 文字用の --profit/--loss は AA を満たすまで濃くした結果、ライトで
    // 相互比が 1.00 になる。符号を持たないローソク足では勝敗が判別できない。
    const r = ratio(light.get('profit-large'), light.get('loss-large'));
    expect({ ok: r >= 1.2, r: Number(r.toFixed(2)) }).toEqual({ ok: true, r: Number(r.toFixed(2)) });
  });

  it('アクセント塗りの上に #fff を直書きしていない', () => {
    expect(css).not.toMatch(/color:\s*#fff\b/i);
  });
});

describe('LP の JS が落ちても本文が読めること', () => {
  // コメント内にも `.reveal{opacity:0}` という文字列があるので、規則だけを見る
  const css = readFileSync(join(ROOT, 'lp-assets', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const main = readFileSync(join(ROOT, 'lp-assets', 'main.js'), 'utf8');

  it('.reveal を隠す規則が `.js` 配下にある', () => {
    // 素の `.reveal{opacity:0}` にすると、main.js が例外で止まった瞬間に
    // 問題提起・機能・料金・FAQ・最終CTA が丸ごと消え、
    // App Store への導線も全部無くなる。
    expect(css).toMatch(/\.js \.reveal\{opacity:0/);
    // `.js ` が前に付いていない `.reveal{opacity:0` が無いこと
    expect(css).not.toMatch(/(?<!\.js )\.reveal\{opacity:0/);
  });

  it('boot.js が全ページでスタイルシートより前に読まれる', () => {
    for (const file of [...LP_FILES, 'fx-trade-journal-guide.html']) {
      const html = read(file);
      const boot = html.indexOf('lp-assets/boot.js');
      const style = html.indexOf('lp-assets/style.css');
      expect({ file, ok: boot > 0 && boot < style }).toEqual({ file, ok: true });
    }
  });

  it('reveal の登録が、壊れやすい装飾処理より前にある', () => {
    const reveal = main.indexOf("querySelectorAll('.reveal')");
    const ticker = main.indexOf('buildTicker()');
    const candles = main.indexOf('drawCandles(document.getElementById');
    expect({ reveal: reveal > 0, beforeTicker: reveal < ticker, beforeCandles: reveal < candles })
      .toEqual({ reveal: true, beforeTicker: true, beforeCandles: true });
  });

  it('ティッカーとキャンバスの呼び出しが try/catch で囲われている', () => {
    expect(main).toMatch(/try \{ buildTicker\(\); \} catch/);
    expect(main).toMatch(/try \{ drawCandles\(document\.getElementById\('heroChart'\)[^)]*\); \} catch/);
  });

  it('requestAnimationFrame のループが多重起動しない', () => {
    // 以前は setTimeout(2600) からの再開と IntersectionObserver の再表示が
    // どちらも rAF を呼んでおり、画面外へスクロールして戻すたびにループが倍増した。
    expect(main).toMatch(/if\(rafId !== null \|\| timerId !== null\) return;/);
  });

  it('色トークンを描画ループの中で読み直していない', () => {
    // getComputedStyle は同期の強制スタイル再計算。以前は 1フレームあたり68回、
    // キャンバス2枚ぶんを 60fps で呼んでいた。
    expect(main).toMatch(/if\(!\(name in colorCache\)\)/);
    const render = main.slice(main.indexOf('function render()'));
    const body = render.slice(0, render.indexOf('\n    }\n'));
    expect({ getVarInLoop: (body.match(/getVar\(/g) ?? []).length }).toEqual({ getVarInLoop: 2 });
  });
});

describe('LP・記事の細かい約束事', () => {
  it('モック内に押せない <button> が無い', () => {
    // BUY/SELL などの装飾は押しても何も起きないのに実 button だったため、
    // キーボード操作のユーザーが無反応のボタンに引っかかっていた。
    for (const file of LP_FILES) {
      const ids = [...read(file).matchAll(/<button[^>]*id="([^"]*)"/g)].map((m) => m[1]);
      const all = (read(file).match(/<button/g) ?? []).length;
      // 実ボタンは同意バナーの2つだけ
      expect({ file, all, ids: ids.sort() }).toEqual({ file, all: 2, ids: ['consentAccept', 'consentDecline'] });
    }
  });

  it('著作権表記が権利主体（個人名）で統一されている', () => {
    for (const file of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
      const hits = [...readFileSync(join(ROOT, file), 'utf8').matchAll(/© 2026[^<\n]*/g)].map((m) => m[0].trim());
      for (const h of hits) expect({ file, h }).toEqual({ file, h: '© 2026 Daiki Ikebata' });
    }
  });

  it('地域を絞る言語タグが hreflang・表示・<html lang> で揃っている', () => {
    // pt はブラジル、es は中南米が配信対象。素の pt / es だと
    // 非配信国（ポルトガル・スペイン）まで含んでしまう。
    for (const file of LP_FILES) {
      const html = read(file);
      expect({ file, pt: /lang="pt-BR"[^>]*>Português \(Brasil\)/.test(html) }).toEqual({ file, pt: true });
      expect({ file, es: /lang="es-419"[^>]*>Español \(LatAm\)/.test(html) }).toEqual({ file, es: true });
      const tags = [...html.matchAll(/hreflang="([^"]*)"/g)].map((m) => m[1]);
      expect({ file, bare: tags.filter((t) => t === 'pt' || t === 'es') }).toEqual({ file, bare: [] });
    }
    expect(read('index-es.html')).toContain('<html lang="es-419"');
    expect(read('index-pt.html')).toContain('<html lang="pt-BR"');
  });
});

describe('使い方ガイド（ブログのテンプレートになる記事）', () => {
  const guide = readFileSync(join(ROOT, 'fx-trade-journal-guide.html'), 'utf8');

  it('効果・成果を断定する表現が無い', () => {
    // 効果主張と自社アプリのダウンロードCTAが同一ページにある構造は、
    // 景表法上もっとも指摘されやすい。
    const banned = ['勝率アップにつながる', '勝率を上げたいなら', '効果が出ますか'];
    expect(banned.filter((w) => guide.includes(w))).toEqual([]);
  });

  it('冒頭に固定の注記がある', () => {
    expect(guide).toContain('class="article-note"');
    expect(guide).toMatch(/投資助言・売買推奨ではありません/);
  });

  it('フッターに「過去の成績は将来の成果を保証しない」がある', () => {
    // LP の FAQ には11言語すべてにあるのに、この記事だけ欠落していた。
    expect(guide).toMatch(/過去の記録・成績は将来の成果を保証するものではありません/);
  });

  it('FAQ の JSON-LD と本文の <summary> が一致している', () => {
    // 同じ質問文を2箇所に書いており、片方だけ直す事故が起きる典型。
    const blobs = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const faq = blobs.map((b) => JSON.parse(b)).flat().find((d: any) => d['@type'] === 'FAQPage') as any;
    const fromLd = faq.mainEntity.map((q: any) => q.name);
    const fromBody = [...guide.matchAll(/<summary>([^<]*)<\/summary>/g)].map((m) => m[1]);
    expect(fromBody).toEqual(fromLd);
  });
});

describe('OGP', () => {
  it('og:image が言語に合ったものを指し、alt がある', () => {
    // 以前は11言語すべてが同じ1枚を参照しており、その1枚は
    // 「アプリアイコンを黒地に置いただけ」で、読める文字はアイコン内の
    // "FX LOG" だけだった。OGPだけがブランド名の4番目の表記を拡散していた。
    for (const file of [...LP_FILES, 'fx-trade-journal-guide.html']) {
      const html = read(file);
      const lang = file === 'index.html' || file === 'fx-trade-journal-guide.html' ? 'ja' : langOf(file);
      const expected = lang === 'ja' ? 'og-image.png' : 'og-image-en.png';
      const og = html.match(/property="og:image" content="([^"]*)"/)![1];
      const tw = html.match(/name="twitter:image" content="([^"]*)"/)![1];
      expect({ file, og: og.endsWith('/' + expected), tw: tw === og }).toEqual({ file, og: true, tw: true });
      expect({ file, alt: /property="og:image:alt" content="[^"]{10,}"/.test(html) }).toEqual({ file, alt: true });
    }
  });

  it('ブランドマークがアプリアイコンと同じ形（ヒゲ付きローソク足）', () => {
    // LPのマークはヒゲの無い棒3本で、favicon（アイコン画像）と並ぶと別ブランドに見えた。
    for (const file of LP_FILES) {
      const html = read(file);
      const marks = [...html.matchAll(/<svg class="brand-mark"[\s\S]*?<\/svg>/g)].map((m) => m[0]);
      expect({ file, n: marks.length }).toEqual({ file, n: 2 });
      for (const m of marks) {
        // 本体3本 + ヒゲ3本
        expect({ file, rects: (m.match(/<rect/g) ?? []).length }).toEqual({ file, rects: 6 });
        // 図形なので *-large を使う（文字用の --profit/--loss はライトで輝度がほぼ同じ）
        expect({ file, large: !/var\(--profit\)|var\(--loss\)/.test(m) }).toEqual({ file, large: true });
      }
    }
  });
});

describe('LP の料金表示', () => {
  it('有料版の呼称が PRO に統一されている', () => {
    // アプリとストアは PRO に統一したのに、LPだけ Premium のままだった。
    for (const file of [...LP_FILES, 'fx-trade-journal-guide.html']) {
      const html = read(file);
      const hits = ['Premium', 'プレミアム', 'प्रीमियम'].filter((w) => html.includes(w));
      expect({ file, hits }).toEqual({ file, hits: [] });
    }
    for (const file of LP_FILES) {
      expect({ file, ok: read(file).includes('<div class="price-name">PRO</div>') }).toEqual({ file, ok: true });
    }
  });

  it('無料プランの見出しが数字ではなく語になっている', () => {
    // 以前は ¥0 / 0 € / 0 ¥ とバラバラで、ドイツ語版は同じカード群の中で
    // € と ¥ が混在していた。
    for (const file of LP_FILES) {
      const tag = read(file).match(/<p class="price-tag mono">([^<]*)<\/p>/)![1];
      expect({ file, hasDigit: /[0-9]/.test(tag), hasSymbol: /[¥$€]/.test(tag) })
        .toEqual({ file, hasDigit: false, hasSymbol: false });
    }
  });

  it('非日本語ページの価格が JPY と明記されている', () => {
    // ¥ だけだと自国通貨と誤読されうる（有利誤認に近づく）。桁区切りの流儀も
    // 言語ごとに違っていた（¥5.000 / ¥5 000 / ¥5,000）。
    for (const file of LP_FILES) {
      const html = read(file);
      if (file === 'index.html') continue;
      const values = [...html.matchAll(/<span class="pp-value mono">([^<]*)/g)].map((m) => m[1]);
      expect({ file, values }).toEqual({ file, values: ['JPY 500', 'JPY 5,000'] });
      // 注釈にも ¥ 表記の価格が残っていないこと（モックの損益 ¥3,920 は価格ではないので除く）
      const fineprint = html.match(/<p class="price-fineprint">[\s\S]*?<\/p>/)![0];
      expect({ file, yen: /¥[0-9]/.test(fineprint) }).toEqual({ file, yen: false });
    }
  });
});

describe('モバイルの導線', () => {
  const css = readFileSync(join(ROOT, 'lp-assets', 'style.css'), 'utf8');

  it('狭い画面でナビのリンクを消していない', () => {
    // 以前は 860px 未満で .nav-links を display:none にしており、機能・
    // セキュリティ・**料金**・FAQ・使い方ガイドへの導線が全部消えていた。
    expect(css).not.toMatch(/\.nav-links\{display:none/);
    // 横スクロールするチップ列にしてある
    expect(css).toMatch(/\.nav-links\{[^}]*overflow-x:auto/);
  });
});

describe('デスクトップ向けのQR', () => {
  const css = readFileSync(join(ROOT, 'lp-assets', 'style.css'), 'utf8');

  it('各言語の最終CTAにQRがあり、参照先のファイルが実在する', () => {
    // LPのCTAは全部 App Store のWebページへのリンクで、デスクトップで踏むと
    // 行き止まりだった。検索流入はデスクトップも少なくない。
    for (const file of LP_FILES) {
      const html = read(file);
      const lang = langOf(file);
      const m = html.match(/<img src="lp-assets\/(qr-[a-z]+\.svg)"[^>]*alt="([^"]+)"/);
      expect({ file, found: m !== null }).toEqual({ file, found: true });
      expect({ file, src: m![1] }).toEqual({ file, src: `qr-${lang}.svg` });
      expect({ file, exists: existsSync(join(ROOT, 'lp-assets', m![1])) }).toEqual({ file, exists: true });
      // 幅・高さが無いと CLS が跳ねる
      expect({ file, wh: /width="132" height="132"/.test(html) }).toEqual({ file, wh: true });
    }
  });

  it('QRのリンク先が言語ごとの ct を持つ（App Analytics で分けて見るため）', () => {
    for (const file of LP_FILES) {
      const lang = langOf(file);
      const svg = readFileSync(join(ROOT, 'lp-assets', `qr-${lang}.svg`), 'utf8');
      expect({ lang, isSvg: svg.includes('<svg') }).toEqual({ lang, isSvg: true });
    }
  });

  it('タッチ端末と狭い画面では出さない', () => {
    expect(css).toMatch(/@media \(pointer:coarse\)\{ \.cta-qr\{display:none;\} \}/);
    expect(css).toMatch(/@media \(max-width:720px\)\{ \.cta-qr\{display:none;\} \}/);
  });
});

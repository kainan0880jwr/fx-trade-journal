import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * store.config.json（App Store のメタデータ）の11ロケールの整合を見る。
 *
 * 2026-09-09 のレビューで、以下がまとめて見つかった:
 *   - スクリーンショットの並び順が9ロケールで崩れ、de/es/it は**検索結果の2枚目が
 *     ペイウォール**、id/pt-BR/vi は2枚目が設定画面になっていた
 *     （`metadata:pull` が ASC 側の登録順を書き戻すため）
 *   - 「トレード日記は勝率を上げる最も速い方法の一つ」という効果の断定が5ロケールに残存
 *   - サブスクの説明と利用規約URLが5ロケールで**節ごと欠落**（Review Guidelines 3.1.2）
 *   - `metatrader` が5ロケールで抜けていた（`MT4` とは別語として索引される）
 *
 * **このファイルは git 追跡外**（審査連絡先の氏名・電話番号が入るため）。
 * 無い環境ではスキップする。CIでは常にスキップされるので、push 前にローカルで
 * `npm test` を通すことが前提になる。
 */
const PATH = join(__dirname, '..', '..', 'store.config.json');
const LOCALES = ['ja', 'en-US', 'de-DE', 'fr-FR', 'it', 'es-ES', 'tr', 'id', 'pt-BR', 'hi', 'vi'];

const d = existsSync(PATH) ? JSON.parse(readFileSync(PATH, 'utf8')) : null;
const maybe = d ? describe : describe.skip;

maybe('store.config.json', () => {
  // `describe.skip` でも**コールバック本体は評価される**（テスト名の収集のため）。
  // ここで d が null のまま d.apple を読むと、スキップされるはずのCIで
  // 「suite failed to run」になる。実際にそれで main を落とした。
  const info = (d?.apple?.info ?? {}) as Record<string, any>;

  it('11ロケールぶんある', () => {
    expect(Object.keys(info).sort()).toEqual([...LOCALES].sort());
  });

  describe.each(LOCALES)('%s', (loc) => {
    const v = () => info[loc];  // 遅延評価。スキップ時は呼ばれない

    it('スクリーンショットが「ファイル名の昇順 + 設定画面は最後」に並んでいる', () => {
      for (const [size, arr] of Object.entries(v().screenshots ?? {})) {
        const names = (arr as string[]).map((s) => s.split('/').pop()!);
        const isSettings = (n: string) => n.includes('settings') || n.includes('設定');
        const sorted = [...names].sort();
        const expected = [...sorted.filter((n) => !isSettings(n)), ...sorted.filter(isSettings)];
        // 1枚目はホーム画面、ペイウォールと設定画面は末尾に来ること。
        expect({ loc, size, names }).toEqual({ loc, size, names: expected });
      }
    });

    it('キーワードが100字以内で、metatrader を含む（ja を除く）', () => {
      const joined = (v().keywords as string[]).join(',');
      expect({ loc, len: joined.length, ok: joined.length <= 100 })
        .toEqual({ loc, len: joined.length, ok: true });
      // ja は全角のため 100字の枠に metatrader を入れる余地が無い（MT4/MT5 で代替）。
      if (loc !== 'ja') expect({ loc, mt: joined.includes('metatrader') }).toEqual({ loc, mt: true });
    });

    it('title 30字 / subtitle 30字 / description 4000字 以内', () => {
      expect({ loc, t: v().title.length <= 30, s: v().subtitle.length <= 30, d: v().description.length <= 4000 })
        .toEqual({ loc, t: true, s: true, d: true });
    });

    it('説明文にサブスクの節と利用規約URLがある（Review Guidelines 3.1.2）', () => {
      const desc = v().description as string;
      expect({ loc, pro: desc.includes('PRO'), terms: /https:\/\/\S+\/terms[^\s]*\.html/.test(desc) })
        .toEqual({ loc, pro: true, terms: true });
    });

    it('説明文に効果・成果を断定する表現が無い', () => {
      // 記録アプリについて「勝率が上がる」と読める表現は景表法5条1号（優良誤認）の典型で、
      // 7条2項により合理的根拠資料の提出を求められうる。根拠データは無い。
      const desc = (v().description as string).toLowerCase();
      const banned = [
        'raise your win rate', 'meningkatkan win rate', 'aumentar sua taxa de acerto',
        'tăng tỷ lệ thắng', 'विन रेट बढ़ाने',
        'real improvement', 'echten fortschritt', 'réels progrès', 'miglioramento reale',
        'mejoras reales', 'gerçek bir gelişime', 'peningkatan nyata', 'progresso real',
        'असली सुधार', 'tiến bộ thực sự',
        'real results', 'hasil nyata', 'resultados reais', 'असली नतीजों',
        'kết quả thực sự', 'gerçek sonuçlara',
      ];
      expect({ loc, hit: banned.filter((w) => desc.includes(w)) }).toEqual({ loc, hit: [] });
    });

    it('機能上の制限（非円ペアの損益は集計対象外）が開示されている', () => {
      // 購入判断に影響する制限。LPは11言語すべてに入っているのに、
      // ストア説明文は5ロケールにしか無かった。
      const desc = v().description as string;
      expect({ loc, ok: /JPY|非円ペア/.test(desc) }).toEqual({ loc, ok: true });
    });

    it('marketingUrl が自分の言語のLPを指している', () => {
      // 以前は en-US を含む5ロケールで欠落し、残りも日本語版LPを指していた。
      // ja だけはルート（= index.html を配信）なので index-ja.html は存在しない。
      const LANG: Record<string, string> = {
        'en-US': 'en', 'de-DE': 'de', 'fr-FR': 'fr', 'es-ES': 'es', 'pt-BR': 'pt',
        it: 'it', tr: 'tr', id: 'id', hi: 'hi', vi: 'vi',
      };
      const url = v().marketingUrl as string;
      const expected = loc === 'ja' ? '/fx-trade-journal/' : `/index-${LANG[loc]}.html`;
      expect({ loc, ok: url.endsWith(expected) }).toEqual({ loc, ok: true });
    });
  });
});

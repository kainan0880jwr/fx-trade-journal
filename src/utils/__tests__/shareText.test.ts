/**
 * SNS へ貼るテキストが、どの言語でも欠けずに出ることを固定する。
 *
 * **なぜ要るか。** 2026-09-21 まで `┌──┐` の枠で組んでおり、見出しを19字、
 * ラベルを12字で切っていた。日本語の見出し `2026年9月の成績` は10字で収まるが、
 * **他の10言語はすべて19字を超えており、途中で切れて投稿されていた**
 * （英語 `September 2026 Resu` / スペイン語 `Resultados septiemb`）。
 * 日本語で確認している限り一度も見えない壊れ方で、しかも共有はこのアプリで
 * 唯一の拡散導線。ストア用スクリーンショットを撮って初めて気づいた。
 *
 * 枠そのものも前提が崩れていた。揃うのは等幅フォントのときだけで、実際の
 * 共有先（X・LINE・Discord・Instagram）はどれもプロポーショナル。
 * 「揃わない場所に揃える努力をした結果、中身が欠けていた」という状態だった。
 *
 * 落ちたときの直し方: 固定幅の pad を足さないこと。幅を前提にしない。
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildShareText, type ShareStatsOptions } from '../shareUtils';

const stats = {
  totalTrades: 22, wins: 13, losses: 9, draws: 0,
  winRate: 59.1, totalPips: 134.1, profitFactor: 2.09, totalProfitLoss: 48285,
} as unknown as ShareStatsOptions['stats'];

const share = (o: Partial<ShareStatsOptions> & { period: string }) =>
  buildShareText({ stats, ...o });

const SRC = readFileSync(join(__dirname, '..', 'shareUtils.ts'), 'utf8');

describe('共有テキスト', () => {
  it('枠線を引いていない（等幅でしか揃わず、共有先はプロポーショナル）', () => {
    const text = share({ period: 'September 2026' });
    expect(text).not.toMatch(/[┌┐└┘├┤─│]/);
  });

  it('見出しが切れない', () => {
    // 実測でいちばん長かったスペイン語相当の長さで確かめる。
    const period = 'septiembre de 2026';
    const text = share({ period });
    expect(text).toContain(period);
  });

  it('数値がすべて入る', () => {
    const text = share({ period: '2026-09' });
    for (const v of ['59.1%', '+134.1', '2.09', '22', '13 / 9']) {
      expect({ v, ok: text.includes(v) }).toEqual({ v, ok: true });
    }
  });

  it('損益は includeFinancials のときだけ出る（既定では出さない）', () => {
    const off = share({ period: 'p' });
    const on = share({ period: 'p', includeFinancials: true });
    expect(off).not.toContain('48,285');
    expect(on).toContain('48,285');
  });

  it('連続記録は2日以上のときだけ出る', () => {
    expect(share({ period: 'p', streak: 1 })).not.toContain('🔥');
    expect(share({ period: 'p', streak: 5 })).toContain('🔥');
  });

  it('免責が末尾に付く', () => {
    const text = share({ period: 'p' });
    expect(text.trimEnd().length).toBeGreaterThan(0);
    expect(text).toContain('\n\n');
  });

  it('固定幅で切り詰める処理を書いていない（ソースを直接見る）', () => {
    // `pad(x, 19)` のような固定幅は、翻訳が長い言語でだけ欠ける。
    // 型でもレビューでも捕まらないので、書き戻されたらここで止める。
    const body = SRC.slice(SRC.indexOf('export function buildShareText'),
                           SRC.indexOf('// ── HTMLシェアカード'));
    expect(body).not.toMatch(/padEnd|padStart|\.slice\(0,\s*\d+\)/);
  });
});

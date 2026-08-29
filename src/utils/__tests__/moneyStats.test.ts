import { calcMoneyStats } from '../statsCalc';
import type { Trade } from '../../types';

jest.mock('../../i18n', () => ({ t: (k: string) => k, tArr: () => [] }));

function trade(date: string, profitLoss: number | null): Trade {
  return {
    id: date + Math.random(), date, pair: 'USD/JPY', direction: 'buy',
    entryRate: null, exitRate: null, stopLoss: null, takeProfit: null, plannedRR: null,
    lotSize: 0.1, style: 'day', tags: [], imageUris: [], entryMethod: 'quick',
    pips: null, profitLoss, result: (profitLoss ?? 0) > 0 ? 'win' : (profitLoss ?? 0) < 0 ? 'loss' : 'even',
    reflection: '', selfRating: 3, bookmarked: false,
    mentalFocus: null, mentalCalm: null, mentalFear: null, ruleChecks: [],
    tfWeekly: '', tfDaily: '', tf4h: '', tf1h: '', createdAt: date,
  } as Trade;
}

describe('calcMoneyStats', () => {
  it('損益が1件も無ければカバー0で全てnull', () => {
    const r = calcMoneyStats([trade('2026-08-01', null), trade('2026-08-02', null)]);
    expect(r.covered).toBe(0);
    expect(r.total).toBe(2);
    expect(r.avgWin).toBeNull();
    expect(r.profitFactor).toBeNull();
  });

  it('カバー率の分母は全件、分子は損益がある件数', () => {
    const r = calcMoneyStats([trade('2026-08-01', 1000), trade('2026-08-02', null)]);
    expect(r.covered).toBe(1);
    expect(r.total).toBe(2);
  });

  it('平均利益と平均損失を正の値で返す', () => {
    const r = calcMoneyStats([
      trade('2026-08-01', 3000), trade('2026-08-02', 1000),
      trade('2026-08-03', -1000), trade('2026-08-04', -1000),
    ]);
    expect(r.avgWin).toBe(2000);   // (3000+1000)/2
    expect(r.avgLoss).toBe(1000);  // |(-1000-1000)|/2
    expect(r.totalPL).toBe(2000);
  });

  it('リスクリワード = 平均利益 ÷ 平均損失', () => {
    const r = calcMoneyStats([
      trade('2026-08-01', 3000), trade('2026-08-02', -1000),
    ]);
    expect(r.riskReward).toBe(3);
  });

  it('金額ベースのプロフィットファクター = 総利益 ÷ 総損失', () => {
    const r = calcMoneyStats([
      trade('2026-08-01', 2000), trade('2026-08-02', 1000),
      trade('2026-08-03', -1500),
    ]);
    expect(r.profitFactor).toBe(2);  // 3000 / 1500
  });

  it('負けが1件も無ければPFとRRはInfinity', () => {
    const r = calcMoneyStats([trade('2026-08-01', 500)]);
    expect(r.profitFactor).toBe(Infinity);
    expect(r.riskReward).toBe(Infinity);
  });

  it('期待値は1トレードあたりの平均損益', () => {
    const r = calcMoneyStats([
      trade('2026-08-01', 3000), trade('2026-08-02', -1000),
    ]);
    expect(r.expectancy).toBe(1000);
  });

  describe('最大ドローダウン', () => {
    it('右肩上がりなら0', () => {
      const r = calcMoneyStats([
        trade('2026-08-01', 1000), trade('2026-08-02', 2000), trade('2026-08-03', 500),
      ]);
      expect(r.maxDrawdown).toBe(0);
    });

    it('最高値からの最大の落ち幅を返す', () => {
      // 累積: 5000 → 3000 → 4000 → 1000 → 2000
      // 最高値5000から1000まで落ちるので 4000
      const r = calcMoneyStats([
        trade('2026-08-01', 5000), trade('2026-08-02', -2000),
        trade('2026-08-03', 1000), trade('2026-08-04', -3000),
        trade('2026-08-05', 1000),
      ]);
      expect(r.maxDrawdown).toBe(4000);
    });

    it('最初から負け続けた場合も落ち幅として数える', () => {
      // 累積: -1000 → -3000。ピークは0なので 3000
      const r = calcMoneyStats([trade('2026-08-01', -1000), trade('2026-08-02', -2000)]);
      expect(r.maxDrawdown).toBe(3000);
    });

    it('日付順に並べ替えてから計算する（入力順に依存しない）', () => {
      const asc = calcMoneyStats([
        trade('2026-08-01', 5000), trade('2026-08-02', -3000),
      ]);
      const desc = calcMoneyStats([
        trade('2026-08-02', -3000), trade('2026-08-01', 5000),
      ]);
      expect(desc.maxDrawdown).toBe(asc.maxDrawdown);
      expect(asc.maxDrawdown).toBe(3000);
    });
  });

  it('損益が無い行は母数に入れない（合計pipsとの矛盾を防ぐ）', () => {
    // 実際に発生していた: 合計pipsは8件、損益合計は1件だけの合計だった
    const r = calcMoneyStats([
      trade('2026-08-01', 200), trade('2026-08-02', null), trade('2026-08-03', null),
    ]);
    expect(r.totalPL).toBe(200);
    expect(r.covered).toBe(1);
    expect(r.total).toBe(3);
    expect(r.expectancy).toBe(200); // 3で割らない
  });
});

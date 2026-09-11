/**
 * 撮影用デモデータが「狙った成績」になっていることを固定する。
 *
 * このデータはストアのスクリーンショットにそのまま数字として写る。極端な好成績は
 * 打消し表示が要る水準になりうるので（LPのモックで実際に指摘を受けて 78%/PF7.75 を
 * 62%/1.50 に直した経緯がある）、勝率とPFが意図した範囲から外れたら気付けるようにする。
 *
 * 表示側の集計そのもの（calcStats）を使って検算しているので、集計の仕様が変われば
 * ここも落ちる。
 */
jest.mock('../../db/database', () => ({ getDatabase: jest.fn() }));
jest.mock('../../db/queries', () => ({
  insertTrade: jest.fn(), setSetting: jest.fn(), saveTradeRules: jest.fn(),
  saveEntryTags: jest.fn(), updateRecordStreak: jest.fn(), GOAL_SETTING_KEYS: {},
}));
jest.mock('../../store/purchaseStore', () => ({ usePurchaseStore: { setState: jest.fn() } }));

import { DEMO_TRADES, assignDays } from '../screenshotMode';
import { calcProfitLoss, determineResult } from '../profitCalc';
import { calcStats } from '../statsCalc';
import type { Trade } from '../../types';

const LOT_UNIT = 10000;

const asTrades = (): Trade[] =>
  DEMO_TRADES.map((d, i) => ({
    id: `screenshot-${i}`,
    date: '2026-09-01',
    pair: d.pair,
    direction: d.direction,
    entryRate: null, exitRate: null, stopLoss: null, takeProfit: null, plannedRR: null,
    lotSize: d.lot,
    entryMethod: 'quick',
    style: d.style,
    tags: [],
    imageUris: [],
    pips: d.pips,
    profitLoss: calcProfitLoss(d.pips, d.lot, LOT_UNIT),
    result: determineResult(d.pips),
    reflection: '',
    selfRating: d.rating,
    bookmarked: Boolean(d.bookmarked),
    mentalFocus: null, mentalCalm: null, mentalFear: null,
    ruleChecks: [],
    tfWeekly: '', tfDaily: '', tf4h: '', tf1h: '',
    createdAt: '2026-09-01T09:00:00.000Z',
  })) as Trade[];

describe('撮影用デモデータ', () => {
  const stats = calcStats(asTrades());

  it('22件・13勝9敗になっている', () => {
    expect(stats.totalTrades).toBe(22);
    expect(stats.wins).toBe(13);
    expect(stats.losses).toBe(9);
    expect(stats.evens).toBe(0);
  });

  it('勝率が 59.1%', () => {
    expect(stats.winRate).toBe(59.1);
  });

  it('合計 pips が +134.1', () => {
    expect(stats.totalPips).toBe(134.1);
  });

  it('PF が 2.09', () => {
    expect(stats.profitFactor).toBe(2.09);
  });

  it('勝率とPFが「現実的」の範囲に収まっている', () => {
    // LPのモックで打消し表示が要ると判断された水準（78% / PF7.75）に近づけない
    expect(stats.winRate).toBeGreaterThanOrEqual(50);
    expect(stats.winRate).toBeLessThanOrEqual(65);
    expect(stats.profitFactor).toBeGreaterThan(1);
    expect(stats.profitFactor).toBeLessThanOrEqual(2.5);
  });

  it('月次の損益目標 30,000 を超えている（達成状態で撮るため）', () => {
    expect(stats.totalProfitLoss).toBeGreaterThan(30000);
  });

  it('クロス円だけで構成されている（非円ペアは損益額が出ないため）', () => {
    for (const d of DEMO_TRADES) expect(d.pair.endsWith('/JPY')).toBe(true);
  });
});

describe('assignDays', () => {
  it('最後の1件は必ず今日になる（TODAY 欄に出すため）', () => {
    expect(assignDays(22, 10).at(-1)).toBe(10);
    expect(assignDays(22, 28).at(-1)).toBe(28);
  });

  it('1日目から始まり、単調に増える', () => {
    const days = assignDays(22, 20);
    expect(days[0]).toBe(1);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
  });

  it('月初（今日が1日）でも壊れない', () => {
    expect(assignDays(22, 1)).toEqual(Array(22).fill(1));
  });

  it('今日に置かれるのは1件だけ（TODAY 欄を1件・勝ちで見せるため）', () => {
    for (const today of [3, 10, 20, 28]) {
      const days = assignDays(22, today);
      expect(days.filter(d => d === today)).toHaveLength(1);
    }
  });

  it('配列の最後は勝ちトレード（今日の勝率を100%にするため）', () => {
    expect(DEMO_TRADES[DEMO_TRADES.length - 1].pips).toBeGreaterThan(0);
  });
});

import { calcStats } from '../statsCalc';
import { calcMonthPF, buildDayMap, calcPF } from '../calendarMetrics';
import { formatWinRate, formatPips } from '../formatStats';
import type { Trade } from '../../types';

jest.mock('../../i18n', () => ({ t: (k: string) => k, tArr: () => [] }));

let seq = 0;
function trade(o: Partial<Trade> & { date: string }): Trade {
  return {
    id: `t${seq++}`, pair: 'USD/JPY', direction: 'buy',
    entryRate: null, exitRate: null, stopLoss: null, takeProfit: null, plannedRR: null,
    lotSize: 0.1, style: 'day', tags: [], imageUris: [], entryMethod: 'quick',
    pips: null, profitLoss: null, result: 'even',
    reflection: '', selfRating: 3, bookmarked: false,
    mentalFocus: null, mentalCalm: null, mentalFear: null, ruleChecks: [],
    tfWeekly: '', tfDaily: '', tf4h: '', tf1h: '', createdAt: o.date,
    ...o,
  } as Trade;
}

describe('プロフィットファクターの定義が画面間で一致していること', () => {
  it('カレンダー(calcMonthPF)とホーム・月次(calcStats)が同じ値を返す', () => {
    const trades = [
      trade({ date: '2026-08-01T09:00:00', result: 'win',  pips: 10 }),
      trade({ date: '2026-08-02T09:00:00', result: 'loss', pips: -5 }),
      trade({ date: '2026-08-03T09:00:00', result: 'even', pips: 3 }),
    ];
    expect(calcMonthPF(trades)).toBe(calcStats(trades).profitFactor);
  });

  it('引き分け扱いのプラスpipsが台帳から消えない', () => {
    // 以前はカレンダーだけ result で分けており、引き分けの +3 が丸ごと落ちて
    // ホーム 2.60 / カレンダー 2.00 に割れていた
    const trades = [
      trade({ date: '2026-08-01T09:00:00', result: 'win',  pips: 10 }),
      trade({ date: '2026-08-02T09:00:00', result: 'loss', pips: -5 }),
      trade({ date: '2026-08-03T09:00:00', result: 'even', pips: 3 }),
    ];
    expect(calcMonthPF(trades)).toBe(2.6);
  });

  it('「勝ち」なのにpipsが負の行が総利益をマイナスにしない', () => {
    // MT4取込では result と pips が別々に決まるため、この組み合わせが実在する
    const trades = [
      trade({ date: '2026-08-01T09:00:00', result: 'win',  pips: -2 }),
      trade({ date: '2026-08-02T09:00:00', result: 'win',  pips: 10 }),
      trade({ date: '2026-08-03T09:00:00', result: 'loss', pips: -5 }),
    ];
    expect(calcMonthPF(trades)).toBe(calcStats(trades).profitFactor);
    expect(calcMonthPF(trades)).toBeGreaterThan(0);
  });

  it('日別のPFも同じ定義で分ける', () => {
    const trades = [
      trade({ date: '2026-08-01T09:00:00', result: 'even', pips: 4 }),
      trade({ date: '2026-08-01T12:00:00', result: 'loss', pips: -2 }),
    ];
    const day = buildDayMap(trades)['2026-08-01'];
    expect(calcPF(day)).toBe(2);
  });

  it('負けが無ければ Infinity（勝ちが無ければ0）', () => {
    const win = [trade({ date: '2026-08-01T09:00:00', result: 'win', pips: 5 })];
    expect(calcMonthPF(win)).toBe(Infinity);
    expect(calcMonthPF([])).toBe(0);
  });
});

describe('勝率とpipsの書式が画面間で一致すること', () => {
  it('2勝1敗は 66.7% であって 67% ではない', () => {
    const trades = [
      trade({ date: '2026-08-01T09:00:00', result: 'win' }),
      trade({ date: '2026-08-02T09:00:00', result: 'win' }),
      trade({ date: '2026-08-03T09:00:00', result: 'loss' }),
    ];
    expect(formatWinRate(calcStats(trades).winRate)).toBe('66.7%');
  });

  it('割り切れる勝率は小数を出さない', () => {
    const trades = [
      trade({ date: '2026-08-01T09:00:00', result: 'win' }),
      trade({ date: '2026-08-02T09:00:00', result: 'loss' }),
    ];
    expect(formatWinRate(calcStats(trades).winRate)).toBe('50%');
  });

  it('pipsは小数1桁を保ち、整数なら小数を出さない', () => {
    expect(formatPips(24.55)).toBe('+24.6');
    expect(formatPips(25)).toBe('+25');
    expect(formatPips(-24.5)).toBe('-24.5');
    expect(formatPips(0)).toBe('0');
  });

  it('未記録のpipsは 0 ではなく -', () => {
    expect(formatPips(null)).toBe('-');
  });
});

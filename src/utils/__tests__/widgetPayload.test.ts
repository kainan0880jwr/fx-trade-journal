/**
 * ウィジェットに渡す3期間ぶんのペイロードを固定する。
 *
 * **特に厚く見ているのは2点。** どちらも「黙って間違った数字を出す」形で表面化し、
 * ウィジェットはこのアプリで最も目に入る面なので、気づかれないまま放置されやすい。
 *
 * 1. **陳腐化の印。** 日付が変わっても、アプリを開くまでペイロードは昨日のまま。
 *    `computedDay` / `computedWeek` / `computedMonth` を持たせ、描画側が
 *    現在日時と突き合わせられるようにしてある。ここが欠けると「今日 +12.4 pips」と
 *    昨日の数字を出し続ける。
 * 2. **週またぎ。** 週は月をまたぐ（9/28(日)〜10/4(土)）。今週のトレードを
 *    当月ぶんだけで集めると、月初は週の前半が丸ごと落ちる。
 */
jest.mock('../../i18n', () => ({ t: (k: string) => k, tArr: () => [] }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildWidgetPeriods, monthsNeededForWeek, isInThisWeek, ymd, ym,
} from '../widgetPayload';
import type { Trade, AppSettings } from '../../types';

const SETTINGS: AppSettings = {
  lotUnit: 10000, defaultLotSize: 0.1, defaultStyle: 'day',
  accountBalance: 0, defaultRiskPct: 2,
  monthlyPipsGoal: 0, monthlyWinRateGoal: 0, monthlyPLGoal: 0,
  themeMode: 'dark', appLockEnabled: false, widgetWhileLocked: false,
  dailyRuleGoal: false, dailyPipsGoal: 0, dailyPLGoal: 0,
  weeklyRuleDaysGoal: 0, weeklyPipsGoal: 0, weeklyPLGoal: 0,
  monthlyRuleDaysGoal: 0,
  yearlyRuleDaysGoal: 0, yearlyPipsGoal: 0, yearlyPLGoal: 0, yearlyWinRateGoal: 0,
};

let seq = 0;
const trade = (date: string, pips: number, result: Trade['result'] = 'win'): Trade => ({
  id: `t${seq++}`, date, pair: 'USD/JPY', direction: 'buy',
  entryRate: null, exitRate: null, stopLoss: null, takeProfit: null, plannedRR: null,
  lotSize: 1, entryMethod: 'quick', style: 'day', tags: [], imageUris: [],
  pips, profitLoss: pips * 100, result, reflection: '', selfRating: 3,
  bookmarked: false, mentalFocus: null, mentalCalm: null, mentalFear: null,
  ruleChecks: [], tfWeekly: '', tfDaily: '', tf4h: '', tf1h: '',
  createdAt: `${date}.000Z`,
} as Trade);

const LABELS = { day: '今日', week: '今週', month: '今月' };
const build = (o: { monthTrades?: Trade[]; weekTrades?: Trade[]; settings?: AppSettings; now: Date }) =>
  buildWidgetPeriods({
    monthTrades: o.monthTrades ?? [], weekTrades: o.weekTrades ?? [],
    settings: o.settings ?? SETTINGS, rules: [], labels: LABELS, now: o.now,
  });

describe('陳腐化の印', () => {
  it('いつ時点の集計かを持たせる', () => {
    // 2026-09-23 は水曜。日曜始まりなので週の頭は 09-20。
    const p = build({ now: new Date(2026, 8, 23) });
    expect({ d: p.computedDay, w: p.computedWeek, m: p.computedMonth })
      .toEqual({ d: '2026-09-23', w: '2026-09-20', m: '2026-09' });
  });

  it('日曜は週の頭が当日になる', () => {
    expect(build({ now: new Date(2026, 8, 20) }).computedWeek).toBe('2026-09-20');
  });

  it('月をまたぐ週でも週の頭は前月のまま', () => {
    // 2026-10-01 は木曜。週の頭は 09-27（日）。
    const p = build({ now: new Date(2026, 9, 1) });
    expect({ w: p.computedWeek, m: p.computedMonth }).toEqual({ w: '2026-09-27', m: '2026-10' });
  });
});

describe('今日の切り出し', () => {
  it('当月のトレードから今日ぶんだけを数える', () => {
    const now = new Date(2026, 8, 23);
    const p = build({
      now,
      monthTrades: [
        trade('2026-09-23T09:00:00', 10),
        trade('2026-09-23T15:00:00', 5),
        trade('2026-09-22T09:00:00', 99),   // 昨日。今日には入れない
      ],
    });
    const day = p.periods.find(x => x.key === 'day')!;
    expect({ count: day.count, pips: day.pips }).toEqual({ count: '2', pips: '+15' });
  });

  it('今日のトレードが無ければ "-"', () => {
    const p = build({ now: new Date(2026, 8, 23), monthTrades: [trade('2026-09-22T09:00:00', 10)] });
    const day = p.periods.find(x => x.key === 'day')!;
    expect({ hasData: day.hasData, winRate: day.winRate, pips: day.pips })
      .toEqual({ hasData: 0, winRate: '-', pips: '-' });
  });
});

describe('週またぎ', () => {
  it('週の頭が前月なら2か月ぶん要る', () => {
    expect(monthsNeededForWeek(new Date(2026, 9, 1))).toEqual(['2026-09', '2026-10']);
  });

  it('週が当月に収まっていれば1か月でよい', () => {
    expect(monthsNeededForWeek(new Date(2026, 8, 23))).toEqual(['2026-09']);
  });

  it('前月のトレードでも今週なら含める', () => {
    const now = new Date(2026, 9, 1);           // 10/1(木)。週は 9/27(日)〜
    expect(isInThisWeek('2026-09-28T10:00:00', now)).toBe(true);
    expect(isInThisWeek('2026-09-26T10:00:00', now)).toBe(false);
  });
});

describe('目標の進捗', () => {
  it('目標が無ければリングを出さない（goalTotal 0）', () => {
    const p = build({ now: new Date(2026, 8, 23), monthTrades: [trade('2026-09-23T09:00:00', 10)] });
    expect(p.periods.map(x => x.goalTotal)).toEqual([0, 0, 0]);
  });

  it('達成率の平均を 0〜1 で返す', () => {
    // 月間 pips 目標 100 に対して 40 → 0.4
    const s = { ...SETTINGS, monthlyPipsGoal: 100 };
    const p = build({ now: new Date(2026, 8, 23), monthTrades: [trade('2026-09-23T09:00:00', 40)], settings: s });
    const month = p.periods.find(x => x.key === 'month')!;
    expect({ total: month.goalTotal, done: month.goalDone, progress: month.goalProgress })
      .toEqual({ total: 1, done: 0, progress: 0.4 });
  });

  it('超過しても 1 で頭打ち（リングが溢れない）', () => {
    const s = { ...SETTINGS, monthlyPipsGoal: 10 };
    const p = build({ now: new Date(2026, 8, 23), monthTrades: [trade('2026-09-23T09:00:00', 80)], settings: s });
    const month = p.periods.find(x => x.key === 'month')!;
    expect({ done: month.goalDone, progress: month.goalProgress }).toEqual({ done: 1, progress: 1 });
  });

  it('複数の目標は平均する', () => {
    // pips 100 に対して 50（0.5）、勝率 80% に対して 100%（1.0 で頭打ち）→ 平均 0.75
    const s = { ...SETTINGS, monthlyPipsGoal: 100, monthlyWinRateGoal: 80 };
    const p = build({ now: new Date(2026, 8, 23), monthTrades: [trade('2026-09-23T09:00:00', 50)], settings: s });
    const month = p.periods.find(x => x.key === 'month')!;
    expect({ total: month.goalTotal, progress: month.goalProgress }).toEqual({ total: 2, progress: 0.75 });
  });
});

describe('3期間が必ず揃う', () => {
  it('順番は 今日 / 今週 / 今月', () => {
    const p = build({ now: new Date(2026, 8, 23) });
    expect(p.periods.map(x => x.key)).toEqual(['day', 'week', 'month']);
    expect(p.periods.map(x => x.label)).toEqual(['今日', '今週', '今月']);
  });

  it('日付の整形がゼロ埋めされている（文字列比較で使うため）', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(ym(new Date(2026, 0, 5))).toBe('2026-01');
  });
});

describe('Swift 側との契約', () => {
  // `targets/widget/FXWidget.swift` の `WidgetPeriod` は非オプショナルで宣言してある。
  // 1つでもキーが欠けるとデコードが丸ごと失敗し、**ウィジェットが3期間とも
  // 出なくなる**（プレースホルダーに落ちる）。型では守れないのでここで固定する。
  const REQUIRED = ['key', 'label', 'winRate', 'pips', 'pf', 'count',
                    'isPositive', 'hasData', 'goalTotal', 'goalDone', 'goalProgress'];

  it('WidgetPeriod のキーが過不足なく揃っている', () => {
    const p = build({ now: new Date(2026, 8, 23), monthTrades: [trade('2026-09-23T09:00:00', 10)] });
    for (const period of p.periods) {
      expect({ key: period.key, keys: Object.keys(period).sort() })
        .toEqual({ key: period.key, keys: [...REQUIRED].sort() });
    }
  });

  it('値は文字列か数値だけ（ExtensionStorage は入れ子を受け付けない）', () => {
    const p = build({ now: new Date(2026, 8, 23), monthTrades: [trade('2026-09-23T09:00:00', 10)] });
    for (const period of p.periods) {
      for (const [k, v] of Object.entries(period)) {
        expect({ k, type: typeof v }).toEqual({ k, type: expect.stringMatching(/^(string|number)$/) });
      }
    }
  });

  it('JSON にして往復しても壊れない（periodsJson として載せるため）', () => {
    const p = build({ now: new Date(2026, 8, 23), monthTrades: [trade('2026-09-23T09:00:00', 10)] });
    expect(JSON.parse(JSON.stringify(p.periods))).toEqual(p.periods);
  });

  it('Swift 側が switch している key の綴りと一致する', () => {
    // FXWidget.swift の displayPeriods(at:) は "day" / "week" / それ以外=月 で分岐する。
    const src = readFileSync(join(__dirname, '..', '..', '..', 'targets', 'widget', 'FXWidget.swift'), 'utf8');
    expect(src).toContain('case "day":');
    expect(src).toContain('case "week":');
  });

  it('Swift 側が陳腐化を判定している（policy: .never に戻っていない）', () => {
    // .never だと日付が変わっても再描画されず、「今日」に昨日の数字が出たままになる。
    const src = readFileSync(join(__dirname, '..', '..', '..', 'targets', 'widget', 'FXWidget.swift'), 'utf8');
    expect(src).toContain('displayPeriods(at:');
    expect(src).not.toMatch(/policy:\s*\.never/);
  });
});

import { evaluatePeriod, buildGoalMarks, isRuleFollowedDay, ruleFollowedDays, weekStart, hasAnyGoal } from '../goals';
import type { Trade, AppSettings } from '../../types';

jest.mock('../../i18n', () => ({ t: (k: string) => k, tArr: () => [] }));

const BASE: AppSettings = {
  lotUnit: 10000, defaultLotSize: 0.1, defaultStyle: 'day',
  accountBalance: 0, defaultRiskPct: 2,
  monthlyPipsGoal: 0, monthlyWinRateGoal: 0, monthlyPLGoal: 0,
  themeMode: 'dark', appLockEnabled: false,
  dailyRuleGoal: false, dailyPipsGoal: 0, dailyPLGoal: 0,
  weeklyRuleDaysGoal: 0, weeklyPipsGoal: 0, weeklyPLGoal: 0,
  monthlyRuleDaysGoal: 0,
  yearlyRuleDaysGoal: 0, yearlyPipsGoal: 0, yearlyPLGoal: 0, yearlyWinRateGoal: 0,
};
const RULES = ['損切りを置いた', '根拠が2つ以上'];

let seq = 0;
function trade(date: string, o: Partial<Trade> = {}): Trade {
  const stamped = date.length === 10 ? `${date}T09:30:00` : date;
  return {
    id: `t${seq++}`, date: stamped, pair: 'USD/JPY', direction: 'buy',
    entryRate: null, exitRate: null, stopLoss: null, takeProfit: null, plannedRR: null,
    lotSize: 0.1, style: 'day', tags: [], imageUris: [], entryMethod: 'quick',
    pips: null, profitLoss: null, result: 'even',
    reflection: '', selfRating: 3, bookmarked: false,
    mentalFocus: null, mentalCalm: null, mentalFear: null, ruleChecks: [],
    tfWeekly: '', tfDaily: '', tf4h: '', tf1h: '', createdAt: stamped,
    ...o,
  } as Trade;
}

describe('ルール遵守の判定', () => {
  it('全トレードで全ルールにチェックがあれば遵守', () => {
    const ts = [trade('2026-08-10', { ruleChecks: RULES }), trade('2026-08-10', { ruleChecks: RULES })];
    expect(isRuleFollowedDay(ts, RULES)).toBe(true);
  });

  it('1件でも欠けていれば未遵守', () => {
    const ts = [trade('2026-08-10', { ruleChecks: RULES }), trade('2026-08-10', { ruleChecks: [RULES[0]] })];
    expect(isRuleFollowedDay(ts, RULES)).toBe(false);
  });

  it('ルール未設定なら判定しない（未達にはしない）', () => {
    expect(isRuleFollowedDay([trade('2026-08-10')], [])).toBeNull();
  });

  it('トレードが無い日は判定しない', () => {
    expect(isRuleFollowedDay([], RULES)).toBeNull();
  });

  it('遵守した日数を数える', () => {
    const ts = [
      trade('2026-08-10', { ruleChecks: RULES }),
      trade('2026-08-11', { ruleChecks: RULES }),
      trade('2026-08-12', { ruleChecks: [RULES[0]] }),   // 未遵守
    ];
    expect(ruleFollowedDays(ts, RULES)).toBe(2);
  });
});

describe('週の切り出し（日曜始まり）', () => {
  it('カレンダー表示と同じ日曜始まりで切る', () => {
    // 2026-08-09 は日曜
    expect(weekStart('2026-08-09T10:00:00')).toBe('2026-08-09');
    expect(weekStart('2026-08-15T10:00:00')).toBe('2026-08-09');
    expect(weekStart('2026-08-16T10:00:00')).toBe('2026-08-16');
  });

  it('時刻付きの日付でも壊れない', () => {
    expect(weekStart('2026-08-12T23:59:59')).toBe('2026-08-09');
  });
});

describe('日単位の目標', () => {
  it('目標が未設定なら対象外', () => {
    const r = evaluatePeriod('day', [trade('2026-08-10', { pips: 30 })], BASE, RULES);
    expect(r.applicable).toBe(false);
    expect(r.allAchieved).toBe(false);
  });

  it('トレードが無い日は対象外（休んだ日を達成にしない）', () => {
    const s = { ...BASE, dailyRuleGoal: true };
    expect(evaluatePeriod('day', [], s, RULES).applicable).toBe(false);
  });

  it('ルール目標を達成', () => {
    const s = { ...BASE, dailyRuleGoal: true };
    const r = evaluatePeriod('day', [trade('2026-08-10', { ruleChecks: RULES })], s, RULES);
    expect(r.allAchieved).toBe(true);
  });

  it('ルール目標をオンにしてもルール未設定なら判定しない', () => {
    const s = { ...BASE, dailyRuleGoal: true };
    expect(evaluatePeriod('day', [trade('2026-08-10')], s, []).applicable).toBe(false);
  });

  it('pips目標は合計で判定する', () => {
    const s = { ...BASE, dailyPipsGoal: 20 };
    const ts = [trade('2026-08-10', { pips: 30 }), trade('2026-08-10', { pips: -15 })];
    const r = evaluatePeriod('day', ts, s, RULES);
    expect(r.goals[0].current).toBe(15);
    expect(r.allAchieved).toBe(false);
  });

  it('pipsが1件も記録されていなければ判定対象にしない', () => {
    const s = { ...BASE, dailyPipsGoal: 20 };
    expect(evaluatePeriod('day', [trade('2026-08-10')], s, RULES).applicable).toBe(false);
  });

  it('複数の目標は「すべて」達成で初めて達成', () => {
    const s = { ...BASE, dailyRuleGoal: true, dailyPipsGoal: 20 };
    const ts = [trade('2026-08-10', { ruleChecks: RULES, pips: 10 })];
    const r = evaluatePeriod('day', ts, s, RULES);
    expect(r.goals.length).toBe(2);
    expect(r.allAchieved).toBe(false);
  });
});

describe('週・月・年の目標', () => {
  it('週はルールを守った日数で判定する', () => {
    const s = { ...BASE, weeklyRuleDaysGoal: 2 };
    const ts = [
      trade('2026-08-10', { ruleChecks: RULES }),
      trade('2026-08-11', { ruleChecks: RULES }),
      trade('2026-08-12', { ruleChecks: [] }),
    ];
    const r = evaluatePeriod('week', ts, s, RULES);
    expect(r.goals[0].current).toBe(2);
    expect(r.allAchieved).toBe(true);
  });

  it('月は既存の勝率目標も判定に含む', () => {
    const s = { ...BASE, monthlyWinRateGoal: 60 };
    const ts = [
      trade('2026-08-01', { result: 'win' }), trade('2026-08-02', { result: 'win' }),
      trade('2026-08-03', { result: 'loss' }),
    ];
    const r = evaluatePeriod('month', ts, s, RULES);
    expect(r.goals[0].current).toBe(66.7);
    expect(r.allAchieved).toBe(true);
  });

  it('年は合計損益で判定する', () => {
    const s = { ...BASE, yearlyPLGoal: 100000 };
    const ts = [trade('2026-03-01', { profitLoss: 60000 }), trade('2026-09-01', { profitLoss: 50000 })];
    expect(evaluatePeriod('year', ts, s, RULES).allAchieved).toBe(true);
  });

  it('損益が未記録の期間は金額目標を判定しない', () => {
    const s = { ...BASE, yearlyPLGoal: 100000 };
    expect(evaluatePeriod('year', [trade('2026-03-01', { pips: 10 })], s, RULES).applicable).toBe(false);
  });
});

describe('カレンダーの印', () => {
  it('達成した日だけを返す', () => {
    const s = { ...BASE, dailyRuleGoal: true };
    const ts = [
      trade('2026-08-10', { ruleChecks: RULES }),
      trade('2026-08-11', { ruleChecks: [RULES[0]] }),
    ];
    const { days } = buildGoalMarks(ts, s, RULES);
    expect(days.has('2026-08-10')).toBe(true);
    expect(days.has('2026-08-11')).toBe(false);
  });

  it('週の印は日曜始まりの開始日をキーにする', () => {
    const s = { ...BASE, weeklyRuleDaysGoal: 1 };
    const ts = [trade('2026-08-12', { ruleChecks: RULES })];
    const { weeks } = buildGoalMarks(ts, s, RULES);
    expect(weeks.has('2026-08-09')).toBe(true);
  });

  it('目標が無ければ印は付かない', () => {
    const ts = [trade('2026-08-10', { ruleChecks: RULES, pips: 50 })];
    const { days, weeks } = buildGoalMarks(ts, BASE, RULES);
    expect(days.size).toBe(0);
    expect(weeks.size).toBe(0);
  });
});

describe('hasAnyGoal', () => {
  it('未設定なら false', () => {
    expect(hasAnyGoal(BASE)).toBe(false);
  });
  it('1つでも設定されていれば true', () => {
    expect(hasAnyGoal({ ...BASE, dailyRuleGoal: true })).toBe(true);
    expect(hasAnyGoal({ ...BASE, yearlyPipsGoal: 100 })).toBe(true);
  });
});

import type { Trade, AppSettings } from '../types';

/**
 * 期間別の目標判定。
 *
 * ■ 判定の原則
 * - 目標が未設定（0 / false）の項目は判定にも表示にも使わない。
 * - トレードが1件も無い期間は「未達」ではなく「対象外」。休んだ日を
 *   達成扱いにすると、カレンダーが印だらけになって意味が薄れる。
 * - ルール遵守は「その日の全トレードで、設定した全ルールにチェックがある」。
 *   バッジは絶対件数で判定しているが（ルールを増やすと過去の獲得が
 *   剥奪されるため）、目標は現在の状態を映す指標なので全項目基準でよい。
 */

export type GoalPeriod = 'day' | 'week' | 'month' | 'year';
export type GoalKind = 'rule' | 'pips' | 'pl' | 'winRate';

export interface GoalStatus {
  kind: GoalKind;
  /** 現在値。判定できない（母数が無い等）場合は null */
  current: number | null;
  target: number;
  achieved: boolean;
}

export interface PeriodGoalResult {
  /** 設定されている目標が1つも無い、または対象トレードが無い */
  applicable: boolean;
  goals: GoalStatus[];
  /** 設定されている目標を「すべて」達成しているか。カレンダーの印はこれで出す */
  allAchieved: boolean;
}

const EMPTY: PeriodGoalResult = { applicable: false, goals: [], allAchieved: false };

/** 'YYYY-MM-DD...' の日付部分。trade.date は時刻付きで保存される */
export function dayOf(date: string): string {
  return date.slice(0, 10);
}

function localDate(date: string): Date {
  return new Date(`${dayOf(date)}T00:00:00`);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * その日が属する週の開始日。カレンダーの表示が日曜始まりなので、
 * 週の切り出しもそれに合わせる（バッジは月曜始まりだが、あちらは
 * カレンダー上に出ないので不整合として見えない）。
 */
export function weekStart(date: string): string {
  const d = localDate(date);
  d.setDate(d.getDate() - d.getDay());
  return ymd(d);
}

function sumPips(trades: Trade[]): number | null {
  const withPips = trades.filter(t => t.pips != null);
  if (withPips.length === 0) return null;
  return Math.round(withPips.reduce((s, t) => s + (t.pips as number), 0) * 10) / 10;
}

function sumPL(trades: Trade[]): number | null {
  const withPL = trades.filter(t => t.profitLoss != null);
  if (withPL.length === 0) return null;
  return Math.round(withPL.reduce((s, t) => s + (t.profitLoss as number), 0));
}

function winRate(trades: Trade[]): number | null {
  if (trades.length === 0) return null;
  // calcStats と同じ定義（引き分けも分母に含める）
  const wins = trades.filter(t => t.result === 'win').length;
  return Math.round((wins / trades.length) * 1000) / 10;
}

/**
 * その日がルールを守った日か。
 * ルールが未設定なら判定できないので null を返す（未達にはしない）。
 */
export function isRuleFollowedDay(dayTrades: Trade[], rules: string[]): boolean | null {
  if (rules.length === 0 || dayTrades.length === 0) return null;
  return dayTrades.every(t => {
    const checked = t.ruleChecks ?? [];
    return rules.every(r => checked.includes(r));
  });
}

/** 日付キーごとにまとめる */
function groupByDay(trades: Trade[]): Map<string, Trade[]> {
  const m = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = dayOf(t.date);
    const arr = m.get(k);
    if (arr) arr.push(t); else m.set(k, [t]);
  }
  return m;
}

/** 期間内でルールを守った日数 */
export function ruleFollowedDays(trades: Trade[], rules: string[]): number {
  if (rules.length === 0) return 0;
  let n = 0;
  for (const dayTrades of groupByDay(trades).values()) {
    if (isRuleFollowedDay(dayTrades, rules) === true) n++;
  }
  return n;
}

function build(goals: GoalStatus[]): PeriodGoalResult {
  if (goals.length === 0) return EMPTY;
  return { applicable: true, goals, allAchieved: goals.every(g => g.achieved) };
}

/**
 * ある期間のトレード群について、設定されている目標の達成状況を返す。
 * trades はその期間のものだけを渡すこと（絞り込みは呼び出し側の責任）。
 */
export function evaluatePeriod(
  period: GoalPeriod,
  trades: Trade[],
  settings: AppSettings,
  rules: string[]
): PeriodGoalResult {
  if (trades.length === 0) return EMPTY;

  const goals: GoalStatus[] = [];
  const pushNumeric = (kind: GoalKind, current: number | null, target: number) => {
    if (target <= 0) return;
    // 母数が無い（pips未記録など）ものは判定対象にしない
    if (current == null) return;
    goals.push({ kind, current, target, achieved: current >= target });
  };

  if (period === 'day') {
    if (settings.dailyRuleGoal) {
      const ok = isRuleFollowedDay(trades, rules);
      if (ok != null) goals.push({ kind: 'rule', current: ok ? 1 : 0, target: 1, achieved: ok });
    }
    pushNumeric('pips', sumPips(trades), settings.dailyPipsGoal);
    pushNumeric('pl', sumPL(trades), settings.dailyPLGoal);
    return build(goals);
  }

  const ruleDaysTarget =
    period === 'week' ? settings.weeklyRuleDaysGoal
    : period === 'month' ? settings.monthlyRuleDaysGoal
    : settings.yearlyRuleDaysGoal;
  if (ruleDaysTarget > 0 && rules.length > 0) {
    const days = ruleFollowedDays(trades, rules);
    goals.push({ kind: 'rule', current: days, target: ruleDaysTarget, achieved: days >= ruleDaysTarget });
  }

  if (period === 'week') {
    pushNumeric('pips', sumPips(trades), settings.weeklyPipsGoal);
    pushNumeric('pl', sumPL(trades), settings.weeklyPLGoal);
  } else if (period === 'month') {
    pushNumeric('pips', sumPips(trades), settings.monthlyPipsGoal);
    pushNumeric('pl', sumPL(trades), settings.monthlyPLGoal);
    pushNumeric('winRate', winRate(trades), settings.monthlyWinRateGoal);
  } else {
    pushNumeric('pips', sumPips(trades), settings.yearlyPipsGoal);
    pushNumeric('pl', sumPL(trades), settings.yearlyPLGoal);
    pushNumeric('winRate', winRate(trades), settings.yearlyWinRateGoal);
  }
  return build(goals);
}

/**
 * カレンダー用。月内の各日と各週について、目標を達成したかを返す。
 * 週は日曜始まりの開始日をキーにする。
 */
export function buildGoalMarks(
  trades: Trade[],
  settings: AppSettings,
  rules: string[]
): { days: Set<string>; weeks: Set<string> } {
  const days = new Set<string>();
  const weeks = new Set<string>();

  for (const [day, dayTrades] of groupByDay(trades)) {
    const r = evaluatePeriod('day', dayTrades, settings, rules);
    if (r.applicable && r.allAchieved) days.add(day);
  }

  const byWeek = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = weekStart(t.date);
    const arr = byWeek.get(k);
    if (arr) arr.push(t); else byWeek.set(k, [t]);
  }
  for (const [wk, weekTrades] of byWeek) {
    const r = evaluatePeriod('week', weekTrades, settings, rules);
    if (r.applicable && r.allAchieved) weeks.add(wk);
  }

  return { days, weeks };
}

/** 目標が1つでも設定されているか。設定画面への導線を出すかの判定に使う */
export function hasAnyGoal(settings: AppSettings): boolean {
  return settings.dailyRuleGoal
    || settings.dailyPipsGoal > 0 || settings.dailyPLGoal > 0
    || settings.weeklyRuleDaysGoal > 0 || settings.weeklyPipsGoal > 0 || settings.weeklyPLGoal > 0
    || settings.monthlyRuleDaysGoal > 0 || settings.monthlyPipsGoal > 0
    || settings.monthlyWinRateGoal > 0 || settings.monthlyPLGoal > 0
    || settings.yearlyRuleDaysGoal > 0 || settings.yearlyPipsGoal > 0
    || settings.yearlyPLGoal > 0 || settings.yearlyWinRateGoal > 0;
}

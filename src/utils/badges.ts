import type { Trade } from '../types';
import { t } from '../i18n';

export interface BadgeDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  category: 'record' | 'performance' | 'habit' | 'analysis' | 'discipline' | 'goal';
}

export interface UnlockedBadge extends BadgeDef {
  unlocked: boolean;
  progress: number;
  target: number;
  /** 月次目標が未設定のため判定できないバッジ。UIで「目標を設定しよう」を出す */
  needsGoal?: boolean;
}

/** 月次目標。未設定（0以下）の目標バッジは達成不能として needsGoal を立てる */
export interface BadgeGoals {
  monthlyPipsGoal: number;
  monthlyWinRateGoal: number;
  monthlyPLGoal: number;
}

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'first_trade',   title: '', description: '', icon: 'flag-outline',             color: '#5B8AF0', category: 'record' },
  { id: 'trades_10',     title: '', description: '', icon: 'layers-outline',           color: '#5B8AF0', category: 'record' },
  { id: 'trades_50',     title: '', description: '', icon: 'shield-outline',           color: '#34D399', category: 'record' },
  { id: 'trades_100',    title: '', description: '', icon: 'trophy-outline',           color: '#FBBF24', category: 'record' },
  { id: 'win3',          title: '', description: '', icon: 'trending-up-outline',      color: '#34D399', category: 'performance' },
  { id: 'win5',          title: '', description: '', icon: 'flame-outline',            color: '#FBBF24', category: 'performance' },
  { id: 'pips50',        title: '', description: '', icon: 'pulse-outline',            color: '#5B8AF0', category: 'performance' },
  { id: 'pips100',       title: '', description: '', icon: 'rocket-outline',           color: '#FBBF24', category: 'performance' },
  { id: 'reflection_10', title: '', description: '', icon: 'book-outline',             color: '#A78BFA', category: 'habit' },
  { id: 'mental_10',     title: '', description: '', icon: 'heart-outline',            color: '#F87171', category: 'habit' },
  { id: 'rule_10',       title: '', description: '', icon: 'checkmark-circle-outline', color: '#34D399', category: 'habit' },
  { id: 'image_5',       title: '', description: '', icon: 'image-outline',            color: '#5B8AF0', category: 'analysis' },
  { id: 'rr_10',         title: '', description: '', icon: 'git-compare-outline',      color: '#A78BFA', category: 'analysis' },
  { id: 'tf_10',         title: '', description: '', icon: 'time-outline',             color: '#FBBF24', category: 'analysis' },

  // ── 日単位 ──
  { id: 'day_sl',        title: '', description: '', icon: 'shield-checkmark-outline', color: '#34D399', category: 'discipline' },
  { id: 'day_rules',     title: '', description: '', icon: 'checkbox-outline',         color: '#34D399', category: 'discipline' },
  { id: 'day_reflect',   title: '', description: '', icon: 'create-outline',           color: '#A78BFA', category: 'discipline' },
  { id: 'day_plus',      title: '', description: '', icon: 'sunny-outline',            color: '#FBBF24', category: 'goal' },

  // ── 週単位 ──
  { id: 'week_5days',    title: '', description: '', icon: 'calendar-outline',         color: '#5B8AF0', category: 'habit' },
  { id: 'week_sl',       title: '', description: '', icon: 'shield-half-outline',      color: '#34D399', category: 'discipline' },
  { id: 'week_plus',     title: '', description: '', icon: 'leaf-outline',             color: '#34D399', category: 'goal' },

  // ── 月単位（自分で決めた目標との比較）──
  { id: 'goal_pips',     title: '', description: '', icon: 'flag-outline',             color: '#5B8AF0', category: 'goal' },
  { id: 'goal_winrate',  title: '', description: '', icon: 'ribbon-outline',           color: '#A78BFA', category: 'goal' },
  { id: 'goal_pl',       title: '', description: '', icon: 'cash-outline',             color: '#FBBF24', category: 'goal' },
  { id: 'goal_slam',     title: '', description: '', icon: 'medal-outline',            color: '#FBBF24', category: 'goal' },

  // ── 年単位 ──
  { id: 'year_full',     title: '', description: '', icon: 'calendar-number-outline',  color: '#A78BFA', category: 'habit' },
  { id: 'year_plus',     title: '', description: '', icon: 'trophy-outline',           color: '#34D399', category: 'goal' },

  // ── 規律の積み重ね ──
  { id: 'sl_streak_20',  title: '', description: '', icon: 'lock-closed-outline',      color: '#34D399', category: 'discipline' },
  { id: 'rules_50',      title: '', description: '', icon: 'list-outline',             color: '#34D399', category: 'discipline' },
  { id: 'rr2_10',        title: '', description: '', icon: 'analytics-outline',        color: '#A78BFA', category: 'discipline' },

  // ── 継続 ──
  { id: 'streak_7',      title: '', description: '', icon: 'flame-outline',            color: '#F87171', category: 'habit' },
  { id: 'streak_30',     title: '', description: '', icon: 'bonfire-outline',          color: '#F87171', category: 'habit' },
  { id: 'streak_100',    title: '', description: '', icon: 'planet-outline',           color: '#FBBF24', category: 'habit' },
];

function withTranslations(defs: BadgeDef[]): BadgeDef[] {
  return defs.map(d => ({
    ...d,
    title: t(`badge_${d.id}_title` as any) || d.title,
    description: t(`badge_${d.id}_desc` as any) || d.description,
  }));
}

/**
 * 保存されている日付文字列から 'YYYY-MM-DD' の部分だけを取り出す。
 * trade.date は '2026-08-30T14:30:00' のように時刻付きで保存されるため、
 * 切り詰めずに T00:00:00 を足すと Invalid Date になる。
 */
function dayOf(date: string): string {
  return date.slice(0, 10);
}

/**
 * 'YYYY-MM-DD...' をローカル時刻の Date にする。
 * new Date('2026-08-30') はUTC解釈になり、日本時間では前日にずれて
 * 曜日・週の切り出しが1日ずれる（statsCalcで実際に起きた不具合）。
 */
function localDate(date: string): Date {
  return new Date(`${dayOf(date)}T00:00:00`);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** その日が属する週（月曜始まり）の月曜日を返す。週のグループキーに使う */
function weekKey(date: string): string {
  const d = localDate(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

function groupBy(trades: Trade[], key: (t: Trade) => string): Map<string, Trade[]> {
  const m = new Map<string, Trade[]>();
  for (const tr of trades) {
    const k = key(tr);
    const arr = m.get(k);
    if (arr) arr.push(tr); else m.set(k, [tr]);
  }
  return m;
}

/** pipsが1件でも入っている集団の合計pips。全件未入力なら null（0と区別する） */
function sumPips(trades: Trade[]): number | null {
  const withPips = trades.filter(t => t.pips != null);
  if (withPips.length === 0) return null;
  return withPips.reduce((s, t) => s + (t.pips as number), 0);
}

function sumPL(trades: Trade[]): number | null {
  const withPL = trades.filter(t => t.profitLoss != null);
  if (withPL.length === 0) return null;
  return withPL.reduce((s, t) => s + (t.profitLoss as number), 0);
}

/**
 * 勝率(%)。calcStats と同じ定義（引き分けも分母に含める）にしてある。
 * ここだけ引き分けを除外すると、月次タブのゲージが「未達」を示している月に
 * バッジだけ「達成」と付いてしまう。
 */
function winRate(trades: Trade[]): { rate: number; count: number } {
  const wins = trades.filter(t => t.result === 'win').length;
  const count = trades.length;
  return { rate: count > 0 ? (wins / count) * 100 : 0, count };
}

/** 連続して記録した日数の「これまでの最長」。現在の連続日数と違い、途切れても減らない */
function bestDateStreak(dates: string[]): number {
  const uniq = Array.from(new Set(dates)).sort();
  let best = 0, cur = 0, prev: number | null = null;
  for (const d of uniq) {
    const time = localDate(d).getTime();
    // 前日との差を暦日で見る。DSTのある地域では86400000ちょうどにならないため、
    // 前日の日付文字列を作って比較する。
    if (prev != null) {
      const prevDay = new Date(time);
      prevDay.setDate(prevDay.getDate() - 1);
      cur = ymd(prevDay) === ymd(new Date(prev)) ? cur + 1 : 1;
    } else {
      cur = 1;
    }
    if (cur > best) best = cur;
    prev = time;
  }
  return best;
}

export function calcBadges(trades: Trade[], goals?: BadgeGoals): UnlockedBadge[] {
  const total = trades.length;
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  // 最長連勝
  let maxStreak = 0, cur = 0;
  for (const t of sorted) {
    if (t.result === 'win') { cur++; if (cur > maxStreak) maxStreak = cur; }
    else cur = 0;
  }

  // 損切りを設定し続けた最長連続トレード数
  let slStreak = 0, slCur = 0;
  for (const t of sorted) {
    if (t.stopLoss != null) { slCur++; if (slCur > slStreak) slStreak = slCur; }
    else slCur = 0;
  }

  const byDay   = groupBy(trades, t => dayOf(t.date));
  const byWeek  = groupBy(trades, t => weekKey(t.date));
  const byMonth = groupBy(trades, t => t.date.slice(0, 7));
  const byYear  = groupBy(trades, t => t.date.slice(0, 4));

  const maxMonthPips = Math.max(
    0,
    ...Array.from(byMonth.values()).map(ts => sumPips(ts) ?? 0)
  );

  // ── 日単位 ──
  // 「その日の全トレードが条件を満たした日」を数える。1件だけの日で成立すると
  // 簡単すぎるので、3件以上の日に限定する。
  const days = Array.from(byDay.values());
  const daySlDays      = days.filter(ts => ts.length >= 3 && ts.every(t => t.stopLoss != null)).length;
  const dayRulesDays   = days.filter(ts => ts.length >= 3 && ts.every(t => (t.ruleChecks ?? []).length > 0)).length;
  const dayReflectDays = days.filter(ts => ts.length >= 3 && ts.every(t => (t.reflection ?? '').trim().length > 0)).length;
  const dayPlusDays    = days.filter(ts => (sumPips(ts) ?? 0) > 0).length;

  // ── 週単位 ──
  const weeks = Array.from(byWeek.values());
  const maxWeekDays  = Math.max(0, ...weeks.map(ts => new Set(ts.map(t => dayOf(t.date))).size));
  const weekSlWeeks  = weeks.filter(ts => ts.length >= 5 && ts.every(t => t.stopLoss != null)).length;
  const weekPlusWeeks = weeks.filter(ts => (sumPips(ts) ?? 0) > 0).length;

  // ── 月単位（自分で設定した目標との比較）──
  // 目標が未設定（0以下）なら判定しようがないので needsGoal を立てて 0/1 のままにする。
  const pipsGoalSet    = (goals?.monthlyPipsGoal    ?? 0) > 0;
  const winRateGoalSet = (goals?.monthlyWinRateGoal ?? 0) > 0;
  const plGoalSet      = (goals?.monthlyPLGoal      ?? 0) > 0;

  let goalPipsMonths = 0, goalWinRateMonths = 0, goalPLMonths = 0, goalSlamMonths = 0;
  for (const ts of byMonth.values()) {
    const wr = winRate(ts);
    const mp = sumPips(ts);
    const mpl = sumPL(ts);
    const hitPips = pipsGoalSet && mp != null && mp >= goals!.monthlyPipsGoal;
    // 数件だけの月がたまたま勝率100%になるのを避ける
    const hitWinRate = winRateGoalSet && wr.count >= 5 && wr.rate >= goals!.monthlyWinRateGoal;
    const hitPL = plGoalSet && mpl != null && mpl >= goals!.monthlyPLGoal;
    if (hitPips) goalPipsMonths++;
    if (hitWinRate) goalWinRateMonths++;
    if (hitPL) goalPLMonths++;
    if (hitPips && hitWinRate && hitPL) goalSlamMonths++;
  }

  // ── 年単位 ──
  const maxYearMonths = Math.max(
    0,
    ...Array.from(byYear.values()).map(ts => new Set(ts.map(t => t.date.slice(0, 7))).size)
  );
  const plusYears = Array.from(byYear.values()).filter(ts => (sumPips(ts) ?? 0) > 0).length;

  const reflections = trades.filter(t => (t.reflection ?? '').trim().length > 0).length;
  const mentalCount = trades.filter(t => t.mentalFocus != null).length;
  const ruleCount   = trades.filter(t => (t.ruleChecks ?? []).length > 0).length;
  const imageCount  = trades.filter(t => (t.imageUris ?? []).length > 0).length;
  const rrCount     = trades.filter(t => t.plannedRR != null).length;
  const rr2Count    = trades.filter(t => t.plannedRR != null && t.plannedRR >= 2).length;
  const tfCount     = trades.filter(t => t.tfWeekly || t.tfDaily || t.tf4h || t.tf1h).length;
  const bestStreak  = bestDateStreak(trades.map(t => dayOf(t.date)));

  const prog: Record<string, { p: number; t: number; needsGoal?: boolean }> = {
    first_trade:    { p: total,             t: 1   },
    trades_10:      { p: total,             t: 10  },
    trades_50:      { p: total,             t: 50  },
    trades_100:     { p: total,             t: 100 },
    win3:           { p: maxStreak,         t: 3   },
    win5:           { p: maxStreak,         t: 5   },
    pips50:         { p: maxMonthPips,      t: 50  },
    pips100:        { p: maxMonthPips,      t: 100 },
    reflection_10:  { p: reflections,       t: 10  },
    mental_10:      { p: mentalCount,       t: 10  },
    rule_10:        { p: ruleCount,         t: 10  },
    image_5:        { p: imageCount,        t: 5   },
    rr_10:          { p: rrCount,           t: 10  },
    tf_10:          { p: tfCount,           t: 10  },

    day_sl:         { p: daySlDays,         t: 3   },
    day_rules:      { p: dayRulesDays,      t: 3   },
    day_reflect:    { p: dayReflectDays,    t: 3   },
    day_plus:       { p: dayPlusDays,       t: 10  },

    week_5days:     { p: maxWeekDays,       t: 5   },
    week_sl:        { p: weekSlWeeks,       t: 1   },
    week_plus:      { p: weekPlusWeeks,     t: 4   },

    goal_pips:      { p: goalPipsMonths,    t: 1, needsGoal: !pipsGoalSet },
    goal_winrate:   { p: goalWinRateMonths, t: 1, needsGoal: !winRateGoalSet },
    goal_pl:        { p: goalPLMonths,      t: 1, needsGoal: !plGoalSet },
    goal_slam:      { p: goalSlamMonths,    t: 1, needsGoal: !(pipsGoalSet && winRateGoalSet && plGoalSet) },

    year_full:      { p: maxYearMonths,     t: 12  },
    year_plus:      { p: plusYears,         t: 1   },

    sl_streak_20:   { p: slStreak,          t: 20  },
    rules_50:       { p: ruleCount,         t: 50  },
    rr2_10:         { p: rr2Count,          t: 10  },

    streak_7:       { p: bestStreak,        t: 7   },
    streak_30:      { p: bestStreak,        t: 30  },
    streak_100:     { p: bestStreak,        t: 100 },
  };

  return withTranslations(BADGE_DEFS).map(def => {
    const { p, t, needsGoal } = prog[def.id] ?? { p: 0, t: 1 };
    return { ...def, unlocked: p >= t, progress: p, target: t, needsGoal };
  });
}

/**
 * 未達成のうち達成が近いものを上位から返す。
 * 進捗0のものは「あと少し」ではないので除く。目標未設定のバッジも、
 * まず目標設定を促すべきなのでここには出さない。
 */
export function nearlyUnlocked(badges: UnlockedBadge[], limit = 3): UnlockedBadge[] {
  return badges
    .filter(b => !b.unlocked && !b.needsGoal && b.progress > 0)
    .sort((a, b) => (b.progress / b.target) - (a.progress / a.target))
    .slice(0, limit);
}

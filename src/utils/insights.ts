import type { Trade } from '../types';
import { t } from '../i18n';
import {
  calcStatsByPair, calcTimeAnalysis, calcDayAnalysis,
  calcMentalStats, calcCurrentStreak,
} from './statsCalc';

export interface Insight {
  id: string;
  type: 'positive' | 'negative' | 'neutral' | 'tip';
  title: string;
  body: string;
  icon: string;
}

function fmt(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    template
  );
}

export function generateInsights(
  trades: Trade[],
  monthlyPipsGoal = 0,
  monthlyWinRateGoal = 0,
): Insight[] {
  if (trades.length < 3) return [];
  const insights: Insight[] = [];

  const byPair   = calcStatsByPair(trades);
  const byTime   = calcTimeAnalysis(trades);
  const byDay    = calcDayAnalysis(trades);
  const mental   = calcMentalStats(trades);
  const streak   = calcCurrentStreak(trades);
  const totalPips = Math.round(trades.reduce((s, t) => s + (t.pips ?? 0), 0) * 10) / 10;
  const wins      = trades.filter(t => t.result === 'win').length;
  const winRate   = Math.round(wins / trades.length * 1000) / 10;

  // ベストペア
  const best = [...byPair].sort((a, b) => b.winRate - a.winRate)[0];
  if (best && best.winRate >= 60 && best.totalTrades >= 3) {
    insights.push({
      id: 'best_pair', type: 'positive',
      title: fmt(t('insight_best_pair_title'), { pair: best.pair }),
      body: fmt(t('insight_best_pair_body'), { rate: best.winRate, count: best.totalTrades }),
      icon: 'trending-up-outline',
    });
  }

  // 苦手ペア
  const worst = [...byPair].sort((a, b) => a.winRate - b.winRate)[0];
  if (worst && worst.winRate <= 40 && worst.totalTrades >= 3 && worst.pair !== best?.pair) {
    insights.push({
      id: 'worst_pair', type: 'negative',
      title: fmt(t('insight_worst_pair_title'), { pair: worst.pair }),
      body: fmt(t('insight_worst_pair_body'), { rate: worst.winRate, count: worst.totalTrades }),
      icon: 'alert-circle-outline',
    });
  }

  // 得意時間帯
  const bestTime = [...byTime].sort((a, b) => b.winRate - a.winRate)[0];
  if (bestTime && bestTime.winRate >= 65 && bestTime.total >= 3) {
    insights.push({
      id: 'best_time', type: 'positive',
      title: fmt(t('insight_best_time_title'), { time: bestTime.label }),
      body: fmt(t('insight_best_time_body'), { rate: bestTime.winRate }),
      icon: 'time-outline',
    });
  }

  // 苦手曜日
  const worstDay = [...byDay].sort((a, b) => a.winRate - b.winRate)[0];
  if (worstDay && worstDay.winRate <= 35 && worstDay.total >= 3) {
    insights.push({
      id: 'worst_day', type: 'negative',
      title: fmt(t('insight_worst_day_title'), { day: worstDay.label }),
      body: fmt(t('insight_worst_day_body'), { day: worstDay.label, rate: worstDay.winRate }),
      icon: 'calendar-outline',
    });
  }

  // 連勝/連敗
  if (streak.type === 'win' && streak.count >= 3) {
    insights.push({
      id: 'win_streak', type: 'positive',
      title: fmt(t('insight_win_streak_title'), { count: streak.count }),
      body: t('insight_win_streak_body'),
      icon: 'flame-outline',
    });
  }
  if (streak.type === 'loss' && streak.count >= 3) {
    insights.push({
      id: 'loss_streak', type: 'negative',
      title: fmt(t('insight_loss_streak_title'), { count: streak.count }),
      body: t('insight_loss_streak_body'),
      icon: 'pause-circle-outline',
    });
  }

  // メンタル×勝率
  if (mental) {
    // 低集中のトレードが1件も無いとき wr() は null を返す。`?? 0` で0%として
    // 扱うと「集中している時70%、低い時0%」という**存在しない比較**を断定して
    // しまうため、両側にデータがある場合だけ出す。
    const diff = (mental.focus.high ?? 0) - (mental.focus.low ?? 0);
    if (diff >= 15 && mental.focus.high != null && mental.focus.low != null && mental.focus.lowCount > 0) {
      insights.push({
        id: 'mental_focus', type: 'positive',
        title: t('insight_mental_focus_title'),
        body: fmt(t('insight_mental_focus_body'), { high: mental.focus.high, low: mental.focus.low ?? 0, diff }),
        icon: 'bulb-outline',
      });
    }
  }

  // SL未設定
  const noSL = trades.filter(t => t.stopLoss == null).length;
  if (noSL / trades.length > 0.5) {
    insights.push({
      id: 'no_sl', type: 'tip',
      title: t('insight_no_sl_title'),
      body: fmt(t('insight_no_sl_body'), { count: noSL, pct: Math.round(noSL / trades.length * 100) }),
      icon: 'shield-outline',
    });
  }

  // 月間pips目標
  if (monthlyPipsGoal > 0) {
    const rem = Math.round((monthlyPipsGoal - totalPips) * 10) / 10;
    if (rem > 0) {
      insights.push({
        id: 'goal_pips', type: 'neutral',
        title: fmt(t('insight_goal_pips_title'), { rem }),
        body: fmt(t('insight_goal_pips_body'), { pct: Math.round(totalPips / monthlyPipsGoal * 100) }),
        icon: 'flag-outline',
      });
    } else {
      insights.push({
        id: 'goal_pips_done', type: 'positive',
        title: t('insight_goal_pips_done_title'),
        body: fmt(t('insight_goal_pips_done_body'), { goal: monthlyPipsGoal }),
        icon: 'checkmark-circle-outline',
      });
    }
  }

  // 月間勝率目標
  if (monthlyWinRateGoal > 0 && winRate >= monthlyWinRateGoal) {
    insights.push({
      id: 'goal_wr_done', type: 'positive',
      title: t('insight_goal_wr_done_title'),
      body: fmt(t('insight_goal_wr_done_body'), { goal: monthlyWinRateGoal, rate: winRate }),
      icon: 'star-outline',
    });
  }

  return insights;
}

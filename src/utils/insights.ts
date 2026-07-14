import type { Trade } from '../types';
import { lang } from '../i18n';
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

  const isJa = lang === 'ja';

  // ベストペア
  const best = [...byPair].sort((a, b) => b.winRate - a.winRate)[0];
  if (best && best.winRate >= 60 && best.totalTrades >= 3) {
    insights.push({
      id: 'best_pair', type: 'positive',
      title: isJa ? `${best.pair} が得意ペア` : `${best.pair} is your strong pair`,
      body: isJa
        ? `勝率 ${best.winRate}%（${best.totalTrades}件）。過去の記録ではこのペアの成績が良い傾向があります。`
        : `Win rate ${best.winRate}% (${best.totalTrades} trades). Your track record shows strong results on this pair.`,
      icon: 'trending-up-outline',
    });
  }

  // 苦手ペア
  const worst = [...byPair].sort((a, b) => a.winRate - b.winRate)[0];
  if (worst && worst.winRate <= 40 && worst.totalTrades >= 3 && worst.pair !== best?.pair) {
    insights.push({
      id: 'worst_pair', type: 'negative',
      title: isJa ? `${worst.pair} に注意` : `Watch out for ${worst.pair}`,
      body: isJa
        ? `勝率 ${worst.winRate}%（${worst.totalTrades}件）と低め。過去の記録に基づく統計です。`
        : `Win rate is low at ${worst.winRate}% (${worst.totalTrades} trades), based on your trade history.`,
      icon: 'alert-circle-outline',
    });
  }

  // 得意時間帯
  const bestTime = [...byTime].sort((a, b) => b.winRate - a.winRate)[0];
  if (bestTime && bestTime.winRate >= 65 && bestTime.total >= 3) {
    insights.push({
      id: 'best_time', type: 'positive',
      title: isJa ? `${bestTime.label}台が最も得意` : `${bestTime.label} is your best time window`,
      body: isJa
        ? `この時間帯の勝率は ${bestTime.winRate}%（過去の記録に基づく統計）。`
        : `Your win rate during this window is ${bestTime.winRate}%, based on your trade history.`,
      icon: 'time-outline',
    });
  }

  // 苦手曜日
  const worstDay = [...byDay].sort((a, b) => a.winRate - b.winRate)[0];
  if (worstDay && worstDay.winRate <= 35 && worstDay.total >= 3) {
    insights.push({
      id: 'worst_day', type: 'negative',
      title: isJa ? `${worstDay.label}は要注意` : `Be careful on ${worstDay.label}`,
      body: isJa
        ? `${worstDay.label}の勝率が ${worstDay.winRate}%と低い傾向があります。`
        : `Your win rate on ${worstDay.label} tends to be low, at ${worstDay.winRate}%.`,
      icon: 'calendar-outline',
    });
  }

  // 連勝/連敗
  if (streak.type === 'win' && streak.count >= 3) {
    insights.push({
      id: 'win_streak', type: 'positive',
      title: isJa ? `${streak.count}連勝中！` : `${streak.count}-trade win streak!`,
      body: isJa
        ? '好調継続中です。ただし過信せずルールを守って取引しましょう。'
        : "You're on a roll. Stay disciplined and keep following your rules.",
      icon: 'flame-outline',
    });
  }
  if (streak.type === 'loss' && streak.count >= 3) {
    insights.push({
      id: 'loss_streak', type: 'negative',
      title: isJa ? `${streak.count}連敗中` : `${streak.count}-trade losing streak`,
      body: isJa
        ? '一度立ち止まり、戦略と精神状態を整えましょう。休むことも戦略です。'
        : 'Take a step back and reset your strategy and mindset. Taking a break is a strategy too.',
      icon: 'pause-circle-outline',
    });
  }

  // メンタル×勝率
  if (mental) {
    const diff = (mental.focus.high ?? 0) - (mental.focus.low ?? 0);
    if (diff >= 15 && mental.focus.high != null) {
      insights.push({
        id: 'mental_focus', type: 'positive',
        title: isJa ? '集中度が高いと勝率UP' : 'Higher focus, higher win rate',
        body: isJa
          ? `集中度高時 ${mental.focus.high}% vs 低時 ${mental.focus.low}%。差が ${diff}%あります。`
          : `High focus: ${mental.focus.high}% vs low focus: ${mental.focus.low}% — a ${diff}pt difference.`,
        icon: 'bulb-outline',
      });
    }
  }

  // SL未設定
  const noSL = trades.filter(t => t.stopLoss == null).length;
  if (noSL / trades.length > 0.5) {
    insights.push({
      id: 'no_sl', type: 'tip',
      title: isJa ? '損切りを設定しよう' : 'Set a stop-loss',
      body: isJa
        ? `${noSL}件（${Math.round(noSL / trades.length * 100)}%）の取引でSLが未設定です。`
        : `${noSL} trades (${Math.round(noSL / trades.length * 100)}%) have no stop-loss set.`,
      icon: 'shield-outline',
    });
  }

  // 月間pips目標
  if (monthlyPipsGoal > 0) {
    const rem = Math.round((monthlyPipsGoal - totalPips) * 10) / 10;
    if (rem > 0) {
      insights.push({
        id: 'goal_pips', type: 'neutral',
        title: isJa ? `目標まであと ${rem} pips` : `${rem} pips to go`,
        body: isJa
          ? `達成率 ${Math.round(totalPips / monthlyPipsGoal * 100)}%。引き続き頑張りましょう！`
          : `You're at ${Math.round(totalPips / monthlyPipsGoal * 100)}% of your goal. Keep it up!`,
        icon: 'flag-outline',
      });
    } else {
      insights.push({
        id: 'goal_pips_done', type: 'positive',
        title: isJa ? '月間pips目標達成！' : 'Monthly pips goal reached!',
        body: isJa
          ? `目標の ${monthlyPipsGoal}pips を超えました。素晴らしい成果です！`
          : `You've exceeded your goal of ${monthlyPipsGoal} pips. Great work!`,
        icon: 'checkmark-circle-outline',
      });
    }
  }

  // 月間勝率目標
  if (monthlyWinRateGoal > 0 && winRate >= monthlyWinRateGoal) {
    insights.push({
      id: 'goal_wr_done', type: 'positive',
      title: isJa ? '勝率目標達成！' : 'Win rate goal reached!',
      body: isJa
        ? `目標 ${monthlyWinRateGoal}% に対して現在 ${winRate}%。`
        : `Your goal was ${monthlyWinRateGoal}% — you're currently at ${winRate}%.`,
      icon: 'star-outline',
    });
  }

  return insights;
}

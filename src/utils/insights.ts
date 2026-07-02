import type { Trade } from '../types';
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

  // ベストペア
  const best = [...byPair].sort((a, b) => b.winRate - a.winRate)[0];
  if (best && best.winRate >= 60 && best.totalTrades >= 3) {
    insights.push({
      id: 'best_pair', type: 'positive',
      title: `${best.pair} が得意ペア`,
      body: `勝率 ${best.winRate}%（${best.totalTrades}件）。過去の記録ではこのペアの成績が良い傾向があります。`,
      icon: 'trending-up-outline',
    });
  }

  // 苦手ペア
  const worst = [...byPair].sort((a, b) => a.winRate - b.winRate)[0];
  if (worst && worst.winRate <= 40 && worst.totalTrades >= 3 && worst.pair !== best?.pair) {
    insights.push({
      id: 'worst_pair', type: 'negative',
      title: `${worst.pair} に注意`,
      body: `勝率 ${worst.winRate}%（${worst.totalTrades}件）と低め。過去の記録に基づく統計です。`,
      icon: 'alert-circle-outline',
    });
  }

  // 得意時間帯
  const bestTime = [...byTime].sort((a, b) => b.winRate - a.winRate)[0];
  if (bestTime && bestTime.winRate >= 65 && bestTime.total >= 3) {
    insights.push({
      id: 'best_time', type: 'positive',
      title: `${bestTime.label}台が最も得意`,
      body: `この時間帯の勝率は ${bestTime.winRate}%（過去の記録に基づく統計）。`,
      icon: 'time-outline',
    });
  }

  // 苦手曜日
  const worstDay = [...byDay].sort((a, b) => a.winRate - b.winRate)[0];
  if (worstDay && worstDay.winRate <= 35 && worstDay.total >= 3) {
    insights.push({
      id: 'worst_day', type: 'negative',
      title: `${worstDay.label}は要注意`,
      body: `${worstDay.label}の勝率が ${worstDay.winRate}%と低い傾向があります。`,
      icon: 'calendar-outline',
    });
  }

  // 連勝/連敗
  if (streak.type === 'win' && streak.count >= 3) {
    insights.push({
      id: 'win_streak', type: 'positive',
      title: `${streak.count}連勝中！`,
      body: '好調継続中です。ただし過信せずルールを守って取引しましょう。',
      icon: 'flame-outline',
    });
  }
  if (streak.type === 'loss' && streak.count >= 3) {
    insights.push({
      id: 'loss_streak', type: 'negative',
      title: `${streak.count}連敗中`,
      body: '一度立ち止まり、戦略と精神状態を整えましょう。休むことも戦略です。',
      icon: 'pause-circle-outline',
    });
  }

  // メンタル×勝率
  if (mental) {
    const diff = (mental.focus.high ?? 0) - (mental.focus.low ?? 0);
    if (diff >= 15 && mental.focus.high != null) {
      insights.push({
        id: 'mental_focus', type: 'positive',
        title: '集中度が高いと勝率UP',
        body: `集中度高時 ${mental.focus.high}% vs 低時 ${mental.focus.low}%。差が ${diff}%あります。`,
        icon: 'bulb-outline',
      });
    }
  }

  // SL未設定
  const noSL = trades.filter(t => t.stopLoss == null).length;
  if (noSL / trades.length > 0.5) {
    insights.push({
      id: 'no_sl', type: 'tip',
      title: '損切りを設定しよう',
      body: `${noSL}件（${Math.round(noSL / trades.length * 100)}%）の取引でSLが未設定です。`,
      icon: 'shield-outline',
    });
  }

  // 月間pips目標
  if (monthlyPipsGoal > 0) {
    const rem = Math.round((monthlyPipsGoal - totalPips) * 10) / 10;
    if (rem > 0) {
      insights.push({
        id: 'goal_pips', type: 'neutral',
        title: `目標まであと ${rem} pips`,
        body: `達成率 ${Math.round(totalPips / monthlyPipsGoal * 100)}%。引き続き頑張りましょう！`,
        icon: 'flag-outline',
      });
    } else {
      insights.push({
        id: 'goal_pips_done', type: 'positive',
        title: '月間pips目標達成！',
        body: `目標の ${monthlyPipsGoal}pips を超えました。素晴らしい成果です！`,
        icon: 'checkmark-circle-outline',
      });
    }
  }

  // 月間勝率目標
  if (monthlyWinRateGoal > 0 && winRate >= monthlyWinRateGoal) {
    insights.push({
      id: 'goal_wr_done', type: 'positive',
      title: '勝率目標達成！',
      body: `目標 ${monthlyWinRateGoal}% に対して現在 ${winRate}%。`,
      icon: 'star-outline',
    });
  }

  return insights;
}

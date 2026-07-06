import type { Trade, DailyStats } from '../types';
import { tArr } from '../i18n';

export function calcStats(trades: Trade[]): DailyStats {
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.result === 'win').length;
  const losses = trades.filter(t => t.result === 'loss').length;
  const evens = trades.filter(t => t.result === 'even').length;
  const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 1000) / 10 : 0;
  // クイック入力など pips が null のトレードは金額系集計から除外
  const pipsTrades = trades.filter(t => t.pips != null);
  const totalPips = pipsTrades.reduce((s, t) => s + (t.pips ?? 0), 0);
  const totalProfitLoss = trades.reduce((s, t) => s + (t.profitLoss ?? 0), 0);
  const grossProfit = pipsTrades.filter(t => (t.pips ?? 0) > 0).reduce((s, t) => s + (t.pips ?? 0), 0);
  const grossLoss = Math.abs(pipsTrades.filter(t => (t.pips ?? 0) < 0).reduce((s, t) => s + (t.pips ?? 0), 0));
  const profitFactor = grossLoss > 0
    ? Math.round((grossProfit / grossLoss) * 100) / 100
    : grossProfit > 0 ? Infinity : 0;
  return {
    date: '', totalTrades, wins, losses, evens, winRate,
    totalPips: Math.round(totalPips * 10) / 10,
    totalProfitLoss: Math.round(totalProfitLoss),
    profitFactor,
  };
}

export function calcDailyCumulativePips(trades: Trade[], yearMonth: string) {
  const byDay: Record<number, number> = {};
  for (const t of trades) {
    const day = parseInt(t.date.slice(8, 10), 10);
    byDay[day] = (byDay[day] ?? 0) + (t.pips ?? 0);
  }
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const result: { day: number; cumPips: number }[] = [];
  let cumPips = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    cumPips += byDay[d] ?? 0;
    if (byDay[d] !== undefined || d === daysInMonth) {
      result.push({ day: d, cumPips: Math.round(cumPips * 10) / 10 });
    }
  }
  return result;
}

export function calcStatsByPair(trades: Trade[]) {
  const map: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of trades) {
    if (!map[t.pair]) map[t.pair] = { wins: 0, total: 0, pips: 0 };
    map[t.pair].total++;
    if (t.result === 'win') map[t.pair].wins++;
    map[t.pair].pips += t.pips ?? 0;
  }
  return Object.entries(map)
    .map(([pair, d]) => ({
      pair,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      totalTrades: d.total,
      avgPips: Math.round((d.pips / d.total) * 10) / 10,
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

export function calcStatsByStyle(trades: Trade[]) {
  const map: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of trades) {
    if (!map[t.style]) map[t.style] = { wins: 0, total: 0, pips: 0 };
    map[t.style].total++;
    if (t.result === 'win') map[t.style].wins++;
    map[t.style].pips += t.pips ?? 0;
  }
  return Object.entries(map)
    .map(([style, d]) => ({
      style,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      totalTrades: d.total,
      avgPips: Math.round((d.pips / d.total) * 10) / 10,
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

export function calcRatingDistribution(trades: Trade[]): Record<number, number> {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const t of trades) {
    const r = Math.min(5, Math.max(1, Math.round(t.selfRating)));
    dist[r] = (dist[r] ?? 0) + 1;
  }
  return dist;
}

export function calcMonthlyBreakdown(trades: Trade[], year: string) {
  const months: Record<string, Trade[]> = {};
  for (let m = 1; m <= 12; m++) {
    months[`${year}-${String(m).padStart(2, '0')}`] = [];
  }
  for (const t of trades) {
    const key = t.date.slice(0, 7);
    if (months[key]) months[key].push(t);
  }
  return Object.entries(months).map(([month, ts]) => {
    const s = calcStats(ts);
    return { month, label: `${parseInt(month.slice(5))}月`, ...s };
  });
}

export function calcCurrentStreak(trades: Trade[]): { type: 'win' | 'loss' | 'none'; count: number } {
  if (trades.length === 0) return { type: 'none', count: 0 };
  const sorted = [...trades].sort((a, b) => b.date.localeCompare(a.date));
  const first = sorted[0].result;
  if (first === 'even') return { type: 'none', count: 0 };
  let count = 0;
  for (const t of sorted) {
    if (t.result === first) count++; else break;
  }
  return { type: first as 'win' | 'loss', count };
}

export function getBestTrade(trades: Trade[]): Trade | null {
  if (!trades.length) return null;
  return trades.reduce((b, t) => (t.pips ?? -Infinity) > (b.pips ?? -Infinity) ? t : b);
}

export function getWorstTrade(trades: Trade[]): Trade | null {
  if (!trades.length) return null;
  return trades.reduce((w, t) => (t.pips ?? Infinity) < (w.pips ?? Infinity) ? t : w);
}

// 機能3: 時間帯別分析
export function calcTimeAnalysis(trades: Trade[]) {
  const byHour: Record<number, { wins: number; total: number; pips: number }> = {};
  for (let h = 0; h < 24; h++) byHour[h] = { wins: 0, total: 0, pips: 0 };
  for (const t of trades) {
    const timeStr = t.date.slice(11, 13);
    if (!timeStr) continue;
    const h = parseInt(timeStr, 10);
    if (isNaN(h)) continue;
    byHour[h].total++;
    if (t.result === 'win') byHour[h].wins++;
    byHour[h].pips += t.pips ?? 0;
  }
  return Object.entries(byHour)
    .filter(([, d]) => d.total > 0)
    .map(([hour, d]) => ({
      hour: parseInt(hour),
      label: `${hour}時`,
      total: d.total,
      wins: d.wins,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      avgPips: Math.round((d.pips / d.total) * 10) / 10,
    }))
    .sort((a, b) => a.hour - b.hour);
}

// 機能3: 曜日別分析
export function calcDayAnalysis(trades: Trade[]) {
  const DOW_LABELS = tArr('day_labels');
  const byDay: Record<number, { wins: number; total: number; pips: number }> = {};
  for (let d = 0; d < 7; d++) byDay[d] = { wins: 0, total: 0, pips: 0 };
  for (const t of trades) {
    const dow = new Date(t.date.slice(0, 10)).getDay();
    byDay[dow].total++;
    if (t.result === 'win') byDay[dow].wins++;
    byDay[dow].pips += t.pips ?? 0;
  }
  return Object.entries(byDay)
    .filter(([, d]) => d.total > 0)
    .map(([day, d]) => ({
      day: parseInt(day),
      label: `${DOW_LABELS[parseInt(day)]}曜`,
      total: d.total,
      wins: d.wins,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      avgPips: Math.round((d.pips / d.total) * 10) / 10,
    }))
    .sort((a, b) => a.day - b.day);
}

// 機能1: RR統計
export function calcRRStats(trades: Trade[]) {
  const withPlanned = trades.filter(t => t.plannedRR != null);
  const avgPlannedRR = withPlanned.length > 0
    ? Math.round(withPlanned.reduce((s, t) => s + (t.plannedRR ?? 0), 0) / withPlanned.length * 100) / 100
    : 0;
  // 実際のRR = pips / |sl pips| (SLレートをpipsに変換してから除算)
  const actualRRTrades = trades.filter(
    (t): t is Trade & { entryRate: number; stopLoss: number; pips: number } =>
      t.stopLoss != null && t.pips != null && t.entryRate != null
  );
  const actualRRs = actualRRTrades.map(t => {
    const pipMultiplier = t.entryRate > 10 ? 100 : 10000;
    const slRateDiff = Math.abs(
      t.direction === 'buy'
        ? t.entryRate - t.stopLoss
        : t.stopLoss - t.entryRate
    );
    const slPips = slRateDiff * pipMultiplier;
    return slPips > 0 ? Math.round(t.pips / slPips * 100) / 100 : 0;
  });
  const avgActualRR = actualRRs.length > 0
    ? Math.round(actualRRs.reduce((s, v) => s + v, 0) / actualRRs.length * 100) / 100
    : 0;
  return { avgPlannedRR, avgActualRR, tradesWithRR: withPlanned.length };
}

// 機能2: タグ統計
export function calcTagStats(trades: Trade[]) {
  const map: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of trades) {
    for (const tag of (t.tags ?? [])) {
      if (!map[tag]) map[tag] = { wins: 0, total: 0, pips: 0 };
      map[tag].total++;
      if (t.result === 'win') map[tag].wins++;
      map[tag].pips += t.pips ?? 0;
    }
  }
  return Object.entries(map)
    .map(([tag, d]) => ({
      tag,
      total: d.total,
      wins: d.wins,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      avgPips: Math.round((d.pips / d.total) * 10) / 10,
    }))
    .sort((a, b) => b.total - a.total);
}

// エクイティカーブ（残高推移）
export function calcEquityCurve(trades: Trade[], initialBalance: number) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const points: { label: string; cumPips: number; balance: number }[] = [];
  let cumPips = 0;
  let balance = initialBalance;
  for (const t of sorted) {
    cumPips = Math.round((cumPips + (t.pips ?? 0)) * 10) / 10;
    balance = Math.round(balance + (t.profitLoss ?? 0));
    points.push({
      label: t.date.slice(5, 10).replace('-', '/'),
      cumPips,
      balance,
    });
  }
  return points;
}

// メンタル統計：集中度・冷静さ・焦り度 vs 勝率
export function calcMentalStats(trades: Trade[]) {
  const withMental = trades.filter(t => t.mentalFocus != null);
  if (withMental.length === 0) return null;

  const buckets = (key: 'mentalFocus' | 'mentalCalm' | 'mentalFear') => {
    const high = withMental.filter(t => (t[key] ?? 0) >= 4);
    const mid = withMental.filter(t => (t[key] ?? 0) === 3);
    const low = withMental.filter(t => (t[key] ?? 0) <= 2);
    const wr = (arr: Trade[]) =>
      arr.length === 0 ? null : Math.round(arr.filter(t => t.result === 'win').length / arr.length * 1000) / 10;
    return { high: wr(high), mid: wr(mid), low: wr(low), highCount: high.length, lowCount: low.length };
  };

  const avgScore = (key: 'mentalFocus' | 'mentalCalm' | 'mentalFear') => {
    const vals = withMental.map(t => t[key] ?? 0);
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10;
  };

  return {
    count: withMental.length,
    focus: { ...buckets('mentalFocus'), avg: avgScore('mentalFocus') },
    calm: { ...buckets('mentalCalm'), avg: avgScore('mentalCalm') },
    fear: { ...buckets('mentalFear'), avg: avgScore('mentalFear') },
  };
}

// ルール遵守統計
export function calcRuleStats(trades: Trade[], rules: string[]) {
  if (rules.length === 0) return [];
  const tradesWithRules = trades.filter(t => t.ruleChecks && t.ruleChecks.length > 0);
  return rules.map(rule => {
    const followed = trades.filter(t => t.ruleChecks?.includes(rule));
    const notFollowed = trades.filter(t => t.ruleChecks !== undefined && !t.ruleChecks.includes(rule) && t.ruleChecks.length > 0);
    const wr = (arr: Trade[]) =>
      arr.length === 0 ? null : Math.round(arr.filter(t => t.result === 'win').length / arr.length * 1000) / 10;
    return {
      rule,
      followedCount: followed.length,
      followedWinRate: wr(followed),
      notFollowedWinRate: wr(notFollowed),
    };
  }).filter(r => r.followedCount > 0);
}

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

import type { Trade, DailyStats } from '../types';
import { t, tArr } from '../i18n';

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
  // pl は損益の合計、plCount は損益が記録されている件数。
  // 平均を出すときは total ではなく plCount で割る（損益が無い行を
  // 母数に入れると平均が0方向へ薄まるため）。
  const map: Record<string, { wins: number; total: number; pips: number; pipsCount: number; pl: number; plCount: number }> = {};
  for (const t of trades) {
    if (!map[t.pair]) map[t.pair] = { wins: 0, total: 0, pips: 0, pipsCount: 0, pl: 0, plCount: 0 };
    map[t.pair].total++;
    if (t.result === 'win') map[t.pair].wins++;
    if (t.pips != null) { map[t.pair].pips += t.pips; map[t.pair].pipsCount++; }
    if (t.profitLoss != null) { map[t.pair].pl += t.profitLoss; map[t.pair].plCount++; }
  }
  return Object.entries(map)
    .map(([pair, d]) => ({
      pair,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      totalTrades: d.total,
      avgPips: d.pipsCount > 0 ? Math.round((d.pips / d.pipsCount) * 10) / 10 : null,
      totalPL: Math.round(d.pl),
      avgPL: d.plCount > 0 ? Math.round(d.pl / d.plCount) : null,
      pipsCount: d.pipsCount,
      plCount: d.plCount,
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

export function calcStatsByStyle(trades: Trade[]) {
  // pl は損益の合計、plCount は損益が記録されている件数。
  // 平均を出すときは total ではなく plCount で割る（損益が無い行を
  // 母数に入れると平均が0方向へ薄まるため）。
  const map: Record<string, { wins: number; total: number; pips: number; pipsCount: number; pl: number; plCount: number }> = {};
  for (const t of trades) {
    if (!map[t.style]) map[t.style] = { wins: 0, total: 0, pips: 0, pipsCount: 0, pl: 0, plCount: 0 };
    map[t.style].total++;
    if (t.result === 'win') map[t.style].wins++;
    if (t.pips != null) { map[t.style].pips += t.pips; map[t.style].pipsCount++; }
    if (t.profitLoss != null) { map[t.style].pl += t.profitLoss; map[t.style].plCount++; }
  }
  return Object.entries(map)
    .map(([style, d]) => ({
      style,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      totalTrades: d.total,
      avgPips: d.pipsCount > 0 ? Math.round((d.pips / d.pipsCount) * 10) / 10 : null,
      totalPL: Math.round(d.pl),
      avgPL: d.plCount > 0 ? Math.round(d.pl / d.plCount) : null,
      pipsCount: d.pipsCount,
      plCount: d.plCount,
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
    return { month, label: tArr('month_names')[parseInt(month.slice(5)) - 1], ...s };
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
  const byHour: Record<number, { wins: number; total: number; pips: number; pipsCount: number; pl: number; plCount: number }> = {};
  for (let h = 0; h < 24; h++) byHour[h] = { wins: 0, total: 0, pips: 0, pipsCount: 0, pl: 0, plCount: 0 };
  for (const t of trades) {
    const timeStr = t.date.slice(11, 13);
    if (!timeStr) continue;
    const h = parseInt(timeStr, 10);
    if (isNaN(h)) continue;
    byHour[h].total++;
    if (t.result === 'win') byHour[h].wins++;
    if (t.pips != null) { byHour[h].pips += t.pips; byHour[h].pipsCount++; }
    if (t.profitLoss != null) { byHour[h].pl += t.profitLoss; byHour[h].plCount++; }
  }
  return Object.entries(byHour)
    .filter(([, d]) => d.total > 0)
    .map(([hour, d]) => ({
      hour: parseInt(hour),
      label: t('hour_label').replace('{h}', hour),
      total: d.total,
      wins: d.wins,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      avgPips: d.pipsCount > 0 ? Math.round((d.pips / d.pipsCount) * 10) / 10 : null,
      totalPL: Math.round(d.pl),
      avgPL: d.plCount > 0 ? Math.round(d.pl / d.plCount) : null,
      pipsCount: d.pipsCount,
      plCount: d.plCount,
    }))
    .sort((a, b) => a.hour - b.hour);
}

// 機能3: 曜日別分析
export function calcDayAnalysis(trades: Trade[]) {
  const DOW_LABELS = tArr('day_labels');
  const byDay: Record<number, { wins: number; total: number; pips: number; pipsCount: number; pl: number; plCount: number }> = {};
  for (let d = 0; d < 7; d++) byDay[d] = { wins: 0, total: 0, pips: 0, pipsCount: 0, pl: 0, plCount: 0 };
  for (const t of trades) {
    // `new Date('2026-08-29')` は**UTC深夜**として解釈されるのに getDay() は
    // ローカル基準で評価するため、UTCより西（南北アメリカ全域）では曜日が1日ずれる。
    // 保存されている日付はローカル時刻なので、T00:00:00 を付けてローカル解釈に揃える
    // （calendarMetrics.ts は元からこの形式）。
    const dow = new Date(`${t.date.slice(0, 10)}T00:00:00`).getDay();
    byDay[dow].total++;
    if (t.result === 'win') byDay[dow].wins++;
    if (t.pips != null) { byDay[dow].pips += t.pips; byDay[dow].pipsCount++; }
    if (t.profitLoss != null) { byDay[dow].pl += t.profitLoss; byDay[dow].plCount++; }
  }
  return Object.entries(byDay)
    .filter(([, d]) => d.total > 0)
    .map(([day, d]) => ({
      day: parseInt(day),
      label: `${DOW_LABELS[parseInt(day)]}${t('day_suffix')}`,
      total: d.total,
      wins: d.wins,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      avgPips: d.pipsCount > 0 ? Math.round((d.pips / d.pipsCount) * 10) / 10 : null,
      totalPL: Math.round(d.pl),
      avgPL: d.plCount > 0 ? Math.round(d.pl / d.plCount) : null,
      pipsCount: d.pipsCount,
      plCount: d.plCount,
    }))
    .sort((a, b) => a.day - b.day);
}

export interface HeatmapCell {
  dow: number;
  hour: number;
  total: number;
  wins: number;
  avgPips: number;
}

// 曜日×時間帯のヒートマップ用グリッド（7行×24列、常に全セルを返す）
export function calcHourDayHeatmap(trades: Trade[]): HeatmapCell[][] {
  const grid: { total: number; wins: number; pips: number }[][] =
    Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ total: 0, wins: 0, pips: 0 })));

  for (const tr of trades) {
    const timeStr = tr.date.slice(11, 13);
    if (!timeStr) continue;
    const hour = parseInt(timeStr, 10);
    if (isNaN(hour)) continue;
    const dow = new Date(`${tr.date.slice(0, 10)}T00:00:00`).getDay();
    const cell = grid[dow][hour];
    cell.total++;
    if (tr.result === 'win') cell.wins++;
    cell.pips += tr.pips ?? 0;
  }

  return grid.map((row, dow) => row.map((cell, hour) => ({
    dow,
    hour,
    total: cell.total,
    wins: cell.wins,
    avgPips: cell.total > 0 ? Math.round((cell.pips / cell.total) * 10) / 10 : 0,
  })));
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
  // pl は損益の合計、plCount は損益が記録されている件数。
  // 平均を出すときは total ではなく plCount で割る（損益が無い行を
  // 母数に入れると平均が0方向へ薄まるため）。
  const map: Record<string, { wins: number; total: number; pips: number; pipsCount: number; pl: number; plCount: number }> = {};
  for (const t of trades) {
    for (const tag of (t.tags ?? [])) {
      if (!map[tag]) map[tag] = { wins: 0, total: 0, pips: 0, pipsCount: 0, pl: 0, plCount: 0 };
      map[tag].total++;
      if (t.result === 'win') map[tag].wins++;
      if (t.pips != null) { map[tag].pips += t.pips; map[tag].pipsCount++; }
      if (t.profitLoss != null) { map[tag].pl += t.profitLoss; map[tag].plCount++; }
    }
  }
  return Object.entries(map)
    .map(([tag, d]) => ({
      tag,
      total: d.total,
      wins: d.wins,
      winRate: Math.round((d.wins / d.total) * 1000) / 10,
      avgPips: d.pipsCount > 0 ? Math.round((d.pips / d.pipsCount) * 10) / 10 : null,
      totalPL: Math.round(d.pl),
      avgPL: d.plCount > 0 ? Math.round(d.pl / d.plCount) : null,
      pipsCount: d.pipsCount,
      plCount: d.plCount,
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

  // 集中度・冷静さ・焦り度は独立した入力で、片方だけ記録できる。
  // 以前は withMental（集中度が入っている行）を全項目の母数にしたうえで
  // `?? 0` を掛けていたため、**未入力の項目が「スコア0＝低」として集計**され、
  // 「冷静さが低い時の勝率」に冷静さを記録していない行が混入していた。
  // 項目ごとに、その項目が実際に記録されている行だけを母数にする。
  const buckets = (key: 'mentalFocus' | 'mentalCalm' | 'mentalFear') => {
    const rated = withMental.filter(t => t[key] != null);
    const high = rated.filter(t => (t[key] as number) >= 4);
    const mid = rated.filter(t => (t[key] as number) === 3);
    const low = rated.filter(t => (t[key] as number) <= 2);
    const wr = (arr: Trade[]) =>
      arr.length === 0 ? null : Math.round(arr.filter(t => t.result === 'win').length / arr.length * 1000) / 10;
    return { high: wr(high), mid: wr(mid), low: wr(low), highCount: high.length, lowCount: low.length };
  };

  const avgScore = (key: 'mentalFocus' | 'mentalCalm' | 'mentalFear') => {
    // 未入力を0として平均に混ぜると、実際の入力値より大きく下振れする
    const vals = withMental.filter(t => t[key] != null).map(t => t[key] as number);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, v) => a + v, 0) / vals.length * 10) / 10;
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

/**
 * 金額ベースの成績指標。
 *
 * これまで統計はすべて pips 基準だった。pips はロットに依存しないので
 * 手法の良し悪しを見るには適しているが、**「結局いくら儲かったのか」**は
 * 分からない。トレーダーが最も知りたい期待値・リスクは金額で決まる。
 *
 * profitLoss が入っていないトレードは母数から除外し、カバー率を併せて返す。
 * 母数が異なる数値を「合計」として並べると、合計pipsがマイナスなのに
 * 損益合計がプラス、といった矛盾が生じるため（実際に発生していた）。
 */
export interface MoneyStats {
  /** 損益が記録されている件数 */
  covered: number;
  /** 全件数（カバー率の分母） */
  total: number;
  /** 損益の合計 */
  totalPL: number;
  /** 勝ちトレードの平均利益（正の値） */
  avgWin: number | null;
  /** 負けトレードの平均損失（正の値で返す） */
  avgLoss: number | null;
  /** リスクリワード = 平均利益 ÷ 平均損失。損失0なら Infinity */
  riskReward: number | null;
  /** 金額ベースのプロフィットファクター = 総利益 ÷ 総損失 */
  profitFactor: number | null;
  /** 最大ドローダウン（正の値）。損益の累積が直近の最高値からどれだけ落ちたか */
  maxDrawdown: number;
  /** 1トレードあたりの期待値 */
  expectancy: number | null;
}

export function calcMoneyStats(trades: Trade[]): MoneyStats {
  const withPL = trades.filter(t => t.profitLoss != null);
  const total = trades.length;
  const covered = withPL.length;

  if (covered === 0) {
    return {
      covered: 0, total, totalPL: 0,
      avgWin: null, avgLoss: null, riskReward: null,
      profitFactor: null, maxDrawdown: 0, expectancy: null,
    };
  }

  const vals = withPL.map(t => t.profitLoss as number);
  const totalPL = Math.round(vals.reduce((s, v) => s + v, 0));

  const wins = vals.filter(v => v > 0);
  const losses = vals.filter(v => v < 0);
  const grossProfit = wins.reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(losses.reduce((s, v) => s + v, 0));

  const avgWin = wins.length > 0 ? Math.round(grossProfit / wins.length) : null;
  const avgLoss = losses.length > 0 ? Math.round(grossLoss / losses.length) : null;

  const riskReward = (avgWin != null && avgLoss != null && avgLoss > 0)
    ? Math.round((avgWin / avgLoss) * 100) / 100
    : (avgWin != null && (avgLoss == null || avgLoss === 0)) ? Infinity : null;

  const profitFactor = grossLoss > 0
    ? Math.round((grossProfit / grossLoss) * 100) / 100
    : grossProfit > 0 ? Infinity : 0;

  // 最大ドローダウン: 日付順に累積し、直近の最高値からの落ち幅の最大
  const sorted = [...withPL].sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0, peak = 0, maxDD = 0;
  for (const t of sorted) {
    cum += t.profitLoss as number;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    covered, total, totalPL,
    avgWin, avgLoss, riskReward, profitFactor,
    maxDrawdown: Math.round(maxDD),
    expectancy: Math.round(totalPL / covered),
  };
}

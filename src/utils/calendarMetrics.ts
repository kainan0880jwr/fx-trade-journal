import type { Trade } from '../types';
import type { ThemeColors } from '../theme/colors';
import { t } from '../i18n';

export type CalMetric = 'pips' | 'pl' | 'winRate' | 'count' | 'wl' | 'pf';

export const METRICS: { key: CalMetric; labelKey: string }[] = [
  { key: 'pips',    labelKey: 'cal_metric_pips' },
  { key: 'pl',      labelKey: 'cal_metric_pl' },
  { key: 'winRate', labelKey: 'cal_metric_winrate' },
  { key: 'count',   labelKey: 'cal_metric_count' },
  { key: 'wl',      labelKey: 'cal_metric_wl' },
  { key: 'pf',      labelKey: 'cal_metric_pf' },
];

export interface DayStat {
  trades: number;
  wins: number;
  losses: number;
  pips: number;
  pl: number;
  winPips: number;
  lossPips: number;
}

export function buildDayMap(trades: Trade[]): Record<string, DayStat> {
  const map: Record<string, DayStat> = {};
  for (const tr of trades) {
    const day = tr.date.slice(0, 10);
    if (!map[day]) map[day] = { trades: 0, wins: 0, losses: 0, pips: 0, pl: 0, winPips: 0, lossPips: 0 };
    map[day].trades++;
    if (tr.result === 'win') {
      map[day].wins++;
      map[day].winPips += tr.pips ?? 0;
    }
    if (tr.result === 'loss') {
      map[day].losses++;
      map[day].lossPips += tr.pips ?? 0;
    }
    map[day].pips = Math.round((map[day].pips + (tr.pips ?? 0)) * 10) / 10;
    map[day].pl += tr.profitLoss ?? 0;
  }
  return map;
}

export function calcPF(ds: DayStat): number {
  const lp = Math.abs(ds.lossPips);
  if (lp === 0) return ds.winPips > 0 ? Infinity : 0;
  return Math.round(ds.winPips / lp * 100) / 100;
}

export function calcMonthPF(trades: Trade[]): number {
  const wp = trades.filter(tr => tr.result === 'win').reduce((sum, tr) => sum + (tr.pips ?? 0), 0);
  const lp = Math.abs(trades.filter(tr => tr.result === 'loss').reduce((sum, tr) => sum + (tr.pips ?? 0), 0));
  if (lp === 0) return wp > 0 ? Infinity : 0;
  return Math.round(wp / lp * 100) / 100;
}

export function formatPF(pf: number): string {
  if (pf === 0) return '-';
  if (!isFinite(pf)) return '∞';
  return String(pf);
}

export function getDayValue(ds: DayStat, metric: CalMetric): string {
  switch (metric) {
    case 'pips': {
      const sign = ds.pips > 0 ? '+' : '';
      return `${sign}${ds.pips}`;
    }
    case 'pl': {
      const sign = ds.pl > 0 ? '+' : '';
      return `${sign}${Math.round(ds.pl).toLocaleString()}`;
    }
    case 'winRate':
      if (ds.trades === 0) return '-';
      return `${Math.round(ds.wins / ds.trades * 100)}%`;
    case 'count':
      return `${ds.trades}${t('count_unit')}`;
    case 'wl':
      return `${ds.wins}${t('win_short')}${ds.losses}${t('loss_short')}`;
    case 'pf':
      return formatPF(calcPF(ds));
  }
}

export function getDayBg(ds: DayStat, metric: CalMetric, C: ThemeColors): string {
  switch (metric) {
    case 'pips':
      return ds.pips > 0 ? C.win + '28' : ds.pips < 0 ? C.loss + '28' : C.border + '80';
    case 'pl':
      return ds.pl > 0 ? C.win + '28' : ds.pl < 0 ? C.loss + '28' : C.border + '80';
    case 'winRate': {
      if (ds.trades === 0) return 'transparent';
      const r = ds.wins / ds.trades * 100;
      return r > 50 ? C.win + '28' : r < 50 ? C.loss + '28' : C.border + '80';
    }
    case 'count':
      return ds.trades > 0 ? C.primary + '22' : 'transparent';
    case 'wl':
      return ds.wins > ds.losses ? C.win + '28' : ds.wins < ds.losses ? C.loss + '28' : C.border + '80';
    case 'pf': {
      const pf = calcPF(ds);
      if (pf === 0) return 'transparent';
      return !isFinite(pf) || pf > 1 ? C.win + '28' : pf < 1 ? C.loss + '28' : C.border + '80';
    }
  }
}

export function getDayValueColor(ds: DayStat, metric: CalMetric, C: ThemeColors): string {
  switch (metric) {
    case 'pips':    return ds.pips >= 0 ? C.win : C.loss;
    case 'pl':      return ds.pl >= 0 ? C.win : C.loss;
    case 'winRate': {
      if (ds.trades === 0) return C.text2;
      return ds.wins / ds.trades * 100 >= 50 ? C.win : C.loss;
    }
    case 'count':   return C.primary;
    case 'wl':      return ds.wins >= ds.losses ? C.win : C.loss;
    case 'pf': {
      const pf = calcPF(ds);
      if (pf === 0) return C.text2;
      return !isFinite(pf) || pf >= 1 ? C.win : C.loss;
    }
  }
}

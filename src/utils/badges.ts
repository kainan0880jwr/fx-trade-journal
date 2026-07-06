import type { Trade } from '../types';
import { t } from '../i18n';

export interface BadgeDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  category: 'record' | 'performance' | 'habit' | 'analysis';
}

export interface UnlockedBadge extends BadgeDef {
  unlocked: boolean;
  progress: number;
  target: number;
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
];

function withTranslations(defs: BadgeDef[]): BadgeDef[] {
  return defs.map(d => ({
    ...d,
    title: t(`badge_${d.id}_title` as any) || d.title,
    description: t(`badge_${d.id}_desc` as any) || d.description,
  }));
}

export function calcBadges(trades: Trade[]): UnlockedBadge[] {
  const total = trades.length;

  // 最長連勝計算
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let maxStreak = 0, cur = 0;
  for (const t of sorted) {
    if (t.result === 'win') { cur++; if (cur > maxStreak) maxStreak = cur; }
    else cur = 0;
  }

  // 月別最大pips
  const monthMap: Record<string, number> = {};
  for (const t of trades) {
    const m = t.date.slice(0, 7);
    monthMap[m] = (monthMap[m] ?? 0) + (t.pips ?? 0);
  }
  const maxMonthPips = Math.max(...Object.values(monthMap), 0);

  const reflections  = trades.filter(t => t.reflection?.trim().length > 0).length;
  const mentalCount  = trades.filter(t => t.mentalFocus != null).length;
  const ruleCount    = trades.filter(t => (t.ruleChecks ?? []).length > 0).length;
  const imageCount   = trades.filter(t => (t.imageUris ?? []).length > 0).length;
  const rrCount      = trades.filter(t => t.plannedRR != null).length;
  const tfCount      = trades.filter(t => t.tfWeekly || t.tfDaily || t.tf4h || t.tf1h).length;

  const prog: Record<string, { p: number; t: number }> = {
    first_trade:    { p: total,          t: 1   },
    trades_10:      { p: total,          t: 10  },
    trades_50:      { p: total,          t: 50  },
    trades_100:     { p: total,          t: 100 },
    win3:           { p: maxStreak,      t: 3   },
    win5:           { p: maxStreak,      t: 5   },
    pips50:         { p: maxMonthPips,   t: 50  },
    pips100:        { p: maxMonthPips,   t: 100 },
    reflection_10:  { p: reflections,    t: 10  },
    mental_10:      { p: mentalCount,    t: 10  },
    rule_10:        { p: ruleCount,      t: 10  },
    image_5:        { p: imageCount,     t: 5   },
    rr_10:          { p: rrCount,        t: 10  },
    tf_10:          { p: tfCount,        t: 10  },
  };

  return withTranslations(BADGE_DEFS).map(def => {
    const { p, t } = prog[def.id] ?? { p: 0, t: 1 };
    return { ...def, unlocked: p >= t, progress: p, target: t };
  });
}

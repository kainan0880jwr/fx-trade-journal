/**
 * ウィジェットへ渡すペイロードを組み立てる。**DBには触らない純粋関数。**
 *
 * ■ なぜ3期間まとめて書くのか
 *
 * ウィジェットの拡張プロセスは暗号化DBを読めない（鍵はアプリ本体のキーチェーン領域）。
 * したがって「今日/今週/今月」を切り替えるたびに計算する、という作りはできない。
 * **アプリ側が3期間ぶんを1つのペイロードに書き、ウィジェットは選んで描くだけ**にする。
 * 切り替えが即座に効き、拡張側に計算を持ち込まずに済む。
 *
 * ■ 陳腐化（これが一番危ない）
 *
 * 日付が変わった瞬間、「今日」の数字は**昨日のもの**になる。アプリを開くまで
 * 更新されないので、ウィジェットは黙って間違った値を出し続ける。しかも
 * ウィジェットはこのアプリで最も目に入る面である。
 *
 * そのため **どの日・どの週・どの月を集計した値なのかをペイロードに持たせる**。
 * 描画側は現在の日付と突き合わせ、ずれていればその期間を「—」にする。
 * `computedDay` / `computedWeek` / `computedMonth` がその印。
 *
 * **週の始まりは日曜で固定する。** `goals.ts` の `weekStart()` が `getDay()` を
 * 使っており日曜始まりなので、描画側もロケール依存の `Calendar.firstWeekday` では
 * なく日曜で計算すること。ドイツ語環境などで月曜始まりになると、週の判定が
 * 1日ずれて「今週」が勝手に古い扱いになる。
 */
import type { Trade, AppSettings } from '../types';
import { calcStats } from './statsCalc';
import { evaluatePeriod, weekStart, dayOf, type GoalPeriod } from './goals';

export interface WidgetPeriod {
  /** 'day' | 'week' | 'month' */
  key: GoalPeriod;
  /** 翻訳済みの見出し（「今日」など） */
  label: string;
  winRate: string;
  pips: string;
  pf: string;
  count: string;
  /** pips が 0 以上か。色分けに使う */
  isPositive: number;
  hasData: number;
  /** 設定されている目標の数。0 なら目標のリングを出さない */
  goalTotal: number;
  /** そのうち達成した数 */
  goalDone: number;
  /** 0〜1。達成率の平均。「あとどれくらいか」をリングの塗りで出すため */
  goalProgress: number;
}

export interface WidgetPayloadInput {
  /** 当月のトレード（今月・今日の集計に使う） */
  monthTrades: Trade[];
  /** 今週のトレード。週は月をまたぐので呼び出し側が集めて渡す */
  weekTrades: Trade[];
  settings: AppSettings;
  rules: string[];
  /** 翻訳済みラベル。この層は i18n を呼ばない（テストしやすさのため） */
  labels: { day: string; week: string; month: string };
  now?: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ym(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 0〜1 に丸めた達成率。目標が「ルールを守る」のような真偽値でも 0/1 で扱える。 */
function progressOf(current: number | null, target: number): number {
  if (current == null || target <= 0) return 0;
  const r = current / target;
  return r < 0 ? 0 : r > 1 ? 1 : r;
}

function buildPeriod(
  key: GoalPeriod,
  label: string,
  trades: Trade[],
  settings: AppSettings,
  rules: string[]
): WidgetPeriod {
  const stats = calcStats(trades);
  const has = stats.totalTrades > 0;
  const goal = evaluatePeriod(key, trades, settings, rules);

  // プロフィットファクターは grossLoss が 0 のとき Infinity になる。JSONに載せられない。
  const pf = !has ? '-' : stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2);

  const progresses = goal.goals.map(g => progressOf(g.current, g.target));
  const goalProgress = progresses.length === 0
    ? 0
    : progresses.reduce((a, b) => a + b, 0) / progresses.length;

  return {
    key,
    label,
    winRate: has ? `${stats.winRate}%` : '-',
    pips: has ? `${stats.totalPips > 0 ? '+' : ''}${stats.totalPips}` : '-',
    pf,
    count: has ? String(stats.totalTrades) : '-',
    isPositive: stats.totalPips >= 0 ? 1 : 0,
    hasData: has ? 1 : 0,
    goalTotal: goal.goals.length,
    goalDone: goal.goals.filter(g => g.achieved).length,
    // 小数をそのまま載せると桁が暴れるので2桁に丸める（リングの塗りには十分）
    goalProgress: Math.round(goalProgress * 100) / 100,
  };
}

export interface WidgetPeriodsPayload {
  periods: WidgetPeriod[];
  /** いつ時点の集計か。描画側はこれと現在日時を比べて陳腐化を判定する */
  computedDay: string;
  computedWeek: string;
  computedMonth: string;
}

export function buildWidgetPeriods(input: WidgetPayloadInput): WidgetPeriodsPayload {
  const now = input.now ?? new Date();
  const today = ymd(now);
  const thisWeekStart = weekStart(today);

  const todayTrades = input.monthTrades.filter(t => dayOf(t.date) === today);

  return {
    periods: [
      buildPeriod('day', input.labels.day, todayTrades, input.settings, input.rules),
      buildPeriod('week', input.labels.week, input.weekTrades, input.settings, input.rules),
      buildPeriod('month', input.labels.month, input.monthTrades, input.settings, input.rules),
    ],
    computedDay: today,
    computedWeek: thisWeekStart,
    computedMonth: ym(now),
  };
}

/**
 * 今週のトレードを集めるのに必要な「月」の一覧。
 * 週は月をまたぐ（例: 9/28(日)〜10/4(土)）ので、週の始まりが前月なら2か月ぶん要る。
 * 呼び出し側はこの一覧ぶんだけ `getTradesByMonth` を呼べばよい。
 */
export function monthsNeededForWeek(now: Date = new Date()): string[] {
  const start = weekStart(ymd(now));
  const startMonth = start.slice(0, 7);
  const nowMonth = ym(now);
  return startMonth === nowMonth ? [nowMonth] : [startMonth, nowMonth];
}

/** 今週に含まれる日付か。月をまたいだトレードを絞り込むのに使う。 */
export function isInThisWeek(date: string, now: Date = new Date()): boolean {
  return weekStart(dayOf(date)) === weekStart(ymd(now));
}

/**
 * App Store 用スクリーンショットを撮るための、デモデータ投入モード。
 *
 * なぜ要るか: 空のカレンダーや0件の分析画面を撮っても何も伝わらない。
 * かといって手で20件入力するのは11ロケールぶん繰り返せない。前回（2026-09-01）も
 * 同じ仕組みを一時的に入れて撮ったが、**コミットしていなかったので失われた。**
 * 今度は残す。
 *
 * ■ 有効になる条件（本番に混ざらないための二重の歯止め）
 *
 *   __DEV__ が true  かつ  EXPO_PUBLIC_SCREENSHOT_MODE === '1'
 *
 * production プロファイルのビルドでは `__DEV__` が false なので、環境変数を
 * 取り違えても実データは消えない。加えて `scripts/check-prod-keys.js` が
 * production ビルド時にこの環境変数が立っていたら中断する。
 *
 * ■ 数字の作り方
 *
 * 現実的に見える範囲に収めてある。**勝率59.1% / PF2.09 / +134.1 pips / 13勝9敗。**
 * 極端な好成績は避ける方針で、LPのモック（旧値 勝率78% / PF7.75）は
 * 「現実のFXとして極端で打消し表示が要る水準」として 62% / 1.50 に直した経緯がある。
 * ストアのスクショも同じ考え方に揃える。
 *
 * PF は `statsCalc.ts` の実装どおり **pips ベース**（損益額ベースではない）なので、
 * ロット数を件ごとに散らしても PF は pips 比のまま保たれる。
 *
 * 通貨ペアは**クロス円だけ**にしてある。損益額はクロス円でしか算出されない仕様
 * （`profitCalc.ts` は `is_yen_pair=1` 専用）なので、非円ペアを混ぜると
 * その行だけ金額が出ず、スクショとして間が抜ける。
 *
 * 振り返りメモは**入れていない**。11言語ぶんの文面を新しく訳し起こすことになり、
 * `i18n/__tests__/consistency.test.ts` の管理下にも入らない中途半端な翻訳が増えるため。
 * タグ・自己評価・ルールチェックで情報量を出している。
 */
import { getDatabase } from '../db/database';
import {
  insertTrade, setSetting, saveTradeRules, saveEntryTags,
  updateRecordStreak, GOAL_SETTING_KEYS,
} from '../db/queries';
import { calcProfitLoss, determineResult } from './profitCalc';
import { ruleFollowedDays } from './goals';
import { usePurchaseStore } from '../store/purchaseStore';
import { tArr } from '../i18n';
import type { Trade } from '../types';

const LOT_UNIT = 10000;

/** 日付順に並べたデモトレード。pips と勝敗は固定で、合計が上のコメントの数字になる。 */
export const DEMO_TRADES: {
  pips: number; lot: number; pair: string; direction: 'buy' | 'sell';
  style: Trade['style']; hour: number; minute: number;
  tagIndexes: number[]; rating: number; rulesFollowed: number; bookmarked?: boolean;
}[] = [
  { pips:  22.1, lot: 2.0, pair: 'USD/JPY', direction: 'buy',  style: 'day',   hour:  9, minute: 15, tagIndexes: [0],    rating: 4, rulesFollowed: 3 },
  { pips: -18.7, lot: 1.5, pair: 'EUR/JPY', direction: 'sell', style: 'swing', hour: 16, minute: 20, tagIndexes: [1],    rating: 2, rulesFollowed: 1 },
  { pips:  19.6, lot: 3.0, pair: 'GBP/JPY', direction: 'buy',  style: 'day',   hour: 10, minute: 40, tagIndexes: [2],    rating: 4, rulesFollowed: 3 },
  { pips:  28.3, lot: 2.5, pair: 'USD/JPY', direction: 'buy',  style: 'day',   hour: 14, minute:  5, tagIndexes: [0, 3], rating: 5, rulesFollowed: 3, bookmarked: true },
  { pips:  -8.7, lot: 1.0, pair: 'AUD/JPY', direction: 'sell', style: 'scalping', hour: 11, minute: 30, tagIndexes: [5],    rating: 3, rulesFollowed: 2 },
  { pips:  16.0, lot: 2.0, pair: 'GBP/JPY', direction: 'buy',  style: 'day',   hour: 17, minute: 27, tagIndexes: [2],    rating: 4, rulesFollowed: 3 },
  { pips: -13.5, lot: 1.5, pair: 'EUR/JPY', direction: 'sell', style: 'day',   hour:  9, minute: 50, tagIndexes: [4],    rating: 2, rulesFollowed: 1 },
  { pips:  27.0, lot: 3.5, pair: 'USD/JPY', direction: 'buy',  style: 'swing', hour: 15, minute: 10, tagIndexes: [3],    rating: 5, rulesFollowed: 3, bookmarked: true },
  { pips:  12.4, lot: 2.0, pair: 'AUD/JPY', direction: 'buy',  style: 'day',   hour: 12, minute: 45, tagIndexes: [6],    rating: 3, rulesFollowed: 2 },
  { pips: -15.9, lot: 2.0, pair: 'GBP/JPY', direction: 'sell', style: 'day',   hour: 18, minute:  5, tagIndexes: [1],    rating: 2, rulesFollowed: 1 },
  { pips:  20.3, lot: 2.5, pair: 'USD/JPY', direction: 'buy',  style: 'day',   hour: 10, minute: 20, tagIndexes: [0],    rating: 4, rulesFollowed: 3 },
  { pips:  -9.1, lot: 1.0, pair: 'EUR/JPY', direction: 'sell', style: 'scalping', hour: 13, minute: 35, tagIndexes: [5],    rating: 3, rulesFollowed: 2 },
  { pips:  18.3, lot: 3.0, pair: 'GBP/JPY', direction: 'buy',  style: 'day',   hour: 16, minute: 55, tagIndexes: [2, 6], rating: 4, rulesFollowed: 3 },
  { pips: -11.1, lot: 1.5, pair: 'AUD/JPY', direction: 'sell', style: 'day',   hour:  9, minute: 40, tagIndexes: [4],    rating: 2, rulesFollowed: 1 },
  { pips:  10.6, lot: 2.0, pair: 'USD/JPY', direction: 'buy',  style: 'scalping', hour: 11, minute: 15, tagIndexes: [0],    rating: 3, rulesFollowed: 3 },
  { pips:  25.6, lot: 3.0, pair: 'EUR/JPY', direction: 'buy',  style: 'swing', hour: 15, minute: 30, tagIndexes: [3],    rating: 5, rulesFollowed: 3, bookmarked: true },
  { pips: -16.3, lot: 2.0, pair: 'GBP/JPY', direction: 'sell', style: 'day',   hour: 17, minute: 45, tagIndexes: [1],    rating: 2, rulesFollowed: 1 },
  { pips:  13.3, lot: 2.5, pair: 'USD/JPY', direction: 'buy',  style: 'day',   hour: 10, minute: 10, tagIndexes: [6],    rating: 4, rulesFollowed: 3 },
  { pips: -16.8, lot: 1.5, pair: 'AUD/JPY', direction: 'sell', style: 'swing', hour: 14, minute: 25, tagIndexes: [4],    rating: 2, rulesFollowed: 2 },
  { pips:  20.1, lot: 3.0, pair: 'EUR/JPY', direction: 'buy',  style: 'day',   hour: 12, minute:  0, tagIndexes: [2],    rating: 4, rulesFollowed: 3 },
  { pips: -12.9, lot: 2.0, pair: 'GBP/JPY', direction: 'sell', style: 'day',   hour: 16, minute: 35, tagIndexes: [5],    rating: 3, rulesFollowed: 2 },
  { pips:  23.5, lot: 2.5, pair: 'USD/JPY', direction: 'buy',  style: 'day',   hour: 17, minute: 27, tagIndexes: [0, 3], rating: 5, rulesFollowed: 3, bookmarked: true },
];

export function isScreenshotMode(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_SCREENSHOT_MODE === '1';
}

/**
 * 当月の1日から今日までに、件数ぶんの日を割り当てる。
 * **最後の1件だけが今日**になる。ホームの「TODAY」欄に出るのがこの1件だけになり、
 * 配列の最後を勝ちトレードにしてあるので今日の勝率が 100% で写る。
 * 今日が1日・2日のうちは分散する余地がないので全件を今日に置く。
 */
export function assignDays(count: number, today: number): number[] {
  if (count <= 1) return [today];
  if (today <= 2) return Array(count).fill(today);
  const head = Array.from({ length: count - 1 }, (_, i) =>
    1 + Math.round((i * (today - 2)) / (count - 2))
  );
  return [...head, today];
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * デモデータを投入する。**既存の記録は消える。**
 * 撮影モードでないときは何もしないので、誤って本番経路から呼んでも実害はない。
 */
export async function seedScreenshotData(): Promise<void> {
  if (!isScreenshotMode()) return;

  const db = await getDatabase();
  await db.execAsync('DELETE FROM trades;');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const days = assignDays(DEMO_TRADES.length, now.getDate());

  const tags = tArr('default_tags');
  const rules = tArr('default_rules').slice(0, 3);

  // 「ルールを守った日」の判定は **その日の全トレードが全ルールを満たしていること**
  // （goals.ts の isRuleFollowedDay）。1件ずつ守った数を散らすだけだと、同じ日に
  // 1件でも欠けた取引があるとその日は数えられず、月次の「ルールを守った日数」が
  // ほぼ 0 になる。日を先に決めてから、その日を丸ごと「守った日」にする。
  const uniqueDays = [...new Set(days)];
  const followedDays = new Set(
    uniqueDays.slice(0, Math.max(1, Math.ceil(uniqueDays.length * 0.7)))
  );

  const inserted: Trade[] = [];
  for (let i = 0; i < DEMO_TRADES.length; i++) {
    const d = DEMO_TRADES[i];
    const date = `${year}-${pad(month)}-${pad(days[i])}`;
    const profitLoss = calcProfitLoss(d.pips, d.lot, LOT_UNIT);
    const trade: Trade = {
      id: `screenshot-${pad(i)}`,
      date,
      pair: d.pair,
      direction: d.direction,
      entryRate: null, exitRate: null, stopLoss: null, takeProfit: null, plannedRR: null,
      lotSize: d.lot,
      entryMethod: 'quick',
      style: d.style,
      tags: d.tagIndexes.map(n => tags[n % tags.length]).filter(Boolean),
      imageUris: [],
      pips: d.pips,
      profitLoss,
      result: determineResult(d.pips),
      reflection: '',
      selfRating: d.rating,
      bookmarked: Boolean(d.bookmarked),
      mentalFocus: null, mentalCalm: null, mentalFear: null,
      ruleChecks: rules.slice(0, followedDays.has(days[i]) ? rules.length : d.rulesFollowed),
      tfWeekly: '', tfDaily: '', tf4h: '', tf1h: '',
      createdAt: `${date}T${pad(d.hour)}:${pad(d.minute)}:00.000Z`,
    };
    await insertTrade(trade);
    inserted.push(trade);
  }

  await saveTradeRules(rules);
  await saveEntryTags(tags);

  // 目標は「達成済み」に見える値にする。pips・勝率・損益は上のデータが固定なので
  // 定数でよいが、ルールを守った日数だけは撮影日（＝当月の経過日数）で変わるため、
  // 実際に並んだ日数から引いて必ず達成状態になるようにする。
  // 表示側と同じ関数で数える。ここを自前で数え直すと、判定が変わったときに
  // 目標だけ達成不能な値のまま残る。
  const ruleDays = ruleFollowedDays(inserted, rules);
  await setSetting(GOAL_SETTING_KEYS.monthlyPipsGoal, '100');
  await setSetting(GOAL_SETTING_KEYS.monthlyWinRateGoal, '55');
  await setSetting(GOAL_SETTING_KEYS.monthlyPLGoal, '30000');
  await setSetting(GOAL_SETTING_KEYS.monthlyRuleDaysGoal, String(Math.max(1, ruleDays - 1)));
  await setSetting(GOAL_SETTING_KEYS.weeklyRuleDaysGoal, '4');
  await setSetting(GOAL_SETTING_KEYS.weeklyPipsGoal, '30');
  await setSetting(GOAL_SETTING_KEYS.dailyRuleGoal, '1');

  await setSetting('onboarding_done', '1');
  await updateRecordStreak();

  // 課金画面と設定画面を PRO の状態で撮るため。RevenueCat のキーは開発ビルドでは
  // プレースホルダのままで initialize() が何もしないので、ここで直接立てる。
  usePurchaseStore.setState({ isPremium: true, isInitialized: true });
}

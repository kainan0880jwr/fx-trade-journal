/**
 * 見本データ。**ストアのスクリーンショットと、オンボーディングの「サンプルで見てみる」
 * が同じ1組を共有する。**
 *
 * ■ なぜ本番経路に見本データを入れるのか
 *
 * 実測（2026-09-17、30日）で人が減る場所は初回記録の前に集中していた:
 * first_open 138 → onboarding_completed 114 → **first_trade_saved 48**。
 * 3択の「まずアプリを見てみる」は完了フラグだけ立てて**空のホーム**に置くため、
 * 迷った人はこれを選び、勝率もpipsのグラフも一度も見ないまま閉じる。
 * 記録した48人のうち大半はゲートに到達しているので、ここを増やせば下流が全部増える。
 *
 * ■ 撮影モードとは別物として扱うこと
 *
 * `screenshotMode.ts` の `seedScreenshotData()` は **`DELETE FROM trades` で全消し**し、
 * `isPremium` も立てる。あれを本番経路から呼んではいけない。こちらは:
 *   - **1件でも記録があれば何もしない**（`getTotalTradeCount() > 0` で打ち切り）
 *   - 削除は `id LIKE 'sample-%'` の行だけ
 *   - 目標・課金状態・連続記録日数には触れない
 * データ本体（`DEMO_TRADES`）だけを共有し、入れ方と消し方は完全に分けてある。
 *
 * ■ 数字の作り方
 *
 * 現実的に見える範囲に収めてある。**勝率59.1% / PF2.09 / +134.1 pips / 13勝9敗。**
 * 極端な好成績は避ける方針で、LPのモック（旧値 勝率78% / PF7.75）は
 * 「現実のFXとして極端で打消し表示が要る水準」として直した経緯がある。
 *
 * PF は `statsCalc.ts` の実装どおり **pips ベース**（損益額ベースではない）なので、
 * ロット数を件ごとに散らしても PF は pips 比のまま保たれる。
 *
 * 通貨ペアは**クロス円だけ**にしてある。損益額はクロス円でしか算出されない仕様
 * （`profitCalc.ts` は `is_yen_pair=1` 専用）なので、非円ペアを混ぜると
 * その行だけ金額が出ず、見本として間が抜ける。
 *
 * 振り返りメモは**入れていない**。11言語ぶんの文面を新しく訳し起こすことになり、
 * `i18n/__tests__/consistency.test.ts` の管理下にも入らない中途半端な翻訳が増えるため。
 * タグ・自己評価・ルールチェックで情報量を出している。
 */
import { getDatabase } from '../db/database';
import {
  insertTrade, getSetting, setSetting, getTotalTradeCount,
  getEntryTags, getTradeRules, saveEntryTags, saveTradeRules,
} from '../db/queries';
import { calcProfitLoss, determineResult } from './profitCalc';
import { tArr } from '../i18n';
import type { Trade } from '../types';

const LOT_UNIT = 10000;

/** 本番経路で入れた見本データの id の前置き。削除の条件はこれ**だけ**。 */
export const SAMPLE_ID_PREFIX = 'sample-';

/** 撮影モードが入れる分の前置き。`DELETE FROM trades` で消えるので削除条件には使わない。 */
export const SCREENSHOT_ID_PREFIX = 'screenshot-';

const SAMPLE_FLAG_KEY = 'sample_data_present';

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
 * `DEMO_TRADES` を当月の日付に載せて `Trade` に組み立てる。DBには触らない。
 * 撮影モードと本番の見本データが**同じ1組**を使うための共通部分。
 */
export function buildSampleTrades(opts: {
  idPrefix: string;
  tags: string[];
  rules: string[];
  now?: Date;
}): Trade[] {
  const now = opts.now ?? new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const days = assignDays(DEMO_TRADES.length, now.getDate());

  // 「ルールを守った日」の判定は **その日の全トレードが全ルールを満たしていること**
  // （goals.ts の isRuleFollowedDay）。1件ずつ守った数を散らすだけだと、同じ日に
  // 1件でも欠けた取引があるとその日は数えられず、月次の「ルールを守った日数」が
  // ほぼ 0 になる。日を先に決めてから、その日を丸ごと「守った日」にする。
  const uniqueDays = [...new Set(days)];
  const followedDays = new Set(
    uniqueDays.slice(0, Math.max(1, Math.ceil(uniqueDays.length * 0.7)))
  );

  return DEMO_TRADES.map((d, i) => {
    // **date には時刻まで入れる。** 実際のトレードは `toLocalISOString(now)`（クイック）
    // または `${date}T${time}:00`（詳細）で保存しており、`calcTimeAnalysis` は
    // `t.date.slice(11, 13)` で時刻を読む。デモデータだけ `YYYY-MM-DD` にしていたため、
    // **時間帯・曜日の分析がデモでは常に空**になっていた（2026-09-17 発見）。
    const day = `${year}-${pad(month)}-${pad(days[i])}`;
    const date = `${day}T${pad(d.hour)}:${pad(d.minute)}:00`;
    return {
      id: `${opts.idPrefix}${pad(i)}`,
      date,
      pair: d.pair,
      direction: d.direction,
      entryRate: null, exitRate: null, stopLoss: null, takeProfit: null, plannedRR: null,
      lotSize: d.lot,
      entryMethod: 'quick',
      style: d.style,
      tags: d.tagIndexes.map(n => opts.tags[n % opts.tags.length]).filter(Boolean),
      imageUris: [],
      pips: d.pips,
      profitLoss: calcProfitLoss(d.pips, d.lot, LOT_UNIT),
      result: determineResult(d.pips),
      reflection: '',
      selfRating: d.rating,
      bookmarked: Boolean(d.bookmarked),
      mentalFocus: null, mentalCalm: null, mentalFear: null,
      ruleChecks: opts.rules.slice(0, followedDays.has(days[i]) ? opts.rules.length : d.rulesFollowed),
      tfWeekly: '', tfDaily: '', tf4h: '', tf1h: '',
      createdAt: `${day}T${pad(d.hour)}:${pad(d.minute)}:00.000Z`,
    } satisfies Trade;
  });
}

/**
 * 見本データが入っているか。
 *
 * **フラグだけでは判定しない。行が実際に残っているかまで見る。**
 * フラグと行がずれる経路が複数ある:
 *   - バックアップの復元（設定は `INSERT OR REPLACE` なので、復元元にこのキーが
 *     無ければ古い `1` が残る。一方トレードは入れ替わるので見本の行は消えている）
 *   - `resetDatabase()`（DBファイルごと消すが、ストアの状態は残る）
 *   - 見本のカードをユーザーが1件ずつ手で消した場合
 * ずれると「消すものが無いのに『これはサンプルです』が出続ける」状態になり、
 * 自分の記録まで見本だと思われかねない。起動時に1回だけの問い合わせなので
 * COUNT を撃ってよい。
 */
export async function hasSampleData(): Promise<boolean> {
  try {
    if ((await getSetting(SAMPLE_FLAG_KEY)) !== '1') return false;
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM trades WHERE id LIKE ?',
      [`${SAMPLE_ID_PREFIX}%`]
    );
    return (row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * 見本データを入れる。入れた件数を返す（入れなかったら0）。
 *
 * **記録が1件でもあれば何もしない。** オンボーディング直後にしか呼ばない想定だが、
 * 再インストール後の復元や二重呼び出しでユーザーのデータに混ざる余地を、
 * 呼び出し側の注意ではなくここで構造的に潰しておく。
 */
export async function insertSampleTrades(now?: Date): Promise<number> {
  if (await getTotalTradeCount() > 0) return 0;

  const tags = tArr('default_tags');
  const rules = tArr('default_rules').slice(0, 3);
  const trades = buildSampleTrades({ idPrefix: SAMPLE_ID_PREFIX, tags, rules, now });

  for (const trade of trades) await insertTrade(trade);

  // タグとルールは**空のときだけ**入れる。見本のタグが一覧に出ないと、
  // タグ分析を開いても何が何だか分からない。ユーザーが先に設定していたら触らない。
  // 見本を消しても残るが、これは新規インストールで既定として出るものと同じ内容。
  if ((await getEntryTags()).length === 0) await saveEntryTags(tags);
  if ((await getTradeRules()).length === 0) await saveTradeRules(rules);

  await setSetting(SAMPLE_FLAG_KEY, '1');
  return trades.length;
}

/**
 * 見本データだけを消す。消した件数を返す。
 *
 * **条件は id の前置きだけ。** ここが「全部消す」に一度でも化けたら、
 * 見本を消すつもりでユーザーの記録が消える。`generateId()` は UUID v4 なので
 * 実データの id がこの前置きと衝突することはない。
 */
export async function removeSampleData(): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    'DELETE FROM trades WHERE id LIKE ?',
    [`${SAMPLE_ID_PREFIX}%`]
  );
  await setSetting(SAMPLE_FLAG_KEY, '0');
  return res.changes ?? 0;
}

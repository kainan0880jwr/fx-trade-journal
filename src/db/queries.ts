import * as Sentry from '@sentry/react-native';
import { getDatabase } from './database';
import type { Trade, CurrencyPair, AppSettings, ReflectionTemplate } from '../types';

// SQLiteのLIKEはデフォルトでASCII大文字小文字を区別しないためBINARY照合のインデックスを
// 使わずフルスキャンになる。範囲比較(>= AND <)ならidx_trades_dateが効くため、
// 「YYYY-MM」「YYYY-MM-DD」「YYYY」の前方一致条件はすべて範囲比較に変換する。
function nextYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
function nextDateString(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function nextYearString(year: string): string {
  return String(Number(year) + 1);
}

function rowToTrade(row: any): Trade {
  return {
    id: row.id,
    date: row.date,
    pair: row.pair,
    direction: row.direction,
    entryRate: row.entry_rate ?? null,
    exitRate: row.exit_rate ?? null,
    stopLoss: row.stop_loss ?? null,
    takeProfit: row.take_profit ?? null,
    plannedRR: row.planned_r_r ?? null,
    lotSize: row.lot_size,
    style: row.style,
    entryMethod: (row.entry_method === 'quick' ? 'quick' : 'full') as 'full' | 'quick',
    // JSONが壊れている場合、以前は黙って [] にフォールバックしていた。
    // 読み取りだけなら劣化で済むが、そのトレードを開いて保存し直すと
    // updateTrade が JSON.stringify([]) を書き込み、**破損していた元データが
    // 確定的に失われる**。破損を検知したらSentryに残し（値そのものは送らない）、
    // 原因を追えるようにする。
    tags: parseJsonArray(row.tags, 'tags'),
    imageUris: parseJsonArray(row.image_uris, 'image_uris'),
    pips: row.pips,
    profitLoss: row.profit_loss,
    result: row.result,
    reflection: row.reflection ?? '',
    selfRating: row.self_rating ?? 3,
    bookmarked: row.bookmarked === 1,
    mentalFocus: row.mental_focus ?? null,
    mentalCalm: row.mental_calm ?? null,
    mentalFear: row.mental_fear ?? null,
    ruleChecks: parseJsonArray(row.rule_checks, 'rule_checks'),
    tfWeekly: row.tf_weekly ?? '',
    tfDaily: row.tf_daily ?? '',
    tf4h: row.tf_4h ?? '',
    tf1h: row.tf_1h ?? '',
    createdAt: row.created_at,
  };
}


/**
 * トレード行のJSON配列カラムを読む。破損していたら空配列を返しつつSentryへ報告する。
 * 値そのものは送らない（トレード内容はPIIとして扱う）。
 */
function parseJsonArray(raw: unknown, column: string): string[] {
  try {
    const v = JSON.parse((raw as string) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    try {
      Sentry.captureMessage('db:corrupt_json_column', {
        level: 'warning',
        tags: { area: 'db_read', column },
      });
    } catch { /* 計装の失敗は無視 */ }
    return [];
  }
}

export async function insertTrade(trade: Trade): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO trades
      (id, date, pair, direction, entry_rate, exit_rate, stop_loss, take_profit, planned_r_r,
       lot_size, style, tags, image_uris, entry_method, pips, profit_loss, result, reflection,
       self_rating, bookmarked, mental_focus, mental_calm, mental_fear, rule_checks,
       tf_weekly, tf_daily, tf_4h, tf_1h, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trade.id, trade.date, trade.pair, trade.direction,
      trade.entryRate, trade.exitRate, trade.stopLoss, trade.takeProfit, trade.plannedRR,
      trade.lotSize, trade.style,
      JSON.stringify(trade.tags), JSON.stringify(trade.imageUris),
      trade.entryMethod ?? 'full',
      trade.pips, trade.profitLoss, trade.result,
      trade.reflection, trade.selfRating, trade.bookmarked ? 1 : 0,
      trade.mentalFocus, trade.mentalCalm, trade.mentalFear,
      JSON.stringify(trade.ruleChecks),
      trade.tfWeekly, trade.tfDaily, trade.tf4h, trade.tf1h,
      trade.createdAt,
    ]
  );
}

export async function updateTrade(trade: Trade): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE trades SET
      date=?, pair=?, direction=?, entry_rate=?, exit_rate=?, stop_loss=?, take_profit=?, planned_r_r=?,
      lot_size=?, style=?, entry_method=?, tags=?, image_uris=?, pips=?, profit_loss=?, result=?, reflection=?, self_rating=?,
      mental_focus=?, mental_calm=?, mental_fear=?, rule_checks=?,
      tf_weekly=?, tf_daily=?, tf_4h=?, tf_1h=?
     WHERE id=?`,
    [
      trade.date, trade.pair, trade.direction,
      trade.entryRate, trade.exitRate, trade.stopLoss, trade.takeProfit, trade.plannedRR,
      trade.lotSize, trade.style, trade.entryMethod ?? 'full',
      JSON.stringify(trade.tags), JSON.stringify(trade.imageUris),
      trade.pips, trade.profitLoss, trade.result, trade.reflection, trade.selfRating,
      trade.mentalFocus, trade.mentalCalm, trade.mentalFear, JSON.stringify(trade.ruleChecks),
      trade.tfWeekly, trade.tfDaily, trade.tf4h, trade.tf1h,
      trade.id,
    ]
  );
}

export async function deleteTrade(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM trades WHERE id=?', [id]);
}

export async function toggleBookmark(id: string, bookmarked: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE trades SET bookmarked=? WHERE id=?', [bookmarked ? 1 : 0, id]);
}

export async function getTradesByMonth(yearMonth: string): Promise<Trade[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM trades WHERE date >= ? AND date < ? ORDER BY date DESC`,
    [yearMonth, nextYearMonth(yearMonth)]
  );
  return rows.map(rowToTrade);
}

export async function getAllTrades(): Promise<Trade[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM trades ORDER BY date ASC`
  );
  return rows.map(rowToTrade);
}

export async function getTotalTradeCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM trades`);
  return row?.count ?? 0;
}

export async function getTradesByDate(date: string): Promise<Trade[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM trades WHERE date >= ? AND date < ? ORDER BY date DESC`,
    [date, nextDateString(date)]
  );
  return rows.map(rowToTrade);
}

export async function getTradeById(id: string): Promise<Trade | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(`SELECT * FROM trades WHERE id=?`, [id]);
  return row ? rowToTrade(row) : null;
}

export async function getTradesForYear(year: string): Promise<Trade[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM trades WHERE date >= ? AND date < ? ORDER BY date ASC`,
    [year, nextYearString(year)]
  );
  return rows.map(rowToTrade);
}

export async function getBookmarkedTrades(): Promise<Trade[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM trades WHERE bookmarked=1 ORDER BY date DESC`
  );
  return rows.map(rowToTrade);
}

export async function getCurrencyPairs(): Promise<CurrencyPair[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM currency_pairs WHERE is_active=1 ORDER BY CAST(id AS INTEGER), name`
  );
  return rows.map(r => ({
    id: r.id, name: r.name,
    pipDigits: r.pip_digits, isYenPair: r.is_yen_pair === 1, isActive: r.is_active === 1,
  }));
}

export async function upsertCurrencyPair(pair: CurrencyPair): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO currency_pairs (id, name, pip_digits, is_yen_pair, is_active) VALUES (?, ?, ?, ?, ?)`,
    [pair.id, pair.name, pair.pipDigits, pair.isYenPair ? 1 : 0, pair.isActive ? 1 : 0]
  );
}

/**
 * 非アクティブ（削除済み）を含む全通貨ペアを取得する。
 *
 * 削除は論理削除（is_active=0）なので設定は残っている。にもかかわらず
 * トレード編集画面が is_active=1 のみを参照していたため、削除済みペアの
 * 既存トレードを開くと pipDigits が既定値2へフォールバックし、
 * **何も変更せず保存し直すだけで pips が 1/100 になっていた**
 * （EUR/USD の +17.0pips が +0.2 になる）。編集時はこちらを使う。
 */
export async function getAllCurrencyPairs(): Promise<CurrencyPair[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM currency_pairs ORDER BY CAST(id AS INTEGER), name`
  );
  return rows.map(r => ({
    id: r.id, name: r.name, pipDigits: r.pip_digits,
    isYenPair: r.is_yen_pair === 1, isActive: r.is_active === 1,
  }));
}

export async function deleteCurrencyPair(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE currency_pairs SET is_active=0 WHERE id=?`, [id]);
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(`SELECT value FROM settings WHERE key=?`, [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
}


/**
 * 設定値を数値へ。`?? 既定値` だけでは 'NaN' や非数値文字列を素通しし、
 * Number() が NaN を返すため既定値へのフォールバックが効かなかった。
 * NaN が入ると損益計算やリスク計算がすべて NaN 表示になる。
 */
function safeNumber(raw: string | null | undefined, fallback: number): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

export async function getAllSettings(): Promise<AppSettings> {
  const [lotUnit, defaultLotSize, defaultStyle, accountBalance, defaultRiskPct, monthlyPipsGoal, monthlyWinRateGoal, monthlyPLGoal, themeMode, appLockEnabled] =
    await Promise.all([
      getSetting('lot_unit'), getSetting('default_lot_size'), getSetting('default_style'),
      getSetting('account_balance'), getSetting('default_risk_pct'),
      getSetting('monthly_pips_goal'), getSetting('monthly_win_rate_goal'),
      getSetting('monthly_pl_goal'),
      getSetting('theme_mode'), getSetting('app_lock_enabled'),
    ]);
  return {
    lotUnit: safeNumber(lotUnit, 10000),
    // 既定ロット。クイック入力の初期値に使う（0以下は不正として既定へ）
    defaultLotSize: (() => { const n = safeNumber(defaultLotSize, 0.1); return n > 0 ? n : 0.1; })(),
    defaultStyle: defaultStyle ?? 'day',
    accountBalance: safeNumber(accountBalance, 0),
    defaultRiskPct: safeNumber(defaultRiskPct, 2),
    monthlyPipsGoal: safeNumber(monthlyPipsGoal, 0),
    monthlyWinRateGoal: safeNumber(monthlyWinRateGoal, 0),
    monthlyPLGoal: safeNumber(monthlyPLGoal, 0),
    themeMode: (themeMode as AppSettings['themeMode']) ?? 'dark',
    appLockEnabled: appLockEnabled === '1',
  };
}

export async function getEntryTags(): Promise<string[]> {
  const val = await getSetting('entry_tags');
  try { return JSON.parse(val ?? '[]'); } catch { return []; }
}

export async function saveEntryTags(tags: string[]): Promise<void> {
  await setSetting('entry_tags', JSON.stringify(tags));
}

export async function getTradeRules(): Promise<string[]> {
  const val = await getSetting('trade_rules');
  try { return JSON.parse(val ?? '[]'); } catch { return []; }
}

export async function saveTradeRules(rules: string[]): Promise<void> {
  await setSetting('trade_rules', JSON.stringify(rules));
}

function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function updateRecordStreak(): Promise<number> {
  const today = localDateStr();
  const lastDate = await getSetting('last_record_date');
  const streak = Number(await getSetting('record_streak') ?? '0');

  let newStreak: number;
  if (!lastDate) {
    newStreak = 1;
  } else if (lastDate === today) {
    newStreak = streak; // 同日に複数記録してもストリークは変わらない
  } else {
    const yesterday = localDateStr(new Date(Date.now() - 86400000));
    newStreak = lastDate === yesterday ? streak + 1 : 1;
  }

  await setSetting('last_record_date', today);
  await setSetting('record_streak', String(newStreak));
  return newStreak;
}

/**
 * 現在の連続記録日数。
 *
 * 保存値をそのまま返すと、記録が途切れても数字が残り続ける。
 * 実際、10日連続のあと1か月放置してもホーム画面・ウィジェット・シェアカード・
 * リマインダー通知のすべてが「10日連続」と表示し続け、次に保存した瞬間だけ
 * 1に戻っていた。「継続の可視化」という機能の目的を満たしていない。
 *
 * 最後に記録した日が今日でも昨日でもなければ、その時点で連続は途切れている。
 * 保存値は書き換えず（次の記録時に updateRecordStreak が正しく1から数え直す）、
 * 読み出し時に判定する。
 */
/**
 * 保存値と最終記録日から、表示すべき連続記録日数を求める純粋関数。
 * DBに触れないためテストできる（実際の判定ロジックはこちらにある）。
 */
export function resolveStreak(
  rawStreak: string | null | undefined,
  lastDate: string | null | undefined,
  today: string,
  yesterday: string
): number {
  const streak = Number(rawStreak ?? '0');
  if (!Number.isFinite(streak) || streak <= 0) return 0;
  if (!lastDate) return 0;
  return (lastDate === today || lastDate === yesterday) ? streak : 0;
}

export async function getRecordStreak(): Promise<number> {
  const [rawStreak, lastDate] = await Promise.all([
    getSetting('record_streak'),
    getSetting('last_record_date'),
  ]);
  return resolveStreak(
    rawStreak,
    lastDate,
    localDateStr(),
    localDateStr(new Date(Date.now() - 86400000))
  );
}

export async function getReflectionTemplates(): Promise<ReflectionTemplate[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM reflection_templates ORDER BY count DESC, label ASC`
  );
  return rows.map(r => ({ id: r.id, label: r.label, count: r.count }));
}

export async function incrementTemplateCount(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE reflection_templates SET count=count+1 WHERE id=?`, [id]);
}

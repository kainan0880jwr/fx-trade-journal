import { getDatabase } from './database';
import type { Trade, CurrencyPair, AppSettings, ReflectionTemplate } from '../types';

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
    tags: (() => { try { return JSON.parse(row.tags || '[]'); } catch { return []; } })(),
    imageUris: (() => { try { return JSON.parse(row.image_uris || '[]'); } catch { return []; } })(),
    pips: row.pips,
    profitLoss: row.profit_loss,
    result: row.result,
    reflection: row.reflection ?? '',
    selfRating: row.self_rating ?? 3,
    bookmarked: row.bookmarked === 1,
    mentalFocus: row.mental_focus ?? null,
    mentalCalm: row.mental_calm ?? null,
    mentalFear: row.mental_fear ?? null,
    ruleChecks: (() => { try { return JSON.parse(row.rule_checks || '[]'); } catch { return []; } })(),
    tfWeekly: row.tf_weekly ?? '',
    tfDaily: row.tf_daily ?? '',
    tf4h: row.tf_4h ?? '',
    tf1h: row.tf_1h ?? '',
    createdAt: row.created_at,
  };
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
    `SELECT * FROM trades WHERE date LIKE ? ORDER BY date DESC`,
    [`${yearMonth}%`]
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
    `SELECT * FROM trades WHERE date LIKE ? ORDER BY date DESC`,
    [`${date}%`]
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
    `SELECT * FROM trades WHERE date LIKE ? ORDER BY date ASC`,
    [`${year}%`]
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

export async function getAllSettings(): Promise<AppSettings> {
  const [lotUnit, defaultStyle, accountBalance, defaultRiskPct, monthlyPipsGoal, monthlyWinRateGoal, themeMode, appLockEnabled] =
    await Promise.all([
      getSetting('lot_unit'), getSetting('default_style'),
      getSetting('account_balance'), getSetting('default_risk_pct'),
      getSetting('monthly_pips_goal'), getSetting('monthly_win_rate_goal'),
      getSetting('theme_mode'), getSetting('app_lock_enabled'),
    ]);
  return {
    lotUnit: Number(lotUnit ?? 10000),
    defaultStyle: defaultStyle ?? 'day',
    accountBalance: Number(accountBalance ?? 0),
    defaultRiskPct: Number(defaultRiskPct ?? 2),
    monthlyPipsGoal: Number(monthlyPipsGoal ?? 0),
    monthlyWinRateGoal: Number(monthlyWinRateGoal ?? 0),
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

export async function getRecordStreak(): Promise<number> {
  return Number(await getSetting('record_streak') ?? '0');
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

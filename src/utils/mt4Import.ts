/**
 * MT4 / MT5 取引履歴 CSV インポートユーティリティ
 *
 * 対応フォーマット:
 *   - MT4: タブ区切り / カンマ区切り（取引タイプ列に "buy" / "sell"）
 *   - MT5: カンマ区切り（Deals 履歴、Type列に "buy" / "sell"）
 */

import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { insertTrade } from '../db/queries';
import { t } from '../i18n';
import type { Trade, TradeResult, Direction, TradeStyle } from '../types';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 20000;

// ───────────────────────────────────────────────
// 型
// ───────────────────────────────────────────────
export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface RawRow {
  openTime: string;
  closeTime: string;
  symbol: string;
  direction: Direction;
  size: number;
  openPrice: number;
  closePrice: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  commission: number;
}

// ───────────────────────────────────────────────
// ヘルパー
// ───────────────────────────────────────────────

/** 文字列 → 数値。パース失敗時は 0 */
const num = (s: string): number => {
  const v = parseFloat(s.replace(/,/g, '').trim());
  return isNaN(v) ? 0 : v;
};

/** "2024.01.15 10:23" または "2024-01-15T10:23:00" → ISO日付部分 "YYYY-MM-DD" */
function parseDate(s: string): string {
  // MT4形式: 2024.01.15 10:23:00
  const mt4 = s.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (mt4) return `${mt4[1]}-${mt4[2]}-${mt4[3]}`;
  // MT5形式: 2024-01-15 10:23:00
  const mt5 = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mt5) return `${mt5[1]}-${mt5[2]}-${mt5[3]}`;
  // ISO
  const iso = s.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return new Date().toISOString().slice(0, 10);
}

/** CSV行をフィールド配列に分解（クォート対応） */
function parseCSVLine(line: string, sep: string): string[] {
  if (sep === '\t') return line.split('\t').map(s => s.trim());
  // カンマ区切り（ダブルクォート対応）
  const fields: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      fields.push(cur.trim()); cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur.trim());
  return fields;
}

/** ヘッダー行から区切り文字を推定 */
function detectSep(header: string): string {
  if (header.includes('\t')) return '\t';
  if (header.includes(';')) return ';';
  return ',';
}

/** 通貨ペア名を正規化 ("USDJPY" / "USD/JPY" → "USD/JPY") */
function normalizePair(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (s.includes('/')) return s;
  if (s.length >= 6) return `${s.slice(0, 3)}/${s.slice(3, 6)}`;
  return s;
}

/** pip数を計算（/JPY ペアは2桁、その他4桁） */
function calcPips(pair: string, open: number, close: number, dir: Direction): number {
  const isJpy = pair.toUpperCase().includes('JPY');
  const mult = isJpy ? 100 : 10000;
  const rawPips = (close - open) * mult;
  return Math.round((dir === 'buy' ? rawPips : -rawPips) * 10) / 10;
}

/** 損益から勝敗を判定 */
function resultFromProfit(profit: number): TradeResult {
  if (profit > 0) return 'win';
  if (profit < 0) return 'loss';
  return 'even';
}

// ───────────────────────────────────────────────
// MT4 パーサー
// ───────────────────────────────────────────────
/**
 * MT4 History CSV ヘッダー例:
 * #  Time  Type  Size  Symbol  Price  S/L  T/P  Time  Price  Commission  Taxes  Swap  Profit
 * または
 * Ticket,Open Time,Type,Size,Symbol,Price,S/L,T/P,Close Time,Price,Commission,Taxes,Swap,Profit
 */
function parseMT4(lines: string[], sep: string): RawRow[] {
  const rows: RawRow[] = [];
  // ヘッダー行を探す
  let dataStart = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const low = lines[i].toLowerCase();
    if (low.includes('type') && (low.includes('symbol') || low.includes('item'))) {
      dataStart = i + 1;
      break;
    }
  }

  const headerRaw = lines[dataStart - 1] || '';
  const headers = parseCSVLine(headerRaw, sep).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));

  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex(h => h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };

  // MT4の場合、Open Time と Close Time で同じカラム名が2回登場するため位置で対処
  const typeIdx   = idx(['type']);
  const sizeIdx   = idx(['size', 'volume', 'lots']);
  const symbolIdx = idx(['symbol', 'item']);
  const slIdx     = idx(['sl', 'stoploss']);
  const tpIdx     = idx(['tp', 'takeprofit']);
  const commIdx   = idx(['commission']);
  const swapIdx   = idx(['swap']);
  const profitIdx = idx(['profit']);

  // Open Time は最初の時間列、Close Time は2番目の時間列
  const timeIndices: number[] = [];
  headers.forEach((h, i) => { if (h.includes('time') || h === 'time') timeIndices.push(i); });
  const openTimeIdx  = timeIndices[0] ?? 1;
  const closeTimeIdx = timeIndices[1] ?? 8;

  // Price も2回登場（Open Price / Close Price）
  const priceIndices: number[] = [];
  headers.forEach((h, i) => { if (h.includes('price')) priceIndices.push(i); });
  const openPriceIdx  = priceIndices[0] ?? 5;
  const closePriceIdx = priceIndices[1] ?? 9;

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const f = parseCSVLine(line, sep);
    if (f.length < 8) continue;

    const rawType = (f[typeIdx] ?? '').toLowerCase().trim();
    // buy/sell のみ（balance, deposit 等はスキップ）
    if (rawType !== 'buy' && rawType !== 'sell') continue;

    const direction: Direction = rawType === 'buy' ? 'buy' : 'sell';
    const symbol = normalizePair(f[symbolIdx] ?? '');
    if (!symbol) continue;

    rows.push({
      openTime:  f[openTimeIdx]  ?? '',
      closeTime: f[closeTimeIdx] ?? '',
      symbol,
      direction,
      size:       num(f[sizeIdx]       ?? '0'),
      openPrice:  num(f[openPriceIdx]  ?? '0'),
      closePrice: num(f[closePriceIdx] ?? '0'),
      sl:         num(f[slIdx]         ?? '0'),
      tp:         num(f[tpIdx]         ?? '0'),
      profit:     num(f[profitIdx]     ?? '0'),
      swap:       num(f[swapIdx]       ?? '0'),
      commission: num(f[commIdx]       ?? '0'),
    });
  }
  return rows;
}

// ───────────────────────────────────────────────
// MT5 パーサー（Deals形式）
// ───────────────────────────────────────────────
/**
 * MT5 Deals CSV ヘッダー例:
 * Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Fee,Swap,Profit,Balance,Comment
 */
function parseMT5(lines: string[], sep: string): RawRow[] {
  const rows: RawRow[] = [];
  let dataStart = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const low = lines[i].toLowerCase();
    if (low.includes('deal') || low.includes('direction')) {
      dataStart = i + 1;
      break;
    }
  }

  const headerRaw = lines[dataStart - 1] || '';
  const headers = parseCSVLine(headerRaw, sep).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));

  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex(h => h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };

  const timeIdx      = idx(['time', 'date']);
  const symbolIdx    = idx(['symbol', 'item']);
  const typeIdx      = idx(['type']);
  const directionIdx = idx(['direction']);
  const volumeIdx    = idx(['volume', 'size', 'lots']);
  const priceIdx     = idx(['price']);
  const commIdx      = idx(['commission']);
  const swapIdx      = idx(['swap']);
  const profitIdx    = idx(['profit']);
  const positionIdx  = idx(['position']);

  // MT5のDeals形式はエントリーと決済が別々の行なので、
  // positionでペアリングする
  interface Deal {
    time: string; symbol: string; dir: Direction;
    type: string; volume: number; price: number;
    commission: number; swap: number; profit: number;
    position: string;
  }

  const deals: Deal[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const f = parseCSVLine(line, sep);
    if (f.length < 5) continue;

    const rawType = (f[typeIdx] ?? '').toLowerCase().trim();
    const rawDir  = (f[directionIdx] ?? '').toLowerCase().trim();

    // buy / sell のみ。typeが "buy"/"sell" または directionが "buy"/"sell"
    let dir: Direction | null = null;
    if (rawType === 'buy'  || rawDir === 'buy')  dir = 'buy';
    if (rawType === 'sell' || rawDir === 'sell') dir = 'sell';
    if (!dir) continue;

    const symbol = normalizePair(f[symbolIdx] ?? '');
    if (!symbol) continue;

    deals.push({
      time:       f[timeIdx]   ?? '',
      symbol,
      dir,
      type:       rawType,
      volume:     num(f[volumeIdx]    ?? '0'),
      price:      num(f[priceIdx]     ?? '0'),
      commission: num(f[commIdx]      ?? '0'),
      swap:       num(f[swapIdx]      ?? '0'),
      profit:     num(f[profitIdx]    ?? '0'),
      position:   positionIdx !== -1 ? (f[positionIdx] ?? '') : '',
    });
  }

  if (positionIdx !== -1 && deals.some(d => d.position)) {
    // Position ID（同一ポジションのエントリー・決済行が共有するID）でグルーピングする。
    // 損益0円の建値決済でも正しく対応付けられるよう、profit値ではなくposition IDのみで判定する。
    const byPosition = new Map<string, Deal[]>();
    for (const d of deals) {
      if (!d.position) continue;
      if (!byPosition.has(d.position)) byPosition.set(d.position, []);
      byPosition.get(d.position)!.push(d);
    }

    for (const group of byPosition.values()) {
      group.sort((a, b) => a.time.localeCompare(b.time));
      const entry = group[0];
      const exit  = group[group.length - 1];
      const totalProfit = group.reduce((sum, d) => sum + d.profit, 0);
      const totalSwap   = group.reduce((sum, d) => sum + d.swap, 0);
      const totalComm   = group.reduce((sum, d) => sum + d.commission, 0);
      rows.push({
        openTime:   entry.time,
        closeTime:  exit.time,
        symbol:     entry.symbol,
        direction:  entry.dir,
        size:       entry.volume,
        openPrice:  entry.price,
        closePrice: exit.price,
        sl:         0,
        tp:         0,
        profit:     totalProfit,
        swap:       totalSwap,
        commission: totalComm,
      });
    }
  } else {
    // Position列がないCSV向けフォールバック: 損益0円=エントリーとみなしてペアリングする
    // （建値決済が含まれる場合、対応がずれる可能性がある簡易ロジック）
    const entries = deals.filter(d => d.profit === 0);
    const exits   = deals.filter(d => d.profit !== 0);

    const paired = Math.min(entries.length, exits.length);
    for (let i = 0; i < paired; i++) {
      const entry = entries[i];
      const exit  = exits[i];
      rows.push({
        openTime:   entry.time,
        closeTime:  exit.time,
        symbol:     entry.symbol,
        direction:  entry.dir,
        size:       entry.volume,
        openPrice:  entry.price,
        closePrice: exit.price,
        sl:         0,
        tp:         0,
        profit:     exit.profit,
        swap:       exit.swap,
        commission: entry.commission + exit.commission,
      });
    }

    // ペアリングできなかった行は単体で追加（決済済みとして扱う）
    if (paired === 0) {
      for (const d of deals) {
        if (d.profit === 0) continue;
        rows.push({
          openTime:   d.time,
          closeTime:  d.time,
          symbol:     d.symbol,
          direction:  d.dir,
          size:       d.volume,
          openPrice:  d.price,
          closePrice: d.price,
          sl: 0, tp: 0,
          profit:     d.profit,
          swap:       d.swap,
          commission: d.commission,
        });
      }
    }
  }

  return rows;
}

// ───────────────────────────────────────────────
// RawRow → Trade 変換
// ───────────────────────────────────────────────
function rawToTrade(row: RawRow): Trade {
  const pips = calcPips(row.symbol, row.openPrice, row.closePrice, row.direction);
  const result = resultFromProfit(row.profit);
  const totalPL = row.profit + row.swap + row.commission;
  const id = `mt4_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  return {
    id,
    date:        parseDate(row.openTime),
    pair:        row.symbol,
    direction:   row.direction,
    entryRate:   row.openPrice  || null,
    exitRate:    row.closePrice || null,
    stopLoss:    row.sl  > 0 ? row.sl  : null,
    takeProfit:  row.tp  > 0 ? row.tp  : null,
    plannedRR:   null,
    lotSize:     row.size || 0.01,
    entryMethod: 'full',
    style:       'other' as TradeStyle,
    tags:        [],
    imageUris:   [],
    pips:        Math.round(pips * 10) / 10,
    profitLoss:  Number.isFinite(totalPL) ? Math.round(totalPL * 100) / 100 : null,
    result,
    reflection:  '',
    selfRating:  3,
    bookmarked:  false,
    mentalFocus: null,
    mentalCalm:  null,
    mentalFear:  null,
    ruleChecks:  [],
    tfWeekly:    '',
    tfDaily:     '',
    tf4h:        '',
    tf1h:        '',
    createdAt:   now,
  };
}

// ───────────────────────────────────────────────
// フォーマット判定
// ───────────────────────────────────────────────
function detectFormat(lines: string[], sep: string): 'mt4' | 'mt5' | 'unknown' {
  const header = lines.slice(0, 5).join('\n').toLowerCase();
  if (header.includes('deal') || header.includes('direction')) return 'mt5';
  if (header.includes('type') && (header.includes('symbol') || header.includes('item'))) return 'mt4';
  return 'unknown';
}

// ───────────────────────────────────────────────
// メインエントリーポイント
// ───────────────────────────────────────────────
export async function importMT4CSV(): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  // ファイル選択
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/plain', 'text/comma-separated-values', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });

  if (picked.canceled || !picked.assets?.[0]?.uri) {
    return result; // キャンセル
  }

  const uri  = picked.assets[0].uri;
  const name = picked.assets[0].name ?? '';
  const size = picked.assets[0].size ?? 0;

  // .csv / .txt 以外は拒否
  if (!name.toLowerCase().match(/\.(csv|txt)$/)) {
    result.errors.push(t('mt4_import_invalid_file'));
    return result;
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    result.errors.push(t('mt4_import_file_too_large').replace('{n}', String(MAX_FILE_SIZE_BYTES / (1024 * 1024))));
    return result;
  }

  const raw = await readAsStringAsync(uri, { encoding: 'utf8' });

  // BOM 除去
  const text = raw.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    result.errors.push(t('mt4_import_empty_file'));
    return result;
  }

  if (lines.length > MAX_ROWS) {
    result.errors.push(t('mt4_import_too_many_rows').replace('{n}', String(MAX_ROWS)));
    return result;
  }

  const sep    = detectSep(lines[0]);
  const format = detectFormat(lines, sep);

  let rows: RawRow[] = [];
  if (format === 'mt5') {
    rows = parseMT5(lines, sep);
  } else {
    // mt4 または unknown → MT4として試みる
    rows = parseMT4(lines, sep);
  }

  if (rows.length === 0) {
    result.errors.push(t('mt4_import_none'));
    return result;
  }

  // DB挿入
  for (const row of rows) {
    try {
      const trade = rawToTrade(row);
      await insertTrade(trade);
      result.imported++;
    } catch {
      result.skipped++;
      if (result.errors.length < 5) {
        result.errors.push(t('mt4_import_row_error'));
      }
    }
  }

  return result;
}

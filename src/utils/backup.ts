import {
  cacheDirectory,
  documentDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  makeDirectoryAsync,
  getInfoAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getAllTrades, getCurrencyPairs } from '../db/queries';
import { getDatabase } from '../db/database';
import { resolveImageUri } from './imageStorage';
import type { Trade, CurrencyPair } from '../types';

const SCHEMA_VERSION = 14; // migrationsの数と一致させる
const MAX_IMAGE_BASE64_TOTAL_BYTES = 200 * 1024 * 1024; // インポート時のメモリDoS防止（合計200MBまで）

interface BackupTrade extends Trade {
  imageBase64: Record<string, string>; // uri -> base64
}

interface BackupData {
  version: string;
  schema: number;
  exportedAt: string;
  trades: BackupTrade[];
  pairs: CurrencyPair[];
  settings: Record<string, string>;
}

export async function exportBackup(): Promise<void> {
  const [trades, pairs] = await Promise.all([getAllTrades(), getCurrencyPairs()]);

  const db = await getDatabase();
  const settingRows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  const settings: Record<string, string> = {};
  for (const r of settingRows) settings[r.key] = r.value;

  // 各トレードの画像をBase64に変換（メモリ節約のため逐次処理）
  const backupTrades: BackupTrade[] = [];
  for (const trade of trades) {
    const imageBase64: Record<string, string> = {};
    for (const uri of trade.imageUris) {
      try {
        const resolved = resolveImageUri(uri);
        const info = await getInfoAsync(resolved);
        if (info.exists) {
          imageBase64[uri] = await readAsStringAsync(resolved, { encoding: 'base64' });
        }
      } catch {
        // 画像が読めない場合はスキップ
      }
    }
    backupTrades.push({ ...trade, imageBase64 });
  }

  const backup: BackupData = {
    version: '1.0.0',
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    trades: backupTrades,
    pairs,
    settings,
  };

  if (!cacheDirectory) throw new Error('cacheDirectory unavailable');

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filePath = `${cacheDirectory}fx-backup-${dateStr}.json`;
  await writeAsStringAsync(filePath, JSON.stringify(backup), { encoding: 'utf8' });

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) throw new Error('sharing_unavailable');
  await Sharing.shareAsync(filePath, { mimeType: 'application/json', dialogTitle: 'FXバックアップを保存' });
}

export async function importBackup(): Promise<number> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]?.uri) return 0;

  const fileUri = result.assets[0].uri;
  const raw = await readAsStringAsync(fileUri, { encoding: 'utf8' });

  let data: BackupData;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('parse_error');
  }

  // バリデーション
  if (!data.version || !Array.isArray(data.trades)) throw new Error('invalid_format');
  if (data.trades.length > 50000) throw new Error('file_too_large');
  let imageBytesTotal = 0;
  for (const trade of data.trades) {
    if (
      typeof trade.id !== 'string' || trade.id.length === 0 || trade.id.length > 128 ||
      typeof trade.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(trade.date) ||
      typeof trade.pair !== 'string' || trade.pair.length > 30 ||
      !['buy', 'sell'].includes(trade.direction) ||
      !['win', 'loss', 'even'].includes(trade.result) ||
      typeof trade.lotSize !== 'number'
    ) throw new Error('invalid_format');
    for (const b64 of Object.values(trade.imageBase64 ?? {})) {
      imageBytesTotal += typeof b64 === 'string' ? b64.length : 0;
      if (imageBytesTotal > MAX_IMAGE_BASE64_TOTAL_BYTES) throw new Error('file_too_large');
    }
  }

  const db = await getDatabase();

  // インポートで既存データを全置換する前に、直前の状態をキャッシュへ退避しておく（万一の復旧用）
  try {
    const [prevTrades, prevPairs] = await Promise.all([getAllTrades(), getCurrencyPairs()]);
    if (prevTrades.length > 0 && cacheDirectory) {
      const snapshotPath = `${cacheDirectory}fx-pre-import-snapshot.json`;
      await writeAsStringAsync(
        snapshotPath,
        JSON.stringify({ exportedAt: new Date().toISOString(), trades: prevTrades, pairs: prevPairs }),
        { encoding: 'utf8' }
      );
    }
  } catch {
    // 退避に失敗してもインポート自体は続行する
  }

  // 画像を先に書き戻す（URIのマッピングを作る。DBには相対パスのみ保存する）
  const uriMap: Record<string, string> = {};
  const chartsDir = `${documentDirectory}charts/`;

  const chartsInfo = await getInfoAsync(chartsDir);
  if (!chartsInfo.exists) {
    await makeDirectoryAsync(chartsDir, { intermediates: true });
  }

  for (const trade of data.trades) {
    if (!trade.imageBase64) continue;
    for (const [oldUri, base64] of Object.entries(trade.imageBase64)) {
      try {
        const rawExt = oldUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
        const safeExt = /^[a-z]{2,5}$/.test(rawExt) ? rawExt : 'jpg';
        const safeId = String(trade.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
        const relPath = `charts/${safeId}_${Object.keys(uriMap).length}.${safeExt}`;
        await writeAsStringAsync(`${documentDirectory}${relPath}`, base64, { encoding: 'base64' });
        uriMap[oldUri] = relPath;
      } catch {
        // 書き戻し失敗は無視（画像なしで復元）
      }
    }
  }

  // トランザクションで全置換
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM trades');
    // currency_pairsはUNIQUE制約があるためデフォルトを残しつつINSERT OR IGNORE
    await db.execAsync('DELETE FROM currency_pairs');

    for (const pair of (data.pairs ?? [])) {
      await db.runAsync(
        'INSERT OR IGNORE INTO currency_pairs (id, name, pip_digits, is_yen_pair, is_active) VALUES (?, ?, ?, ?, ?)',
        [pair.id, pair.name, pair.pipDigits, pair.isYenPair ? 1 : 0, pair.isActive ? 1 : 0]
      );
    }

    for (const trade of data.trades) {
      // URIを新しいパスに置換。マッピングにない値は相対パス形式でなければ破棄する（任意ローカルURI注入の防止）
      const newImageUris = (trade.imageUris ?? [])
        .map(u => uriMap[u] ?? (typeof u === 'string' && !u.includes('://') ? u : null))
        .filter((u): u is string => u !== null);
      await db.runAsync(
        `INSERT OR REPLACE INTO trades
          (id, date, pair, direction, entry_rate, exit_rate, stop_loss, take_profit, planned_r_r,
           lot_size, style, tags, image_uris, entry_method, pips, profit_loss, result, reflection, self_rating,
           bookmarked, mental_focus, mental_calm, mental_fear, rule_checks,
           tf_weekly, tf_daily, tf_4h, tf_1h, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trade.id, trade.date, trade.pair, trade.direction,
          trade.entryRate, trade.exitRate, trade.stopLoss ?? null, trade.takeProfit ?? null, trade.plannedRR ?? null,
          trade.lotSize, trade.style,
          JSON.stringify(trade.tags ?? []),
          JSON.stringify(newImageUris),
          trade.entryMethod ?? 'full',
          trade.pips ?? null, trade.profitLoss ?? null, trade.result,
          trade.reflection ?? '', trade.selfRating ?? 3,
          trade.bookmarked ? 1 : 0,
          trade.mentalFocus ?? null, trade.mentalCalm ?? null, trade.mentalFear ?? null,
          JSON.stringify(trade.ruleChecks ?? []),
          trade.tfWeekly ?? '', trade.tfDaily ?? '', trade.tf4h ?? '', trade.tf1h ?? '',
          trade.createdAt,
        ]
      );
    }

    // 設定を復元（既存キーは上書き）
    for (const [key, value] of Object.entries(data.settings ?? {})) {
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  });

  return data.trades.length;
}

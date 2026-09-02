import {
  cacheDirectory,
  documentDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  makeDirectoryAsync,
  getInfoAsync,
  deleteAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getAllTrades, getCurrencyPairs, getSetting, setSetting } from '../db/queries';
import { getDatabase, SCHEMA_MIGRATIONS } from '../db/database';
import { resolveImageUri, isSafeChartPath } from './imageStorage';
import type { Trade, CurrencyPair } from '../types';

const SCHEMA_VERSION = SCHEMA_MIGRATIONS.length;
// **インポート側**が受け付ける画像の合計量（base64換算）。
//
// エクスポートはこれより小さい MAX_EXPORT_IMAGE_BASE64_BYTES で積むので、
// 自分で作ったファイルがここに引っかかることはない。ここを下げてはいけない —
// 過去に作られたバックアップファイルが読めなくなり、機種変更のときに詰む。
//
// かつてはインポート側にしか上限が無く、エクスポートは無制限だった。そのため
// 画像の多いユーザーは「作れるのに復元できないバックアップ」を持たされていた。
// 本人はバックアップ済みのつもりで機種変更し、復元しようとして初めて弾かれる —
// 旧端末を手放した後では取り返しがつかない。
export const MAX_IMAGE_BASE64_TOTAL_BYTES = 200 * 1024 * 1024; // 合計200MBまで
/** 1ファイルに載せられるトレード件数。こちらもインポート側と共有する。 */
export const MAX_TRADES_PER_BACKUP = 50000;

/**
 * **エクスポート時**に積む画像の上限。インポートの上限（200MB）より意図的に小さい。
 *
 * 全画像を base64 にして1つの JSON 文字列にまとめる作りのため、書き出しの瞬間に
 * おおよそ3倍のメモリが要る（base64の文字列 → JSON.stringify の結果 → ファイルへ
 * 渡すコピー）。インポートの上限いっぱいまで積むと 600MB 近くなり、端末が落ちて
 * **バックアップが1つも作れない**。落ちるくらいなら画像を諦めるほうがましなので、
 * ピークが 200MB 程度に収まる 60MB を上限にする。
 *
 * 端末での実測はしていない見積もりなので、落ちる報告があればここを下げること。
 * インポート側を下げてはいけない（既存のバックアップファイルが読めなくなる）。
 */
export const MAX_EXPORT_IMAGE_BASE64_BYTES = 60 * 1024 * 1024;

/** base64 は元データのおよそ 4/3 の長さになる。 */
const BASE64_OVERHEAD = 4 / 3;

/**
 * この画像をまだバックアップに載せられるか。
 * ここで true を返した画像だけを積む限り、インポート側の上限を超えることはなく、
 * かつ書き出し時のメモリも見積もりの範囲に収まる。
 */
export function canIncludeImage(currentBase64Bytes: number, imageBase64Bytes: number): boolean {
  return currentBase64Bytes + imageBase64Bytes <= MAX_EXPORT_IMAGE_BASE64_BYTES;
}

/**
 * 画像を積んでいったときに何枚入って何枚溢れるかを、実際の書き出しと同じ順序・
 * 同じ判定で数える純粋関数。上限を超える画像は飛ばして次に進む（そこで打ち切らない）
 * ので、後ろにある小さい画像は入ることがある。
 */
export function planImageInclusion(base64Sizes: number[]): {
  included: number;
  omitted: number;
  base64Bytes: number;
} {
  let total = 0, included = 0, omitted = 0;
  for (const size of base64Sizes) {
    if (canIncludeImage(total, size)) {
      total += size;
      included++;
    } else {
      omitted++;
    }
  }
  return { included, omitted, base64Bytes: total };
}

/** 画像込みでバックアップを作ったらどうなるかの事前見積もり。 */
export interface BackupImageEstimate {
  /** チャート画像の総枚数 */
  total: number;
  /** 上限内に収まる枚数 */
  included: number;
  /** 上限を超えて入らない枚数 */
  omitted: number;
  /** 画像の実ファイル合計バイト数（base64 前） */
  rawBytes: number;
}

/**
 * 画像を読み込まずに、ファイルサイズだけを見て見積もる。
 *
 * 実際に読み込んでから「入りませんでした」と伝えるのでは、その読み込み自体で
 * 端末が落ちうる。**落ちる前に伝えて選ばせる**ためにこれが要る。
 */
export async function estimateBackupImages(): Promise<BackupImageEstimate> {
  const trades = await getAllTrades();
  const sizes: number[] = [];
  let rawBytes = 0;
  for (const trade of trades) {
    for (const uri of trade.imageUris) {
      if (!uri.includes('://') && !isSafeChartPath(uri)) continue;
      try {
        const info = await getInfoAsync(resolveImageUri(uri));
        // size は exists のときだけ入る
        const raw = info.exists && 'size' in info ? (info.size as number) : 0;
        if (raw <= 0) continue;
        rawBytes += raw;
        sizes.push(Math.ceil(raw * BASE64_OVERHEAD));
      } catch {
        // 読めない画像は書き出し時も飛ばされるので、見積もりからも外す
      }
    }
  }
  const plan = planImageInclusion(sizes);
  return { total: sizes.length, included: plan.included, omitted: plan.omitted, rawBytes };
}

/** エクスポートの結果。呼び出し側が「何が入らなかったか」を伝えるために使う。 */
export interface ExportBackupResult {
  tradeCount: number;
  /** 実際にバックアップへ入った画像の枚数 */
  includedImages: number;
  /** 容量の上限に達したため入れられなかった画像の枚数（ユーザーが記録のみを選んだ場合は0） */
  omittedImages: number;
}

/**
 * 最後にこの端末でバックアップを作成した日時（ISO8601）。settingsテーブルに置く。
 *
 * 暗号鍵は端末に紐づくため、機種変更や端末の紛失では手動バックアップだけが復旧手段になる。
 * これまで「自分が最後にいつバックアップしたか」を知る手段がアプリ内に無く、
 * ユーザーは自分がどれだけ危険な状態かを判断できなかった。
 *
 * 「この端末で作成した日時」という意味なので、**バックアップファイルには含めない**
 * （exportBackup で除外する）。含めてしまうと、復元した瞬間に他端末の古い日付が
 * 入り込み、「復元したばかりなのに3ヶ月前」といった読めない表示になる。
 */
export const LAST_BACKUP_SETTING_KEY = 'last_backup_at';

/** バックアップが古いと見なす日数。これを超えたら設定画面で注意を促す。 */
export const BACKUP_STALE_DAYS = 14;

export type BackupFreshness =
  | { state: 'never' }
  | { state: 'ok'; at: Date; days: number }
  | { state: 'stale'; at: Date; days: number };

/**
 * 最終バックアップ日時の文字列から、表示に必要な状態を組み立てる純粋関数。
 * 解釈不能な値（旧バージョンの残骸や壊れた値）は「未実施」に倒す — 実際より
 * 安全に見せてしまうより、促しすぎるほうが被害が小さい。
 */
export function backupFreshness(raw: string | null | undefined, now: Date = new Date()): BackupFreshness {
  if (!raw) return { state: 'never' };
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return { state: 'never' };
  const at = new Date(ms);
  // 端末の時計が戻された等で未来日付になっていても、経過日数を負にはしない
  const days = Math.max(0, Math.floor((now.getTime() - ms) / 86400000));
  return { state: days > BACKUP_STALE_DAYS ? 'stale' : 'ok', at, days };
}

/** 最終バックアップ日時を取得する（未実施なら null）。 */
export async function getLastBackupAt(): Promise<string | null> {
  return getSetting(LAST_BACKUP_SETTING_KEY);
}

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

/**
 * バックアップファイルを作って共有シートに渡す。
 *
 * `includeImages` を false にすると、チャート画像を一切含めない軽量なファイルを作る。
 * 画像はバックアップの大半を占めるため、トレード記録だけを確実に残したい場合や、
 * 画像込みでは容量が大きすぎる場合の逃げ道になる。
 */
export async function exportBackup(
  options: { includeImages?: boolean } = {}
): Promise<ExportBackupResult> {
  const includeImages = options.includeImages !== false;
  const [trades, pairs] = await Promise.all([getAllTrades(), getCurrencyPairs()]);

  const db = await getDatabase();
  const settingRows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  const settings: Record<string, string> = {};
  for (const r of settingRows) {
    // 「この端末で最後にバックアップした日時」はバックアップ間で持ち回らない
    if (r.key === LAST_BACKUP_SETTING_KEY) continue;
    settings[r.key] = r.value;
  }

  // 各トレードの画像をBase64に変換（メモリ節約のため逐次処理）
  const backupTrades: BackupTrade[] = [];
  let imageBase64Total = 0;
  let includedImages = 0;
  let omittedImages = 0;
  for (const trade of trades) {
    const imageBase64: Record<string, string> = {};
    if (!includeImages) {
      // ユーザーが記録のみを選んだ場合。本人の選択なので omittedImages には数えない。
      backupTrades.push({ ...trade, imageBase64 });
      continue;
    }
    for (const uri of trade.imageUris) {
      // 万一DBに不正なパスが入っていても、バックアップJSONに他ファイルを
      // 取り込まないようにする
      if (!uri.includes('://') && !isSafeChartPath(uri)) continue;
      try {
        const resolved = resolveImageUri(uri);
        const info = await getInfoAsync(resolved);
        if (!info.exists) continue;
        const b64 = await readAsStringAsync(resolved, { encoding: 'base64' });
        // 上限を超える画像は積まない。ここで止めずに積むと、インポート側の
        // 同じ上限に引っかかって**ファイルごと復元不能**になる。
        // 画像を落としてでもトレード記録は必ず復元できる状態を優先する。
        if (!canIncludeImage(imageBase64Total, b64.length)) {
          omittedImages++;
          continue;
        }
        imageBase64Total += b64.length;
        imageBase64[uri] = b64;
        includedImages++;
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

  // 暗号化DBの投資を無にしないよう、共有後は平文の一時ファイルをキャッシュに残さない
  await deleteAsync(filePath, { idempotent: true }).catch(() => {});

  // 共有シートを閉じた時点を「バックアップした」と見なす。保存先まで追跡する手段が
  // Sharing には無いため、これが取れる最良の信号（キャンセルされた場合は実際より
  // 新しく見えるが、shareAsync まで到達している以上ファイルは生成できている）。
  // ここでの失敗は表示が古いままになるだけなので、エクスポート自体は成功扱いにする。
  await setSetting(LAST_BACKUP_SETTING_KEY, new Date().toISOString()).catch(() => {});

  return { tradeCount: trades.length, includedImages, omittedImages };
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
  // 0件のバックアップは、DELETE FROM trades だけ実行されて 0 が返る。
  // 呼び出し側は count > 0 のときしかアラートを出さないため、ユーザーには
  // 「何も起きていないのに全トレードが消えた」ように見え、しかも復旧用の
  // 「元に戻す」ボタンも表示されないという最悪の結果になっていた。
  // 破壊的処理に入る前に明示的に拒否する。
  if (data.trades.length === 0) throw new Error('empty_backup');
  if (data.trades.length > MAX_TRADES_PER_BACKUP) throw new Error('file_too_large');
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
    if (prevTrades.length > 0) {
      const snapPath = snapshotPath();
      if (!snapPath) throw new Error('no_document_directory');
      await writeAsStringAsync(
        snapPath,
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
      // URIを新しいパスに置換。マッピングに無い値は charts/ 配下の相対パスだけを通す。
      // 「'://' を含まなければ通す」だけだと、"SQLite/fx_journal_v2.db" のような
      // 普通の相対パスが素通りし、そのトレードの削除で稼働中のDBが消せてしまう。
      const newImageUris = (trade.imageUris ?? [])
        .map(u => uriMap[u] ?? (isSafeChartPath(u) ? u : null))
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

    // 負けpipsの符号修復を復元後にも必ず適用する。
    //
    // 修復済みかどうかは settings のフラグで管理しているが、そのsettings自体も
    // バックアップに含まれる。不具合修正前に取ったバックアップを復元すると、
    // 壊れたpipsと「修復済み」フラグが同時に戻り、起動時のマイグレーションが
    // スキップされて二度と直らなくなる。ここで直接あて直すことでその穴を塞ぐ。
    // 条件は database.ts のマイグレーションと同一（詳細入力由来の行は
    // 負けなら必ずpipsも負のため巻き込まない）。
    await db.runAsync(
      `UPDATE trades SET pips = -pips WHERE entry_method = 'quick' AND result = 'loss' AND pips IS NOT NULL AND pips > 0`
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('loss_pips_sign_fixed_v1', '1')`
    );

    // 手入力損益の符号も同様に修復する。符号反転は冪等（一度直すと
    // profit_loss<0 になり条件に再ヒットしない）ため無条件でよい。
    await db.runAsync(
      `UPDATE trades SET profit_loss = -profit_loss
        WHERE entry_method = 'quick' AND result = 'loss'
          AND profit_loss IS NOT NULL AND profit_loss > 0`
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('manual_pl_sign_fixed_v1', '1')`
    );

    // 損益10倍の修復も復元後にあて直す。ただし pips の符号反転と違い
    // 「÷10」は**冪等ではない**（二度あてると1/100になる）ので、無条件に実行しては
    // ならない。復元された settings にフラグが含まれているか＝そのバックアップが
    // 修正後に取られたものかで判定する。
    //   - 修正前のバックアップ → フラグ無し → ここで修復して フラグを立てる
    //   - 修正後のバックアップ → フラグ有り → 既に正しい値なので何もしない
    // CSVインポート行（id が 'mt4_' で始まる）は証券会社が出した実際の金額なので常に除外。
    // 判定はDBのsettingsではなく「バックアップJSONに入っていたフラグ」で行う。
    // importBackup は settings テーブルを削除しないため、起動時マイグレーションが
    // 立てたフラグが必ず残っており、DB側を見ると常に「修復済み」と判定されて
    // この修復が一度も実行されなかった（10倍のまま復元されていた）。
    const scaleFixed = data.settings?.['profit_loss_scale_fixed_v1'] === '1';
    if (!scaleFixed) {
      await db.runAsync(
        `UPDATE trades SET profit_loss = ROUND(profit_loss / 10.0)
          WHERE profit_loss IS NOT NULL AND profit_loss != 0 AND id NOT LIKE 'mt4_%'`
      );
      await db.runAsync(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('profit_loss_scale_fixed_v1', '1')`
      );
    }
  });

  return data.trades.length;
}

interface SnapshotData {
  exportedAt: string;
  trades: Trade[];
  pairs: CurrencyPair[];
}

const SNAPSHOT_FILENAME = 'fx-pre-import-snapshot.json';

/**
 * インポート前スナップショットの保存先。
 *
 * 以前は cacheDirectory に置いていたが、iOS/Android はストレージが逼迫すると
 * キャッシュを**予告なく削除する**。全データを置き換えるインポートの唯一の
 * 復旧手段がOSの都合で消えるのは危険なため、documentDirectory に置く。
 * （復元後は削除するので永続的に残るわけではない）
 */
function snapshotPath(): string | null {
  return documentDirectory ? `${documentDirectory}${SNAPSHOT_FILENAME}` : null;
}

/**
 * インポート直前のスナップショットの有効期限（日）。
 *
 * 期限を設けないと、3か月前のインポート時に作られたスナップショットに対して
 * 「元に戻す」ボタンが今日も表示され続け、押すとその間の記録が全部消える。
 * このスナップショットは全トレードの平文JSONでもあるため、
 * 用が済んだら残しておかないほうがよい。
 */
const SNAPSHOT_TTL_DAYS = 7;

/**
 * 直前のインポート前スナップショットを返す。期限切れなら削除して null。
 * いつの時点に戻るのかを呼び出し側が必ず提示できるよう、日時を返す。
 */
export async function getPreImportSnapshot(): Promise<{ exportedAt: string } | null> {
  const p = snapshotPath();
  if (!p) return null;
  const info = await getInfoAsync(p);
  if (!info.exists) return null;
  try {
    const raw = await readAsStringAsync(p, { encoding: 'utf8' });
    const data = JSON.parse(raw) as SnapshotData;
    const at = Date.parse(data.exportedAt);
    if (!Number.isFinite(at)) return null;
    if (Date.now() - at > SNAPSHOT_TTL_DAYS * 86400000) {
      await deleteAsync(p, { idempotent: true }).catch(() => {});
      return null;
    }
    return { exportedAt: data.exportedAt };
  } catch {
    return null;
  }
}

/**
 * バックアップインポート直前に自動保存されたスナップショットから復元する。
 * 画像ファイル自体はインポート時に上書き削除されないため、旧パスのままで復元できる。
 */
export async function restorePreImportSnapshot(): Promise<number> {
  const snapPath = snapshotPath();
  if (!snapPath) throw new Error('no_document_directory');
  const info = await getInfoAsync(snapPath);
  if (!info.exists) throw new Error('no_snapshot');

  const raw = await readAsStringAsync(snapPath, { encoding: 'utf8' });
  const data: SnapshotData = JSON.parse(raw);
  if (!Array.isArray(data.trades)) throw new Error('invalid_format');

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM trades');
    await db.execAsync('DELETE FROM currency_pairs');

    for (const pair of (data.pairs ?? [])) {
      await db.runAsync(
        'INSERT OR IGNORE INTO currency_pairs (id, name, pip_digits, is_yen_pair, is_active) VALUES (?, ?, ?, ?, ?)',
        [pair.id, pair.name, pair.pipDigits, pair.isYenPair ? 1 : 0, pair.isActive ? 1 : 0]
      );
    }

    for (const trade of data.trades) {
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
          JSON.stringify(trade.imageUris ?? []),
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

    // インポート前スナップショットは修正前に取られている可能性があるため、
    // 復元後にも負けpipsの符号を正す（database.tsのマイグレーションと同条件）。
    await db.runAsync(
      `UPDATE trades SET pips = -pips WHERE entry_method = 'quick' AND result = 'loss' AND pips IS NOT NULL AND pips > 0`
    );
  });

  // 復元に使い終わったスナップショットは平文の全トレード記録を含むため、
  // キャッシュに残さず削除する
  await deleteAsync(snapPath, { idempotent: true }).catch(() => {});

  return data.trades.length;
}

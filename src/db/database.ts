import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { getOrCreateEncryptionKey, getEncryptionKey, deleteEncryptionKey } from './dbEncryption';

const OLD_DB_NAME = 'fx_journal.db'; // 旧・平文DB（SQLCipher導入前）
const NEW_DB_NAME = 'fx_journal_v2.db'; // 新・SQLCipher暗号化DB
const MIGRATION_FLAG_KEY = 'fx_db_migrated_v1';

// 暗号化DBが既に存在するはずなのに、SecureStoreから復号鍵を取得できない状態。
// resetDatabase()による全データ削除以外に復旧手段がないため、通常のDB初期化失敗
// （db_init_error）とは別のエラーとして扱い、呼び出し側で状況に応じた案内を出す。
export class EncryptionKeyLostError extends Error {
  constructor() {
    super('encryption_key_lost');
    this.name = 'EncryptionKeyLostError';
  }
}

// Promiseをキャッシュして並行呼び出し時の二重初期化を防ぐ
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openEncryptedDatabase().then(async (d) => {
      await initializeDatabase(d);
      return d;
    }).catch((e) => {
      dbPromise = null; // 失敗時はリトライできるようにリセット
      throw e;
    });
  }
  return dbPromise;
}

/**
 * 暗号化キーとDBファイルの不整合等で復号できなくなった場合の最終手段。
 * DBファイル・移行フラグ・暗号化キーをすべて削除し、次回 getDatabase() で
 * まっさらな状態から作り直せるようにする（保存されていたトレード記録は失われる）。
 */
export async function resetDatabase(): Promise<void> {
  // 順序が重要。以前は「接続を閉じずに削除 → 失敗を握り潰す → 鍵とフラグは確実に削除」
  // となっており、最後の復旧手段が自分でデータを復号不能にする経路になっていた。
  //
  // expo-sqlite は接続が開いたままのDBの削除を例外で拒否する
  // （SQLiteModule.swift の deleteDatabase は findCachedDatabase にヒットすると throw）。
  // したがって closeAsync せずに deleteDatabaseAsync を呼ぶと、DBファイルは残ったまま
  // 鍵だけが消え、次回起動で新しい鍵が生成されて旧DBを永久に開けなくなる。
  //
  // 正しい順序は「接続を閉じる → DB削除 → 削除できたときだけ鍵を消す」。
  const openDb = await dbPromise?.catch(() => null);
  dbPromise = null;
  await openDb?.closeAsync().catch(() => {});

  let dbDeleted = true;
  try {
    await SQLite.deleteDatabaseAsync(NEW_DB_NAME);
  } catch {
    dbDeleted = false;
  }
  // 移行フラグが立ったまま旧・平文DBが残っていると、リセット後の起動で
  // 「削除したはずの記録」が復活しうるため、旧DBも消しておく。
  await SQLite.deleteDatabaseAsync(OLD_DB_NAME).catch(() => {});

  if (!dbDeleted) {
    // DBを消せていないのに鍵を消すと、二度と開けない組み合わせが残る。
    // 鍵とフラグは温存し、失敗として呼び出し側に伝える（次回起動で再試行できる）。
    throw new Error('db_reset_failed');
  }

  await SecureStore.deleteItemAsync(MIGRATION_FLAG_KEY).catch(() => {});
  await deleteEncryptionKey().catch(() => {});
}

// 平文SQLite→SQLCipher暗号化DBへの移行。
// 既に移行済みなら暗号化DBを開くのみ。旧DBが存在する場合はSQLCipher公式の
// sqlcipher_export()（ATTACH ... KEY → sqlcipher_export → DETACH）で暗号化DBへ
// 全データをエクスポートし、件数検証に成功した場合のみ移行完了とする。
// 件数検証と移行フラグの確定後、旧・平文DBファイルは削除する
// （暗号化前の全トレード記録が端末に残り続けるのを防ぐため）。
//
// 注: ネイティブの backupDatabaseAsync（sqlite3_backup、ページ単位の生コピー）は
// 暗号化状態が異なるDB間の移行には使えない。SQLCipherは平文ページと暗号化ページで
// フォーマットが異なるため、ページを生コピーすると宛先DBが読み取り不能になる。
async function openEncryptedDatabase(): Promise<SQLite.SQLiteDatabase> {
  const migrated = await SecureStore.getItemAsync(MIGRATION_FLAG_KEY);

  if (migrated === 'v1') {
    // 暗号化DBは既に存在する前提の状態。ここで鍵が取得できない場合、
    // getOrCreateEncryptionKeyで新規鍵を生成してしまうと、既存の暗号化DBを
    // 二度と復号できない鍵で開こうとすることになる（＝実質的な全データ消失）。
    // 新規鍵は生成せず、専用のエラーとして呼び出し側に委ねる。
    const key = await getEncryptionKey();
    if (!key) throw new EncryptionKeyLostError();
    const db = await SQLite.openDatabaseAsync(NEW_DB_NAME);
    await db.execAsync(`PRAGMA key = '${key}';`);
    return db;
  }

  const key = await getOrCreateEncryptionKey();

  // migrated !== 'v1' の場合、fx_journal_v2.db が存在していても正規の移行完了物ではない
  // （旧バージョンのbackupDatabaseAsyncによる移行失敗で壊れたファイルが残っている可能性がある）。
  // ATTACHが壊れたファイルにぶつかって失敗しないよう、移行前に必ず削除してから作り直す。
  await SQLite.deleteDatabaseAsync(NEW_DB_NAME).catch(() => {});

  let plainDb: SQLite.SQLiteDatabase | null = null;
  try {
    const candidate = await SQLite.openDatabaseAsync(OLD_DB_NAME);
    const row = await candidate.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='trades'"
    );
    if (row) {
      plainDb = candidate;
    } else {
      // 新規インストール等で実データがない場合は空DBを片付ける
      await candidate.closeAsync();
      await SQLite.deleteDatabaseAsync(OLD_DB_NAME).catch(() => {});
    }
  } catch {
    plainDb = null;
  }

  if (!plainDb) {
    // 移行対象データがない場合は新規に空の暗号化DBを作るだけでよい
    const encDb = await SQLite.openDatabaseAsync(NEW_DB_NAME);
    await encDb.execAsync(`PRAGMA key = '${key}';`);
    await SecureStore.setItemAsync(MIGRATION_FLAG_KEY, 'v1');
    return encDb;
  }

  // 暗号化DBファイルを先に別コネクションで開くと同一ファイルへの二重ロックが起きうるため、
  // 平文DB側のコネクションからATTACH/sqlcipher_exportで新DBファイルを完成させてから開き直す。
  const origCount = await plainDb.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM trades');
  const newDbPath = `${SQLite.defaultDatabaseDirectory.replace(/\/+$/, '')}/${NEW_DB_NAME}`;
  await plainDb.execAsync(`ATTACH DATABASE '${newDbPath}' AS encrypted KEY '${key}';`);
  await plainDb.execAsync(`SELECT sqlcipher_export('encrypted');`);
  await plainDb.execAsync('DETACH DATABASE encrypted;');
  await plainDb.closeAsync();

  const encDb = await SQLite.openDatabaseAsync(NEW_DB_NAME);
  await encDb.execAsync(`PRAGMA key = '${key}';`);
  const newCount = await encDb.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM trades');
  if ((origCount?.c ?? 0) !== (newCount?.c ?? 0)) {
    throw new Error('db_migration_verify_failed');
  }

  await SecureStore.setItemAsync(MIGRATION_FLAG_KEY, 'v1');
  // 暗号化DBへの移行・検証が完了したので、平文のトレード記録を端末に残さないよう
  // 旧DBファイルを削除する（plainDbは上で既にclose済み）。
  await SQLite.deleteDatabaseAsync(OLD_DB_NAME).catch(() => {});
  return encDb;
}

// 既存DBへのカラム追加マイグレーション一覧。SCHEMA_VERSIONは常にこの配列長と
// 一致する（バックアップファイルのschema値として使うため、backup.tsから参照する）。
export const SCHEMA_MIGRATIONS = [
  'ALTER TABLE trades ADD COLUMN stop_loss REAL',
  'ALTER TABLE trades ADD COLUMN take_profit REAL',
  'ALTER TABLE trades ADD COLUMN planned_r_r REAL',
  "ALTER TABLE trades ADD COLUMN tags TEXT DEFAULT '[]'",
  "ALTER TABLE trades ADD COLUMN image_uris TEXT DEFAULT '[]'",
  'ALTER TABLE trades ADD COLUMN bookmarked INTEGER DEFAULT 0',
  'ALTER TABLE trades ADD COLUMN mental_focus INTEGER',
  'ALTER TABLE trades ADD COLUMN mental_calm INTEGER',
  'ALTER TABLE trades ADD COLUMN mental_fear INTEGER',
  "ALTER TABLE trades ADD COLUMN rule_checks TEXT DEFAULT '[]'",
  "ALTER TABLE trades ADD COLUMN tf_weekly TEXT DEFAULT ''",
  "ALTER TABLE trades ADD COLUMN tf_daily TEXT DEFAULT ''",
  "ALTER TABLE trades ADD COLUMN tf_4h TEXT DEFAULT ''",
  "ALTER TABLE trades ADD COLUMN tf_1h TEXT DEFAULT ''",
];

const DEFAULT_TAGS = JSON.stringify([
  'MAクロス', 'サポレジ反発', 'トレンドライン', 'チャートパターン',
  'ボリンジャー', 'RSI/MACD', 'フィボナッチ', '経済指標', 'ニュース', '感覚',
]);

const DEFAULT_RULES = JSON.stringify([
  'ロット上限を守った', '損切りを設定した', 'トレンド方向に乗った',
  '根拠を確認してからエントリー', '感情的にならなかった',
  '目標RRを満たしていた', '経済指標前を避けた',
]);

async function initializeDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS trades (
      id            TEXT PRIMARY KEY,
      date          TEXT NOT NULL,
      pair          TEXT NOT NULL,
      direction     TEXT NOT NULL,
      entry_rate    REAL,
      exit_rate     REAL,
      stop_loss     REAL,
      take_profit   REAL,
      planned_r_r   REAL,
      lot_size      REAL NOT NULL,
      style         TEXT NOT NULL,
      tags          TEXT DEFAULT '[]',
      image_uris    TEXT DEFAULT '[]',
      entry_method  TEXT DEFAULT 'full',
      pips          REAL,
      profit_loss   REAL,
      result        TEXT NOT NULL,
      reflection    TEXT DEFAULT '',
      self_rating   INTEGER DEFAULT 3,
      bookmarked    INTEGER DEFAULT 0,
      mental_focus  INTEGER,
      mental_calm   INTEGER,
      mental_fear   INTEGER,
      rule_checks   TEXT DEFAULT '[]',
      tf_weekly     TEXT DEFAULT '',
      tf_daily      TEXT DEFAULT '',
      tf_4h         TEXT DEFAULT '',
      tf_1h         TEXT DEFAULT '',
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS currency_pairs (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      pip_digits  INTEGER NOT NULL,
      is_yen_pair INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reflection_templates (
      id    TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(date);
    CREATE INDEX IF NOT EXISTS idx_trades_bookmarked ON trades(bookmarked);
  `);

  // entry_method カラムがなければテーブル再作成（entry_rate/exit_rate の NOT NULL 解除 + entry_method 追加）
  const cols = await database.getAllAsync<{ name: string }>('PRAGMA table_info(trades)');
  const hasEntryMethod = cols.some(c => c.name === 'entry_method');
  if (!hasEntryMethod) {
    await database.withTransactionAsync(async () => {
      await database.execAsync('DROP TABLE IF EXISTS trades_new');
      await database.execAsync(`
        CREATE TABLE trades_new (
          id            TEXT PRIMARY KEY,
          date          TEXT NOT NULL,
          pair          TEXT NOT NULL,
          direction     TEXT NOT NULL,
          entry_rate    REAL,
          exit_rate     REAL,
          stop_loss     REAL,
          take_profit   REAL,
          planned_r_r   REAL,
          lot_size      REAL NOT NULL,
          style         TEXT NOT NULL,
          tags          TEXT DEFAULT '[]',
          image_uris    TEXT DEFAULT '[]',
          entry_method  TEXT DEFAULT 'full',
          pips          REAL,
          profit_loss   REAL,
          result        TEXT NOT NULL,
          reflection    TEXT DEFAULT '',
          self_rating   INTEGER DEFAULT 3,
          bookmarked    INTEGER DEFAULT 0,
          mental_focus  INTEGER,
          mental_calm   INTEGER,
          mental_fear   INTEGER,
          rule_checks   TEXT DEFAULT '[]',
          tf_weekly     TEXT DEFAULT '',
          tf_daily      TEXT DEFAULT '',
          tf_4h         TEXT DEFAULT '',
          tf_1h         TEXT DEFAULT '',
          created_at    TEXT NOT NULL
        )
      `);
      await database.execAsync(`
        INSERT INTO trades_new
          SELECT id, date, pair, direction, entry_rate, exit_rate, stop_loss, take_profit,
                 planned_r_r, lot_size, style, tags, image_uris, 'full', pips, profit_loss,
                 result, reflection, self_rating, bookmarked, mental_focus, mental_calm,
                 mental_fear, rule_checks, tf_weekly, tf_daily, tf_4h, tf_1h, created_at
          FROM trades
      `);
      await database.execAsync('DROP TABLE trades');
      await database.execAsync('ALTER TABLE trades_new RENAME TO trades');
      await database.execAsync('CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(date)');
      await database.execAsync('CREATE INDEX IF NOT EXISTS idx_trades_bookmarked ON trades(bookmarked)');
    });
  }

  // PRAGMA user_versionで適用済みマイグレーション数を記録し、未適用分だけ実行する
  // （以前は毎起動全件try/catchしていて、フルスキーマの新規DBでも全件が
  // 「duplicate column name」で失敗→握りつぶしを繰り返していた）。
  // user_versionが未設定(0)の既存DBでも、duplicate column nameは引き続き無視するため
  // 適用済み分の再実行は安全＝このバージョン導入前のDBからも問題なく移行できる。
  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const dbVersion = versionRow?.user_version ?? 0;
  if (dbVersion < SCHEMA_MIGRATIONS.length) {
    for (const sql of SCHEMA_MIGRATIONS.slice(dbVersion)) {
      try {
        await database.execAsync(sql);
      } catch (e) {
        if (!(e instanceof Error && e.message.includes('duplicate column name'))) throw e;
      }
    }
    await database.execAsync(`PRAGMA user_version = ${SCHEMA_MIGRATIONS.length}`);
  }

  // 画像パスの相対化マイグレーション（絶対パス保存だとOSアップデート後にコンテナIDが変わり画像が失われるため）。
  // 完了後はフラグを立てて以後の起動でスキップする（画像を1枚も使っていないユーザーでも
  // 毎起動 SELECT id, image_uris FROM trades で全件を読んでいたコストを避ける）。
  const imageMigrated = await database.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key='image_path_migrated_v1'`
  );
  if (!imageMigrated) {
    // 相対パス（charts/...）は "://" を含まないため、絶対パス（file://等）を含む行だけに絞る
    const imageRows = await database.getAllAsync<{ id: string; image_uris: string }>(
      `SELECT id, image_uris FROM trades WHERE image_uris LIKE '%://%'`
    );
    for (const row of imageRows) {
      let uris: string[];
      try {
        uris = JSON.parse(row.image_uris || '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(uris) || uris.length === 0) continue;
      let changed = false;
      const newUris = uris.map((u) => {
        if (typeof u === 'string' && u.includes('://')) {
          changed = true;
          const filename = u.split('/').pop()?.split('?')[0] ?? u;
          return `charts/${filename}`;
        }
        return u;
      });
      if (changed) {
        await database.runAsync('UPDATE trades SET image_uris = ? WHERE id = ?', [
          JSON.stringify(newUris),
          row.id,
        ]);
      }
    }
    await database.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('image_path_migrated_v1', '1')`
    );
  }

  // 負けトレードのpipsが正のまま保存されていた不具合の修復。
  //
  // クイック入力欄は keyboardType="decimal-pad" でマイナス記号のキーが無く、
  // ユーザーは負の値を入力できない。それにもかかわらず入力値をそのまま保存して
  // いたため、「負け」を選んで 50 と入れると +50 として記録されていた。
  // 影響は合計pips・プロフィットファクター(grossLossが常に0のため永久に∞)・
  // 分析タブのpips系指標・ホーム画面ウィジェットの全てに及ぶ。
  // 2026-07-02から2026-08-29まで、App Store公開の全期間にわたって存在した。
  //
  // 詳細入力はレートから calcPips() で符号付きに算出し、結果もそこから
  // determineResult() で導出するため、負けのpipsは必ず負になる。したがって
  // 「result='loss' なのに pips>0」という組み合わせはクイック入力の本不具合
  // でしか発生せず、この条件に限定すれば誤った行を巻き込まずに修復できる。
  //
  // pips=0 は引き分け相当で符号の概念が無いため対象外（> 0 のみ）。
  const pipsSignFixed = await database.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key='loss_pips_sign_fixed_v1'`
  );
  if (!pipsSignFixed) {
    await database.runAsync(
      `UPDATE trades SET pips = -pips WHERE entry_method = 'quick' AND result = 'loss' AND pips IS NOT NULL AND pips > 0`
    );
    await database.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('loss_pips_sign_fixed_v1', '1')`
    );
  }

  // 損益が実際の10倍で保存されていた不具合の修復。
  //
  // calcProfitLoss が `pips × lotSize × lotUnit / 10` になっていたが、クロス円は
  // pipDigits=2（1pip = 0.01円）なので正しくは `/ 100`。表示・保存される損益が
  // すべて10倍だった（例: 実際500円のところ5,000円）。
  //
  // 対象の絞り込みが重要。profit_loss を書き込む経路は2つしかない。
  //   - 詳細入力の保存（calcProfitLoss の戻り値。クロス円のときのみ非null）→ 10倍。修復対象
  //   - MT4/MT5のCSVインポート（mt4Import.ts:399。証券会社が出力した**実際の金額**
  //     をそのまま保存しており計算式を通っていない）→ 正しい値。**触ってはいけない**
  // クイック入力は profit_loss を null で保存するため対象外。
  //
  // CSVインポート行は id が 'mt4_' で始まる（mt4Import.ts:380）ので、これで除外する。
  // entry_method では区別できない（詳細入力もCSVインポートも 'full' のため）。
  const profitScaleFixed = await database.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key='profit_loss_scale_fixed_v1'`
  );
  if (!profitScaleFixed) {
    await database.runAsync(
      `UPDATE trades SET profit_loss = ROUND(profit_loss / 10.0)
        WHERE profit_loss IS NOT NULL AND profit_loss != 0 AND id NOT LIKE 'mt4_%'`
    );
    await database.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('profit_loss_scale_fixed_v1', '1')`
    );
  }

  // 既存データのisYenPairフラグ修正（EUR/JPY, GBP/JPY, AUD/JPY が誤って0になっていた場合を修正）
  await database.execAsync(
    `UPDATE currency_pairs SET is_yen_pair = 1 WHERE name LIKE '%/JPY' AND is_yen_pair = 0;`
  );

  const existing = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM currency_pairs'
  );
  if (existing?.count === 0) {
    await database.execAsync(`
      INSERT INTO currency_pairs (id, name, pip_digits, is_yen_pair, is_active) VALUES
        ('1', 'USD/JPY', 2, 1, 1),
        ('2', 'EUR/JPY', 2, 1, 1),
        ('3', 'GBP/JPY', 2, 1, 1),
        ('4', 'EUR/USD', 4, 0, 1),
        ('5', 'GBP/USD', 4, 0, 1),
        ('6', 'AUD/JPY', 2, 1, 1);
    `);
  }

  await database.execAsync(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('lot_unit', '10000');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('default_style', 'day');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('account_balance', '0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('default_risk_pct', '2');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('monthly_pips_goal', '0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('monthly_win_rate_goal', '0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('app_lock_enabled', '0');
  `);
  await database.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('entry_tags', ?)`, [DEFAULT_TAGS]
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('trade_rules', ?)`, [DEFAULT_RULES]
  );
  await database.execAsync(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('onboarding_done', '0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('record_streak', '0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('last_record_date', '');
  `);

  const tmplCount = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM reflection_templates'
  );
  if (tmplCount?.count === 0) {
    await database.execAsync(`
      INSERT INTO reflection_templates (id, label, count) VALUES
        ('t1', 'エントリーが早すぎた', 0),
        ('t2', 'エントリーが遅すぎた', 0),
        ('t3', '利確が早すぎた', 0),
        ('t4', '損切りが遅すぎた', 0),
        ('t5', 'トレンドに逆らった', 0),
        ('t6', '計画通り実行できた', 0),
        ('t7', '感情的になった', 0),
        ('t8', 'ルール通り取引できた', 0);
    `);
  }
}

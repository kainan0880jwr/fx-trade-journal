import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { getOrCreateEncryptionKey } from './dbEncryption';

const OLD_DB_NAME = 'fx_journal.db'; // 旧・平文DB（SQLCipher導入前）
const NEW_DB_NAME = 'fx_journal_v2.db'; // 新・SQLCipher暗号化DB
const MIGRATION_FLAG_KEY = 'fx_db_migrated_v1';

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

// 平文SQLite→SQLCipher暗号化DBへの移行。
// 既に移行済みなら暗号化DBを開くのみ。旧DBが存在する場合はSQLCipher公式の
// sqlcipher_export()（ATTACH ... KEY → sqlcipher_export → DETACH）で暗号化DBへ
// 全データをエクスポートし、件数検証に成功した場合のみ移行完了とする。
// 旧DBファイルは削除せずそのまま残し、万一の際に手動復旧できるようにする。
//
// 注: ネイティブの backupDatabaseAsync（sqlite3_backup、ページ単位の生コピー）は
// 暗号化状態が異なるDB間の移行には使えない。SQLCipherは平文ページと暗号化ページで
// フォーマットが異なるため、ページを生コピーすると宛先DBが読み取り不能になる。
async function openEncryptedDatabase(): Promise<SQLite.SQLiteDatabase> {
  const key = await getOrCreateEncryptionKey();
  const migrated = await SecureStore.getItemAsync(MIGRATION_FLAG_KEY);

  if (migrated === 'v1') {
    const db = await SQLite.openDatabaseAsync(NEW_DB_NAME);
    await db.execAsync(`PRAGMA key = '${key}';`);
    return db;
  }

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
  return encDb;
}

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

  // 既存DBへのカラム追加マイグレーション
  const migrations = [
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
  for (const sql of migrations) {
    try {
      await database.execAsync(sql);
    } catch (e) {
      if (!(e instanceof Error && e.message.includes('duplicate column name'))) throw e;
    }
  }

  // 画像パスの相対化マイグレーション（絶対パス保存だとOSアップデート後にコンテナIDが変わり画像が失われるため）
  const imageRows = await database.getAllAsync<{ id: string; image_uris: string }>(
    'SELECT id, image_uris FROM trades'
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

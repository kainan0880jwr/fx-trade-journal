/**
 * 見本データの**安全性**を固定する。
 *
 * この機能は本番経路からユーザーのDBに書き込む。壊れ方が「データが消える」に
 * 直結するので、見た目の正しさ（勝率やPF）は `screenshotMode.test.ts` に任せ、
 * こちらは次の3点だけを厳しく見る:
 *   1. 記録が1件でもあれば**何も入れない**
 *   2. 削除は `sample-` で始まる行**だけ**
 *   3. 削除SQLが条件なしの `DELETE FROM trades` に化けていない
 *
 * 3 はソースを直接読む。1と2はモックで呼ばれ方を見る。
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// jest.mock のファクトリはモジュールの import より先に呼ばれるため、
// 外側で宣言した変数を参照できない（TDZ に入り undefined になる）。
// ファクトリの中で作り、あとから requireMock で取り出す。
jest.mock('../../db/database', () => ({
  getDatabase: jest.fn(async () => ({ runAsync: jest.fn(), getFirstAsync: jest.fn() })),
}));
jest.mock('../../db/queries', () => ({
  insertTrade: jest.fn(),
  getSetting: jest.fn(),
  setSetting: jest.fn(),
  getTotalTradeCount: jest.fn(),
  getEntryTags: jest.fn(),
  getTradeRules: jest.fn(),
  saveEntryTags: jest.fn(),
  saveTradeRules: jest.fn(),
}));

const q = jest.requireMock('../../db/queries') as Record<string, jest.Mock>;
const { getDatabase } = jest.requireMock('../../db/database') as { getDatabase: jest.Mock };
const mockRunAsync = jest.fn();
const mockGetFirstAsync = jest.fn();

import {
  SAMPLE_ID_PREFIX, DEMO_TRADES,
  buildSampleTrades, insertSampleTrades, removeSampleData, hasSampleData,
} from '../sampleData';

beforeEach(() => {
  jest.clearAllMocks();
  mockRunAsync.mockResolvedValue({ changes: 22 });
  getDatabase.mockResolvedValue({ runAsync: mockRunAsync, getFirstAsync: mockGetFirstAsync });
  mockGetFirstAsync.mockResolvedValue({ n: 22 });
  q.getEntryTags.mockResolvedValue([]);
  q.getTradeRules.mockResolvedValue([]);
  q.getSetting.mockResolvedValue(null);
});

describe('insertSampleTrades', () => {
  it('記録が1件でもあれば何も入れない', async () => {
    q.getTotalTradeCount.mockResolvedValue(1);
    expect(await insertSampleTrades()).toBe(0);
    expect(q.insertTrade).not.toHaveBeenCalled();
    expect(q.setSetting).not.toHaveBeenCalled();
  });

  it('空のときだけ入れ、id が全て sample- で始まる', async () => {
    q.getTotalTradeCount.mockResolvedValue(0);
    const n = await insertSampleTrades();
    expect(n).toBe(DEMO_TRADES.length);
    expect(q.insertTrade).toHaveBeenCalledTimes(DEMO_TRADES.length);

    const ids = q.insertTrade.mock.calls.map(([trade]) => trade.id);
    expect(ids.filter((id: string) => !id.startsWith(SAMPLE_ID_PREFIX))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('タグとルールが既に設定されていれば上書きしない', async () => {
    q.getTotalTradeCount.mockResolvedValue(0);
    q.getEntryTags.mockResolvedValue(['自分のタグ']);
    q.getTradeRules.mockResolvedValue(['自分のルール']);
    await insertSampleTrades();
    expect(q.saveEntryTags).not.toHaveBeenCalled();
    expect(q.saveTradeRules).not.toHaveBeenCalled();
  });

  it('タグとルールが空のときは既定値を入れる（タグ分析が空にならないように）', async () => {
    q.getTotalTradeCount.mockResolvedValue(0);
    await insertSampleTrades();
    expect(q.saveEntryTags).toHaveBeenCalledTimes(1);
    expect(q.saveTradeRules).toHaveBeenCalledTimes(1);
  });

  it('入れたら見本ありのフラグを立てる', async () => {
    q.getTotalTradeCount.mockResolvedValue(0);
    await insertSampleTrades();
    expect(q.setSetting).toHaveBeenCalledWith('sample_data_present', '1');
  });
});

describe('removeSampleData', () => {
  it('sample- で始まる行だけを消す', async () => {
    await removeSampleData();
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockRunAsync.mock.calls[0];
    expect(sql).toMatch(/WHERE\s+id\s+LIKE\s+\?/i);
    expect(params).toEqual(['sample-%']);
  });

  it('消したらフラグを下ろす', async () => {
    await removeSampleData();
    expect(q.setSetting).toHaveBeenCalledWith('sample_data_present', '0');
  });

  it('消した件数を返す', async () => {
    mockRunAsync.mockResolvedValue({ changes: 7 });
    expect(await removeSampleData()).toBe(7);
  });
});

describe('hasSampleData', () => {
  it('フラグが 1 で、かつ行が残っているときだけ true', async () => {
    q.getSetting.mockResolvedValue('1');
    expect(await hasSampleData()).toBe(true);
    q.getSetting.mockResolvedValue('0');
    expect(await hasSampleData()).toBe(false);
    q.getSetting.mockResolvedValue(null);
    expect(await hasSampleData()).toBe(false);
  });

  it('フラグが残っていても行が無ければ false（復元・リセット後のずれ）', async () => {
    q.getSetting.mockResolvedValue('1');
    mockGetFirstAsync.mockResolvedValue({ n: 0 });
    expect(await hasSampleData()).toBe(false);
  });

  it('行の数え方が sample- 限定になっている', async () => {
    q.getSetting.mockResolvedValue('1');
    await hasSampleData();
    const [sql, params] = mockGetFirstAsync.mock.calls[0];
    expect(sql).toMatch(/WHERE\s+id\s+LIKE\s+\?/i);
    expect(params).toEqual(['sample-%']);
  });

  it('読めなくても落ちない（バナーを出さない側に倒す）', async () => {
    q.getSetting.mockRejectedValue(new Error('db closed'));
    expect(await hasSampleData()).toBe(false);
  });
});

describe('buildSampleTrades', () => {
  it('id の前置きを呼び出し側が決められる（撮影モードと本番で分けるため）', () => {
    const trades = buildSampleTrades({ idPrefix: 'screenshot-', tags: ['a'], rules: ['r'] });
    expect(trades.every(t => t.id.startsWith('screenshot-'))).toBe(true);
  });

  it('date に時刻が入っている（時間帯分析が date.slice(11,13) を読むため）', () => {
    const trades = buildSampleTrades({ idPrefix: 'sample-', tags: ['a'], rules: ['r'] });
    for (const t of trades) expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});

describe('削除SQLの形（ソースを直接見る）', () => {
  // 説明コメントにも `DELETE FROM trades` と書いてあるので、まずコメントを落とす。
  const SRC = readFileSync(join(__dirname, '..', 'sampleData.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('条件なしの DELETE FROM trades を書いていない', () => {
    // `seedScreenshotData()` は全消しするが、あれは撮影モード専用。こちらは本番経路。
    // 一度でも条件が外れたら、見本を消すつもりでユーザーの記録が消える。
    const deletes = SRC.match(/DELETE\s+FROM\s+trades[^']*/gi) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) expect(d).toMatch(/WHERE/i);
  });

  it('execAsync を使っていない（パラメータを渡せず条件が文字列結合になるため）', () => {
    expect(SRC).not.toContain('execAsync');
  });
});

describe('バナーの設置', () => {
  // 見本データを入れる目的は「価値が見える画面を一度見せる」こと。その3画面は
  // そのまま「自分の成績だと誤解されうる画面」でもある。どれか1つでもバナーが
  // 抜けると、月次や分析の数字を自分のものとして読む余地が残る。
  const ROOT = join(__dirname, '..', '..', '..');
  const SCREENS = ['app/(tabs)/index.tsx', 'app/(tabs)/monthly.tsx', 'app/(tabs)/stats.tsx'];

  it.each(SCREENS)('%s が SampleDataBanner を描いている', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).toContain('<SampleDataBanner />');
    expect(src).toContain("from '../../src/components/SampleDataBanner'");
  });

  it('オンボーディングの「見てみる」経路が見本データを入れる', () => {
    const src = readFileSync(join(ROOT, 'app', 'onboarding.tsx'), 'utf8');
    const handler = src.match(/const handleChooseBrowse[\s\S]*?\n  \};/)![0];
    expect(handler).toContain('useSampleDataStore');
    // 経路を分けておかないと、見本の効果を他の選択肢と比べられない
    expect(handler).toContain("completeOnboarding('sample')");
  });
});

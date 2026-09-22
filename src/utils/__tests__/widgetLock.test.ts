/**
 * アプリロック中のウィジェットの扱いを固定する。
 *
 * **なぜ要るか。** 2026-09-06 に「ロック中はウィジェットに実データを書かない」を
 * 入れたが、**見出しは「今月」のままで値だけが `-` になる**作りだった。
 * その結果ウィジェットは「今月 / - / -」と表示され、**開発者本人が実機で見て
 * 不具合だと判断した**（2026-09-23）。意図どおりの挙動でも、理由が画面に
 * 出ていなければ利用者には不具合である。
 *
 * いまは見出しを「アプリロック中」にし、`widget_while_locked` を立てた人には
 * 従来どおり出す。既定は安全側（出さない）。
 *
 * ロックしていても出してよい、という判断は利用者のもの。ただし**既定を
 * 反転させないこと** — ウィジェットはロック画面に置けるうえ、ホーム画面用の
 * 小・中サイズもロック画面から右スワイプで開く Today View に出るため、
 * 「ホーム画面用だけ出す」では安全にならない。
 */
const mockSet = jest.fn();
const mockReload = jest.fn();
jest.mock('@bacons/apple-targets', () => ({
  ExtensionStorage: Object.assign(
    function () { return { set: mockSet }; },
    { reloadWidget: mockReload },
  ),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@sentry/react-native', () => ({ captureMessage: jest.fn() }));
jest.mock('../../i18n', () => ({ t: (k: string) => k }));
jest.mock('../../db/queries', () => ({
  getSetting: jest.fn(),
  getTradesByMonth: jest.fn(async () => []),
  getRecordStreak: jest.fn(async () => 0),
}));
jest.mock('../statsCalc', () => ({
  calcStats: () => ({ totalTrades: 3, wins: 2, losses: 1, winRate: 66.7, totalPips: 12.3, profitFactor: 2 }),
}));

import { syncWidgetData } from '../widgetSync';

const q = jest.requireMock('../../db/queries') as { getSetting: jest.Mock };

/** 設定の読み出しをキー単位で差し替える。 */
function settings(map: Record<string, string>) {
  q.getSetting.mockImplementation(async (k: string) => map[k] ?? null);
}

/** ネイティブモジュールがリンクされている状態にする（未リンクだと即 return する）。 */
beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as unknown as { expo: unknown }).expo = { modules: { ExtensionStorage: {} } };
});

const written = () => mockSet.mock.calls[0]?.[1];

describe('アプリロック中のウィジェット', () => {
  it('ロック中は成績を書かない（既定）', async () => {
    settings({ app_lock_enabled: '1' });
    await syncWidgetData();
    expect(written()).toMatchObject({ hasData: 0, winRate: '-', totalPips: '-' });
  });

  it('ロック中は見出しで理由を伝える（黙って空にしない）', async () => {
    settings({ app_lock_enabled: '1' });
    await syncWidgetData();
    // 「今月」のままだと故障に見える。ここが戻ったら落とす。
    expect(written().title).toBe('widget_locked_title');
  });

  it('本人が許可していればロック中でも成績を出す', async () => {
    settings({ app_lock_enabled: '1', widget_while_locked: '1' });
    await syncWidgetData();
    expect(written()).toMatchObject({ hasData: 1, winRate: '66.7%' });
    expect(written().title).toBe('this_month');
  });

  it('ロックしていなければ従来どおり出す', async () => {
    settings({});
    await syncWidgetData();
    expect(written()).toMatchObject({ hasData: 1, winRate: '66.7%' });
  });

  it('設定が読めなくても成績は出す（ウィジェットが壊れるほうが困る）', async () => {
    q.getSetting.mockRejectedValue(new Error('db closed'));
    await syncWidgetData();
    expect(written()).toMatchObject({ hasData: 1 });
  });

  it('ネイティブモジュールが未リンクなら何も書かない', async () => {
    (globalThis as unknown as { expo: unknown }).expo = { modules: {} };
    settings({});
    await syncWidgetData();
    expect(mockSet).not.toHaveBeenCalled();
  });
});

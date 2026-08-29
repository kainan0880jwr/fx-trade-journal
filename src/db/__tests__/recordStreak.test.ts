import { resolveStreak } from '../queries';

jest.mock('../database', () => ({ getDatabase: jest.fn(), SCHEMA_MIGRATIONS: [] }));

const TODAY = '2026-08-29';
const YESTERDAY = '2026-08-28';

describe('resolveStreak', () => {
  it('今日記録済みならそのまま返す', () => {
    expect(resolveStreak('10', TODAY, TODAY, YESTERDAY)).toBe(10);
  });

  it('昨日が最後なら継続中とみなす（今日まだ記録していない状態）', () => {
    expect(resolveStreak('10', YESTERDAY, TODAY, YESTERDAY)).toBe(10);
  });

  it('最後の記録が1週間前なら0に戻す', () => {
    // 回帰: 以前は保存値をそのまま返していたため、記録が途切れても
    // ホーム・ウィジェット・シェアカード・通知が「10日連続」と出し続けていた
    expect(resolveStreak('10', '2026-08-22', TODAY, YESTERDAY)).toBe(0);
  });

  it('記録日が無ければ0', () => {
    expect(resolveStreak('10', null, TODAY, YESTERDAY)).toBe(0);
    expect(resolveStreak('10', undefined, TODAY, YESTERDAY)).toBe(0);
  });

  it('保存値が0・負・不正なら0', () => {
    expect(resolveStreak('0', TODAY, TODAY, YESTERDAY)).toBe(0);
    expect(resolveStreak('-3', TODAY, TODAY, YESTERDAY)).toBe(0);
    expect(resolveStreak('abc', TODAY, TODAY, YESTERDAY)).toBe(0);
    expect(resolveStreak(null, TODAY, TODAY, YESTERDAY)).toBe(0);
  });
});

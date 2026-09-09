import { nextMilestone, MILESTONES } from '../useReviewPrompt';

/**
 * レビュー促進の発火条件。
 *
 * 以前は `MILESTONES.find(m => count === m)` と完全一致で判定しており、
 * **MT4/MT5のCSVを一括インポートしたユーザーには一度も出なかった**
 * （件数が 0 → 47 のように飛び、10・30・100 のどれも踏まないため）。
 * このアプリで最もアクティブな層がまるごと対象外になっていた。
 * レビュー件数はASOのランキング要因なので、集客の問題でもある。
 */
describe('nextMilestone', () => {
  it('マイルストーン未満では出さない', () => {
    for (const c of [0, 1, 9]) expect(nextMilestone(c, 0)).toBeNull();
  });

  it('ちょうど到達したら出す', () => {
    expect(nextMilestone(10, 0)).toBe(10);
    expect(nextMilestone(30, 10)).toBe(30);
    expect(nextMilestone(100, 30)).toBe(100);
  });

  it('CSVインポートで飛び越しても出す（これが直したかった不具合）', () => {
    // 47件を一括で取り込んだ直後に1件手入力した、という典型ケース。
    expect(nextMilestone(48, 0)).toBe(30);
    // 一気に100件超を取り込んだ場合は最大のマイルストーンで出す。
    expect(nextMilestone(250, 0)).toBe(100);
  });

  it('同じマイルストーンでは二度出さない（「あとで」を押した後）', () => {
    expect(nextMilestone(12, 10)).toBeNull();
    expect(nextMilestone(29, 10)).toBeNull();
    // 次の段階に達したら再び出す
    expect(nextMilestone(30, 10)).toBe(30);
  });

  it('最大マイルストーンを過ぎたら二度と出さない', () => {
    expect(nextMilestone(101, 100)).toBeNull();
    expect(nextMilestone(9999, 100)).toBeNull();
  });

  it('マイルストーンは昇順（pop で最大を取る前提）', () => {
    expect([...MILESTONES].sort((a, b) => a - b)).toEqual(MILESTONES);
  });
});

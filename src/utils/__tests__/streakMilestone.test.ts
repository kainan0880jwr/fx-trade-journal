import { isStreakMilestone } from '../streakMilestone';

describe('isStreakMilestone', () => {
  it('節目の日数で true', () => {
    for (const n of [3, 7, 14, 30, 60, 100, 200, 365]) {
      expect(isStreakMilestone(n)).toBe(true);
    }
  });

  it('節目でない日数は false（毎日ダイアログを出さないため）', () => {
    for (const n of [2, 4, 5, 8, 15, 29, 31, 99, 101, 364, 366]) {
      expect(isStreakMilestone(n)).toBe(false);
    }
  });

  it('1日目以下は false（初回は呼び出し側が別扱いする）', () => {
    expect(isStreakMilestone(0)).toBe(false);
    expect(isStreakMilestone(1)).toBe(false);
    expect(isStreakMilestone(-1)).toBe(false);
  });

  it('365日を超えたら100日ごと', () => {
    expect(isStreakMilestone(400)).toBe(true);
    expect(isStreakMilestone(500)).toBe(true);
    expect(isStreakMilestone(450)).toBe(false);
  });

  it('不正な値でも落ちない', () => {
    expect(isStreakMilestone(NaN)).toBe(false);
    expect(isStreakMilestone(Infinity)).toBe(false);
  });
});

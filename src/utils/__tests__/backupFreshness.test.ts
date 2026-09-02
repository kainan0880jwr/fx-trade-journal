import { backupFreshness, BACKUP_STALE_DAYS } from '../backup';

const NOW = new Date('2026-09-02T12:00:00Z');
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('backupFreshness', () => {
  it('未記録なら never', () => {
    expect(backupFreshness(null, NOW)).toEqual({ state: 'never' });
    expect(backupFreshness(undefined, NOW)).toEqual({ state: 'never' });
    expect(backupFreshness('', NOW)).toEqual({ state: 'never' });
  });

  it('壊れた値は never に倒す（実際より安全に見せない）', () => {
    expect(backupFreshness('not-a-date', NOW)).toEqual({ state: 'never' });
  });

  it('直近のバックアップは ok', () => {
    const r = backupFreshness(daysBefore(0), NOW);
    expect(r).toMatchObject({ state: 'ok', days: 0 });
  });

  it('しきい値ちょうどまでは ok', () => {
    expect(backupFreshness(daysBefore(BACKUP_STALE_DAYS), NOW)).toMatchObject({
      state: 'ok', days: BACKUP_STALE_DAYS,
    });
  });

  it('しきい値を超えたら stale', () => {
    expect(backupFreshness(daysBefore(BACKUP_STALE_DAYS + 1), NOW)).toMatchObject({
      state: 'stale', days: BACKUP_STALE_DAYS + 1,
    });
  });

  it('端末の時計が戻されて未来日付でも経過日数を負にしない', () => {
    const r = backupFreshness(daysBefore(-30), NOW);
    expect(r).toMatchObject({ state: 'ok', days: 0 });
  });
});

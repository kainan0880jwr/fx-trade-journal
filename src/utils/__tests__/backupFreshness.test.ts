import { backupFreshness, BACKUP_STALE_DAYS, canIncludeImage, MAX_IMAGE_BASE64_TOTAL_BYTES } from '../backup';

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

describe('canIncludeImage', () => {
  it('上限ちょうどまでは積める', () => {
    expect(canIncludeImage(0, MAX_IMAGE_BASE64_TOTAL_BYTES)).toBe(true);
    expect(canIncludeImage(MAX_IMAGE_BASE64_TOTAL_BYTES - 10, 10)).toBe(true);
  });

  it('1バイトでも超えたら積まない', () => {
    // ここで true を返すと、インポート側の `> 上限` に引っかかって
    // ファイルごと復元不能になる。エクスポートとインポートの境界は必ず一致させる。
    expect(canIncludeImage(MAX_IMAGE_BASE64_TOTAL_BYTES - 10, 11)).toBe(false);
    expect(canIncludeImage(MAX_IMAGE_BASE64_TOTAL_BYTES, 1)).toBe(false);
  });

  it('空の画像は常に積める', () => {
    expect(canIncludeImage(MAX_IMAGE_BASE64_TOTAL_BYTES, 0)).toBe(true);
  });
});

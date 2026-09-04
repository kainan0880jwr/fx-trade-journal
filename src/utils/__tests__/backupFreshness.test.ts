import {
  backupFreshness, BACKUP_STALE_DAYS, canIncludeImage, planImageInclusion, base64Length,
  MAX_IMAGE_BASE64_TOTAL_BYTES, MAX_EXPORT_IMAGE_BASE64_BYTES,
} from '../backup';

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
    expect(canIncludeImage(0, MAX_EXPORT_IMAGE_BASE64_BYTES)).toBe(true);
    expect(canIncludeImage(MAX_EXPORT_IMAGE_BASE64_BYTES - 10, 10)).toBe(true);
  });

  it('1バイトでも超えたら積まない', () => {
    // ここで true を返すと、インポート側の `> 上限` に引っかかって
    // ファイルごと復元不能になる。エクスポートとインポートの境界は必ず一致させる。
    expect(canIncludeImage(MAX_EXPORT_IMAGE_BASE64_BYTES - 10, 11)).toBe(false);
    expect(canIncludeImage(MAX_EXPORT_IMAGE_BASE64_BYTES, 1)).toBe(false);
  });

  it('空の画像は常に積める', () => {
    expect(canIncludeImage(MAX_EXPORT_IMAGE_BASE64_BYTES, 0)).toBe(true);
  });
});


describe('planImageInclusion', () => {
  const CAP = MAX_EXPORT_IMAGE_BASE64_BYTES;

  it('全部収まるならすべて含める', () => {
    expect(planImageInclusion([100, 200, 300])).toEqual({ included: 3, omitted: 0, base64Bytes: 600 });
  });

  it('上限を超えた分だけ落とす', () => {
    const r = planImageInclusion([CAP, 10]);
    expect(r).toEqual({ included: 1, omitted: 1, base64Bytes: CAP });
  });

  it('大きい画像を飛ばしても、後ろの小さい画像は入る', () => {
    // 打ち切らずに次へ進むので、巨大な1枚のせいで以降が全滅することはない。
    const r = planImageInclusion([CAP - 5, CAP, 5]);
    expect(r).toEqual({ included: 2, omitted: 1, base64Bytes: CAP });
  });

  it('画像が無ければ何も起きない', () => {
    expect(planImageInclusion([])).toEqual({ included: 0, omitted: 0, base64Bytes: 0 });
  });

  it('エクスポートの上限はインポートの上限を超えない', () => {
    // 超えると「作れるのに復元できないバックアップ」が復活する。
    expect(MAX_EXPORT_IMAGE_BASE64_BYTES).toBeLessThanOrEqual(MAX_IMAGE_BASE64_TOTAL_BYTES);
  });
});


describe('base64Length', () => {
  it('base64の実際の長さと一致する', () => {
    // 見積もりと実書き出しでこの式が食い違うと「約N枚入ります」が嘘になる。
    // Buffer で実際にエンコードして突き合わせる。
    for (const n of [0, 1, 2, 3, 4, 5, 6, 100, 1023, 1024, 65537]) {
      const actual = Buffer.alloc(n).toString('base64').length;
      expect(base64Length(n)).toBe(actual);
    }
  });

  it('n * 4/3 では実長より短くなる（これが以前のズレの原因）', () => {
    const n = 4;
    expect(Math.ceil((n * 4) / 3)).toBe(6);      // 旧: 楽観側に外れる
    expect(base64Length(n)).toBe(8);             // 新: 実長と一致
    expect(Buffer.alloc(n).toString('base64').length).toBe(8);
  });

  it('見積もりで積める枚数は、実測値で積んだ場合と一致する', () => {
    // estimateBackupImages と exportBackup が同じ判定になることの土台。
    // 実長どおりに見積もっていれば、両者の included は必ず一致する。
    const rawSizes = [10, 3_000_000, 1, 40_000_000, 25_000_000, 7];
    const estimated = planImageInclusion(rawSizes.map(base64Length));
    const measured = planImageInclusion(
      rawSizes.map((n) => Buffer.alloc(n).toString('base64').length)
    );
    expect(estimated).toEqual(measured);
  });
});

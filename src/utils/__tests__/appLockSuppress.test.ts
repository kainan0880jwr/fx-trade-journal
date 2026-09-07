import { isAppLockSuppressed, withoutAppLock } from '../appLockSuppress';

/**
 * 抑止が解除し損ねると、以後アプリを離れてもロックが掛からなくなる。
 * 生体認証を有効にしている人の期待を静かに裏切るので、ここは厳密に固定する。
 */
jest.useFakeTimers();

const settle = async () => {
  // finally の setTimeout を消化する
  jest.advanceTimersByTime(1100);
  await Promise.resolve();
};

describe('withoutAppLock', () => {
  afterEach(async () => { await settle(); });

  it('通常は抑止されていない', () => {
    expect(isAppLockSuppressed()).toBe(false);
  });

  it('実行中は抑止される', async () => {
    let during = false;
    const p = withoutAppLock(async () => { during = isAppLockSuppressed(); });
    await p;
    expect(during).toBe(true);
  });

  it('完了後、少し経てば解除される', async () => {
    await withoutAppLock(async () => {});
    // 復帰直後の AppState 変化を拾うため、しばらくは抑止が残る
    expect(isAppLockSuppressed()).toBe(true);
    await settle();
    expect(isAppLockSuppressed()).toBe(false);
  });

  it('例外が出ても解除される', async () => {
    await expect(withoutAppLock(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await settle();
    expect(isAppLockSuppressed()).toBe(false);
  });

  it('入れ子でも、すべて終わるまで解除されない', async () => {
    await withoutAppLock(async () => {
      await withoutAppLock(async () => {});
      // 内側が終わっても外側が残っている
      expect(isAppLockSuppressed()).toBe(true);
    });
    await settle();
    expect(isAppLockSuppressed()).toBe(false);
  });

  it('戻り値をそのまま返す', async () => {
    await expect(withoutAppLock(async () => 42)).resolves.toBe(42);
  });
});

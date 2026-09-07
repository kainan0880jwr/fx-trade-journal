/**
 * アプリロックの再ロックを一時的に抑止する。
 *
 * 写真ピッカー・ファイル選択・共有シートは、いずれもOSの別画面を開くため
 * アプリが 'background' になる。復帰時に AppLockGate がこれを「アプリを離れた」と
 * 判断して再ロックすると、**写真を選んだ瞬間に認証を求められ、入力途中の記録が
 * 巻き戻る**という体験になる。ユーザーはアプリを離れていないので、ここでの
 * 再ロックは誤検知でしかない。
 *
 * 呼ぶ側は必ず finally で解除すること。解除し損ねると、以後アプリを離れても
 * ロックが掛からなくなる（セキュリティ上の穴になる）。
 */
let suppressed = 0;

export function isAppLockSuppressed(): boolean {
  return suppressed > 0;
}

/** OSの画面を開く処理を包む。ネストしても正しく数えられるようカウンタで持つ。 */
export async function withoutAppLock<T>(fn: () => Promise<T>): Promise<T> {
  suppressed++;
  try {
    return await fn();
  } finally {
    // 復帰直後の AppState 変化を拾い終えるまで少しだけ残す。'active' が届く前に
    // 解除すると、結局その1回の再ロックを止められない。
    setTimeout(() => {
      suppressed = Math.max(0, suppressed - 1);
    }, 1000);
  }
}

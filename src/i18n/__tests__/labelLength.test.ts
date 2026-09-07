import { ja } from '../ja';
import { en } from '../en';
import { de } from '../de';
import { fr } from '../fr';
import { es } from '../es';
import { it as itIT } from '../it';
import { id as idID } from '../id';
import { tr } from '../tr';
import { hi } from '../hi';
import { vi } from '../vi';
import { pt } from '../pt';

/**
 * 狭い固定幅の枠に入るラベルが、翻訳で極端に長くなっていないかを見る。
 *
 * 固定幅の箱にラベルを入れている箇所がいくつかあり、ドイツ語の Wochenchart や
 * VERKAUF、スペイン語の COMPRA が Dynamic Type 以前に既に収まっていなかった。
 * 該当箇所は minWidth に変えたが、**翻訳が増えるたびに同じことが起きる**ので、
 * 想定を超える長さになったら気づけるようにしておく。
 *
 * ここで落ちたら、訳を短くするか、その枠の幅の扱いを見直すこと。
 */
const ALL = { ja, en, de, fr, es, it: itIT, id: idID, tr, hi, vi, pt } as const;

// キー → 目安の上限文字数。狭い枠に入るものだけを挙げる。
const LIMITS: Record<string, number> = {
  buy: 10,
  sell: 10,
  tf_weekly: 14,
  tf_daily: 14,
  tf_4h: 10,
  tf_1h: 10,
};

describe('狭い枠に入るラベルの長さ', () => {
  describe.each(Object.entries(ALL))('%s', (_lang, dict) => {
    const d = dict as unknown as Record<string, string>;
    it.each(Object.entries(LIMITS))('%s が %d 文字以内', (key, limit) => {
      expect(typeof d[key]).toBe('string');
      expect(d[key].length).toBeLessThanOrEqual(limit);
    });
  });
});

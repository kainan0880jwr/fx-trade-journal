import { BADGE_DEFS } from '../badges';
import { lightColors, darkColors } from '../../theme/colors';

/**
 * バッジの色がテーマトークンで指定されていることを固定する。
 *
 * 以前は #FBBF24 / #34D399 のようなダーク前提の固定色を33箇所に直書きしており、
 * ライトモードの白カード上で 1.67〜3.31:1 しか無かった。達成ラベルの**文字色**にも
 * 使っているため、バッジ画面はライトモードで実質読めない状態だった。
 * テーマ外のファイルなので contrast.test.ts の射程からも外れていた。
 */
const ALLOWED = ['primary', 'win', 'loss', 'yellow', 'purple'] as const;

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminance = (rgb: RGB) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('バッジの色', () => {
  it('固定の hex が直書きされていない', () => {
    for (const b of BADGE_DEFS) {
      expect(b.color).not.toMatch(/^#/);
      expect(ALLOWED).toContain(b.color);
    }
  });

  describe.each([['ライト', lightColors], ['ダーク', darkColors]] as const)(
    '%s テーマ',
    (_name, palette) => {
      const C = palette as unknown as Record<string, string>;
      it.each(ALLOWED)('%s がカード面で AA を満たす', (token) => {
        // 達成ラベルの文字色に使うので、大きい文字の 3:1 ではなく 4.5:1 が要る。
        expect(contrast(toRgb(C[token]), toRgb(C.card))).toBeGreaterThanOrEqual(4.5);
      });
    }
  );
});

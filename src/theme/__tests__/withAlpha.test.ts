import { withAlpha } from '../withAlpha';
import { lightColors, darkColors } from '../colors';

describe('withAlpha', () => {
  it('16進カラーを rgba に変換する', () => {
    expect(withAlpha('#2F62E6', 1)).toBe('rgba(47,98,230,1)');
    expect(withAlpha('#000000', 0.5)).toBe('rgba(0,0,0,0.5)');
    expect(withAlpha('#FFFFFF', 0)).toBe('rgba(255,255,255,0)');
  });

  it('不透明度を 0〜1 に収める', () => {
    expect(withAlpha('#2F62E6', 2)).toBe('rgba(47,98,230,1)');
    expect(withAlpha('#2F62E6', -1)).toBe('rgba(47,98,230,0)');
  });

  it('rgba トークンを渡したら投げる（無言で壊れた色を作らない）', () => {
    // primaryGlow / winBg / overlay は rgba 文字列なので渡せない。
    expect(() => withAlpha(lightColors.winBg, 1)).toThrow();
    expect(() => withAlpha(darkColors.overlay, 1)).toThrow();
  });

  it('チャートで使うトークンはすべて変換できる', () => {
    for (const pal of [lightColors, darkColors]) {
      const C = pal as unknown as Record<string, string>;
      for (const token of ['primary', 'winLarge', 'lossLarge']) {
        expect(() => withAlpha(C[token], 0.8)).not.toThrow();
      }
    }
  });
});

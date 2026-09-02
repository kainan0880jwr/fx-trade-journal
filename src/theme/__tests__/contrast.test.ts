import { darkColors, lightColors } from '../colors';

/**
 * テーマ色のコントラスト比が WCAG 2.1 の AA 基準（通常サイズの文字で 4.5:1）を
 * 満たしていることを固定する。
 *
 * 2026-09-02 以前、ライトモードは text3 が 2.56:1、win が 2.76:1、yellow が 3.07:1 と、
 * 大きい文字やアイコンに許される 3:1 すら下回っていた。プレースホルダ・表ヘッダー・
 * 損益の数字など、アプリの中心的な情報がまとめて読みにくい状態だった。
 *
 * 色は「少し明るくしたい」という理由で簡単に戻される。戻したら落ちるようにしておく。
 */

type RGB = [number, number, number];

function parse(color: string): { rgb: RGB; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(color);
  if (rgba) {
    return { rgb: [+rgba[1], +rgba[2], +rgba[3]], alpha: +rgba[4] };
  }
  throw new Error(`解釈できない色: ${color}`);
}

/** 半透明の色を下地に合成する。ティントの上に載る文字を正しく評価するために要る。 */
function composite(fg: string, bg: string): RGB {
  const f = parse(fg);
  const b = parse(bg);
  return f.rgb.map((v, i) => Math.round(f.alpha * v + (1 - f.alpha) * b.rgb[i])) as RGB;
}

function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;
const SURFACES = ['bg', 'card', 'cardAlt'] as const;
// 文字として使われる色。装飾専用（primaryLight / primaryDark / primaryGlow など）は含めない。
const TEXT_COLORS = [
  'text', 'text2', 'text3', 'primary', 'win', 'loss', 'even', 'yellow', 'purple', 'cyan', 'buy', 'sell',
] as const;
// 同系色のティントを背景に敷いた上へ同じ色の文字を載せている組み合わせ（TradeCard のチップなど）。
const TINTED: [string, string][] = [
  ['win', 'winBg'], ['loss', 'lossBg'], ['even', 'evenBg'],
  ['yellow', 'yellowBg'], ['purple', 'purpleBg'], ['cyan', 'cyanBg'],
];

// アクセント色でベタ塗りした面（ボタン・バッジ・FAB など）。この上には onAccent を載せる。
const ACCENT_FILLS = ['primary', 'win', 'loss', 'even', 'buy', 'sell'] as const;
// paywall の CTA はこの3色のグラデーション。どのストップの上にも onAccent が載る。
const ACCENT_GRADIENT = ['primaryLight', 'primary', 'primaryDark'] as const;

describe.each([['ライト', lightColors], ['ダーク', darkColors]] as const)('%s テーマ', (_name, palette) => {
  const C = palette as unknown as Record<string, string>;

  describe.each(SURFACES)('%s の上', (surface) => {
    it.each(TEXT_COLORS)('%s が AA を満たす', (token) => {
      const ratio = contrast(parse(C[token]).rgb, parse(C[surface]).rgb);
      expect(ratio).toBeGreaterThanOrEqual(AA);
    });

    it.each(TINTED)('%s が %s の上でも AA を満たす', (fg, tint) => {
      const ratio = contrast(parse(C[fg]).rgb, composite(C[tint], C[surface]));
      expect(ratio).toBeGreaterThanOrEqual(AA);
    });
  });

  // ダークのアクセントは明るく、ライトのアクセントは濃い。前景を白に固定すると
  // ダークで 3.71:1（primary）まで落ちるため、テーマごとに onAccent を切り替えている。
  describe.each(ACCENT_FILLS)('%s のベタ塗り', (fill) => {
    it('onAccent が AA を満たす', () => {
      const ratio = contrast(parse(C.onAccent).rgb, parse(C[fill]).rgb);
      expect(ratio).toBeGreaterThanOrEqual(AA);
    });
  });

  // グラデーションは端まで含めて成立していないと意味がない。片方の端だけ
  // 条件を外れると、そこに重なった文字だけが読めなくなる。
  describe.each(ACCENT_GRADIENT)('CTAグラデーションの %s ストップ', (stop) => {
    it('onAccent が AA を満たす', () => {
      const ratio = contrast(parse(C.onAccent).rgb, parse(C[stop]).rgb);
      expect(ratio).toBeGreaterThanOrEqual(AA);
    });
  });
});

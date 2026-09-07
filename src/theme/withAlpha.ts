/**
 * テーマの16進カラーを、指定の不透明度の `rgba()` 文字列にする。
 *
 * react-native-chart-kit は色を `(opacity) => string` の形で要求するため、
 * テーマトークンをそのまま渡せない。ここを経由せずに rgba を直書きすると、
 * **どちらのパレットにも存在しない色**がチャートに焼き付く。実際に
 * `rgba(52,211,153,…)`（= #34D399。ライト・ダークどちらのパレットにも無い）が
 * 累積pipsと資産推移のチャートに直書きされており、ライトのカード上で 1.92:1 だった。
 *
 * `primaryGlow` / `winBg` / `overlay` のような **rgba 文字列のトークンは渡せない**。
 * 6桁の16進トークンだけを渡すこと。
 */
export function withAlpha(hex: string, opacity: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) {
    // 開発中に rgba トークンを渡した場合、無言で壊れた色文字列を作らない。
    throw new Error(`withAlpha expects a 6-digit hex color, got: ${hex}`);
  }
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const a = Math.min(1, Math.max(0, opacity));
  return `rgba(${r},${g},${b},${a})`;
}

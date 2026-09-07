export const darkColors = {
  bg: '#080B14',
  card: '#0F1221',
  cardAlt: '#141829',
  cardGlass: 'rgba(15,18,33,0.90)',
  border: '#1C203A',
  borderLight: '#252B4A',

  primary: '#4F7EF7',
  primaryLight: '#7BA3FF',
  // paywall の CTA はこの3色のグラデーション。onAccent(#080B14) が全ストップで
  // 4.5:1 を満たすよう、暗い側の端を引き上げてある（#2D5CE0 だと 3.48:1）。
  primaryDark: '#4972E4',
  primaryGlow: 'rgba(79,126,247,0.18)',

  win: '#2DD4A0',
  winBg: 'rgba(45,212,160,0.12)',
  loss: '#F47171',
  lossBg: 'rgba(244,113,113,0.12)',
  even: '#7C8DB5',
  evenBg: 'rgba(124,141,181,0.10)',

  // ダークは win/loss の相互比が 1.48 あり既に判別できるので、大きい数字用も同値。
  // トークンを用意しておくのは、画面側が明暗どちらでも同じ名前を参照できるようにするため。
  winLarge: '#2DD4A0',
  lossLarge: '#F47171',

  buy: '#2DD4A0',
  sell: '#F47171',

  // アクセント色のベタ塗り（ボタン・バッジ等）の上に載せる前景色。
  // ダークのアクセントは明るいので、白を載せるとコントラストが足りない
  // （白 on primary は 3.71:1）。濃い色を載せて 4.5:1 以上を確保する。
  onAccent: '#080B14',

  text: '#E8ECFF',
  text2: '#7C8DB5',
  text3: '#7580A3',

  yellow: '#F5BE4A',
  yellowBg: 'rgba(245,190,74,0.12)',
  purple: '#9D7BF5',
  purpleBg: 'rgba(157,123,245,0.12)',
  cyan: '#38BDF8',
  cyanBg: 'rgba(56,189,248,0.10)',

  tabBg: '#060910',
  overlay: 'rgba(0,0,0,0.78)',
} as const;

export const lightColors = {
  bg: '#F2F4FC',
  card: '#FFFFFF',
  cardAlt: '#EBEEf8',
  cardGlass: 'rgba(255,255,255,0.90)',
  border: '#DDE2F4',
  borderLight: '#C8CEE8',

  primary: '#2F62E6',
  // paywall の CTA グラデーションの明るい側の端。白文字で 4.5:1 を満たすまで
  // 濃くしてある（#6290F5 だと 3.08:1）。
  primaryLight: '#336EF2',
  primaryDark: '#2652C8',
  primaryGlow: 'rgba(62,110,232,0.12)',

  win: '#0F7455',
  winBg: 'rgba(22,168,122,0.10)',
  loss: '#BC2D2D',
  lossBg: 'rgba(212,74,74,0.10)',
  even: '#536598',
  evenBg: 'rgba(107,124,173,0.08)',


  // 大きい数字（損益・pips 等の 18.66px 以上の太字）専用。WCAG では大きい文字の
  // 基準が 3:1 なので、その範囲で **win と loss の輝度をわざと離してある**。
  //
  // 本文用の win/loss は 4.5:1 を満たすまで濃くした結果、両者の輝度がほぼ同じ
  // （相互比 1.03、グレースケールで 34 対 33）になり、**符号を持たない図形**
  // ——円グラフ・年間バー・ヒートマップ——で勝敗が判別できなくなっていた。
  // 数字は formatPips / formatMoney が必ず +/- を付けるので救われるが、図形は救われない。
  // ここは相互比 1.28 を確保している。**小さい文字には使わないこと**（4.5:1 に届かない）。
  winLarge: '#0E9269',
  lossLarge: '#CF3232',

  buy: '#0F7455',
  sell: '#BC2D2D',

  // アクセント色のベタ塗りの上に載せる前景色。ライトのアクセントは濃いので白でよい。
  onAccent: '#FFFFFF',

  text: '#111827',
  text2: '#434F6F',
  text3: '#566B9F',

  yellow: '#8F5A00',
  yellowBg: 'rgba(196,124,0,0.10)',
  purple: '#6F47D0',
  purpleBg: 'rgba(112,72,208,0.10)',
  cyan: '#0B6D9C',
  cyanBg: 'rgba(14,134,192,0.08)',

  // tabBg はタブバーの選択ラベル（10px）が載る面なので、cardAlt と同等以上に
  // 明るく保つこと。#EAEDFA だと primary が 4.49:1 で AA をわずかに割っていた。
  tabBg: '#ECEFFA',
  overlay: 'rgba(0,0,0,0.60)',
} as const;

// darkColors のキー構造を保ちつつ値は string に緩める
// → lightColors も assignable になり useTheme の TS エラーが解消される
export type ThemeColors = { [K in keyof typeof darkColors]: string };

// 後方互換エイリアス（useTheme() に移行後は不要）
export const C = darkColors;

export const darkColors = {
  bg: '#080B14',
  card: '#0F1221',
  cardAlt: '#141829',
  cardGlass: 'rgba(15,18,33,0.90)',
  border: '#1C203A',
  borderLight: '#252B4A',

  primary: '#4F7EF7',
  primaryLight: '#7BA3FF',
  primaryDark: '#2D5CE0',
  primaryGlow: 'rgba(79,126,247,0.18)',

  win: '#2DD4A0',
  winBg: 'rgba(45,212,160,0.12)',
  loss: '#F47171',
  lossBg: 'rgba(244,113,113,0.12)',
  even: '#7C8DB5',
  evenBg: 'rgba(124,141,181,0.10)',

  buy: '#2DD4A0',
  sell: '#F47171',

  text: '#E8ECFF',
  text2: '#7C8DB5',
  text3: '#6E7A9F',

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

  primary: '#3E6EE8',
  primaryLight: '#6290F5',
  primaryDark: '#2652C8',
  primaryGlow: 'rgba(62,110,232,0.12)',

  win: '#16A87A',
  winBg: 'rgba(22,168,122,0.10)',
  loss: '#D44A4A',
  lossBg: 'rgba(212,74,74,0.10)',
  even: '#6B7CAD',
  evenBg: 'rgba(107,124,173,0.08)',

  buy: '#16A87A',
  sell: '#D44A4A',

  text: '#111827',
  text2: '#5A6A96',
  text3: '#8A9AC0',

  yellow: '#C47C00',
  yellowBg: 'rgba(196,124,0,0.10)',
  purple: '#7048D0',
  purpleBg: 'rgba(112,72,208,0.10)',
  cyan: '#0E86C0',
  cyanBg: 'rgba(14,134,192,0.08)',

  tabBg: '#EAEDFA',
  overlay: 'rgba(0,0,0,0.60)',
} as const;

// darkColors のキー構造を保ちつつ値は string に緩める
// → lightColors も assignable になり useTheme の TS エラーが解消される
export type ThemeColors = { [K in keyof typeof darkColors]: string };

// 後方互換エイリアス（useTheme() に移行後は不要）
export const C = darkColors;

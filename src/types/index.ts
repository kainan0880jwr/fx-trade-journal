export type Direction = 'buy' | 'sell';
export type TradeResult = 'win' | 'loss' | 'even';
export type TradeStyle = 'scalping' | 'day' | 'swing' | 'other';

export interface Trade {
  id: string;
  date: string;
  pair: string;
  direction: Direction;
  entryRate: number | null;
  exitRate: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  plannedRR: number | null;
  lotSize: number;
  entryMethod: 'full' | 'quick';
  style: TradeStyle;
  tags: string[];
  imageUris: string[];
  pips: number | null;
  profitLoss: number | null;
  result: TradeResult;
  reflection: string;
  selfRating: number;
  bookmarked: boolean;
  // メンタル管理
  mentalFocus: number | null;
  mentalCalm: number | null;
  mentalFear: number | null;
  ruleChecks: string[];
  // マルチタイムフレームメモ（新機能）
  tfWeekly: string;
  tfDaily: string;
  tf4h: string;
  tf1h: string;
  createdAt: string;
}

export interface CurrencyPair {
  id: string;
  name: string;
  pipDigits: number;
  isYenPair: boolean;
  isActive: boolean;
}

export interface AppSettings {
  lotUnit: number;
  defaultStyle: string;
  accountBalance: number;
  defaultRiskPct: number;
  monthlyPipsGoal: number;      // 月次pips目標
  monthlyWinRateGoal: number;   // 月次勝率目標（%）
  themeMode: 'dark' | 'light' | 'system';
  appLockEnabled: boolean;      // 生体認証によるアプリロック
}

export interface ReflectionTemplate {
  id: string;
  label: string;
  count: number;
}

export interface DailyStats {
  date: string;
  totalTrades: number;
  wins: number;
  losses: number;
  evens: number;
  winRate: number;
  totalPips: number;
  totalProfitLoss: number;
  profitFactor: number;
}

export interface MonthlyStats extends DailyStats {
  month: string;
}

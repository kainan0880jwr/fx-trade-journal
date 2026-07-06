import { create } from 'zustand';
import type { Trade } from '../types';
import {
  insertTrade, updateTrade, deleteTrade,
  getTradesByMonth, getTradesForYear,
  getBookmarkedTrades, toggleBookmark, getAllTrades,
} from '../db/queries';

interface TradeStore {
  trades: Trade[];
  currentMonth: string;
  isLoading: boolean;
  error: string | null;

  setCurrentMonth: (month: string) => void;
  loadTradesByMonth: (yearMonth: string) => Promise<void>;
  loadTradesForYear: (year: string) => Promise<Trade[]>;
  loadBookmarked: () => Promise<Trade[]>;
  loadAllTrades: () => Promise<Trade[]>;
  addTrade: (trade: Trade) => Promise<void>;
  editTrade: (trade: Trade) => Promise<void>;
  removeTrade: (id: string) => Promise<void>;
  bookmarkTrade: (id: string, bookmarked: boolean) => Promise<void>;
  clearError: () => void;
}

function todayYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const useTradeStore = create<TradeStore>((set, get) => ({
  trades: [],
  currentMonth: todayYearMonth(),
  isLoading: false,
  error: null,

  setCurrentMonth: (month) => {
    set({ currentMonth: month });
  },

  loadTradesByMonth: async (yearMonth) => {
    set({ isLoading: true, error: null });
    try {
      const trades = await getTradesByMonth(yearMonth);
      set({ trades, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : '読み込みに失敗しました' });
    }
  },

  loadTradesForYear: async (year) => getTradesForYear(year),
  loadBookmarked: async () => getBookmarkedTrades(),
  loadAllTrades: async () => getAllTrades(),

  addTrade: async (trade) => {
    try {
      await insertTrade(trade);
      await get().loadTradesByMonth(get().currentMonth);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '保存に失敗しました' });
      throw e;
    }
  },

  editTrade: async (trade) => {
    try {
      await updateTrade(trade);
      await get().loadTradesByMonth(get().currentMonth);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '更新に失敗しました' });
      throw e;
    }
  },

  removeTrade: async (id) => {
    try {
      await deleteTrade(id);
      set(state => ({ trades: state.trades.filter(t => t.id !== id) }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '削除に失敗しました' });
      throw e;
    }
  },

  bookmarkTrade: async (id, bookmarked) => {
    try {
      await toggleBookmark(id, bookmarked);
      set(state => ({
        trades: state.trades.map(t => t.id === id ? { ...t, bookmarked } : t),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'ブックマークの更新に失敗しました' });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));

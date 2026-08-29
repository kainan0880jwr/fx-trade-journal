import * as Sentry from '@sentry/react-native';
import { create } from 'zustand';
import type { Trade } from '../types';
import {
  insertTrade, updateTrade, deleteTrade,
  getTradesByMonth, getTradesForYear,
  getBookmarkedTrades, toggleBookmark, getAllTrades,
} from '../db/queries';
import { t } from '../i18n';
import { syncWidgetData } from '../utils/widgetSync';

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

// index/calendar/monthly/statsの4画面が同じcurrentMonthの変化に反応してそれぞれ
// loadTradesByMonthを呼ぶため、月切り替え1回で同一クエリが最大4回同時に発行される。
// 同じ月への同時呼び出しは進行中のPromiseを共有し、重複クエリを避ける。
let inflightMonth: string | null = null;
let inflightPromise: Promise<void> | null = null;

export const useTradeStore = create<TradeStore>((set, get) => ({
  trades: [],
  currentMonth: todayYearMonth(),
  isLoading: false,
  error: null,

  setCurrentMonth: (month) => {
    set({ currentMonth: month });
  },

  loadTradesByMonth: async (yearMonth) => {
    if (inflightMonth === yearMonth && inflightPromise) {
      return inflightPromise;
    }
    const promise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const trades = await getTradesByMonth(yearMonth);
        set({ trades, isLoading: false });
      } catch (e) {
        // trades をそのままにすると、月を切り替えたのに**前の月の一覧・勝率・
        // 合計pipsが表示され続ける**（ヘッダの月表示だけ変わる）。
        // ユーザーは別の月の数字を当月のものとして読んでしまうため、必ず空にする。
        set({ trades: [], isLoading: false, error: e instanceof Error ? e.message : t('trade_load_error') });
        try {
          Sentry.captureException(e, { tags: { area: 'trade_load', month: yearMonth } });
        } catch { /* 計装の失敗は無視 */ }
      } finally {
        if (inflightMonth === yearMonth) {
          inflightMonth = null;
          inflightPromise = null;
        }
      }
    })();
    inflightMonth = yearMonth;
    inflightPromise = promise;
    return promise;
  },

  loadTradesForYear: async (year) => getTradesForYear(year),
  loadBookmarked: async () => getBookmarkedTrades(),
  loadAllTrades: async () => getAllTrades(),

  addTrade: async (trade) => {
    try {
      await insertTrade(trade);
      await get().loadTradesByMonth(get().currentMonth);
      syncWidgetData();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : t('trade_save_error') });
      throw e;
    }
  },

  editTrade: async (trade) => {
    try {
      await updateTrade(trade);
      await get().loadTradesByMonth(get().currentMonth);
      syncWidgetData();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : t('trade_update_error') });
      throw e;
    }
  },

  removeTrade: async (id) => {
    try {
      await deleteTrade(id);
      set(state => ({ trades: state.trades.filter(tr => tr.id !== id) }));
      syncWidgetData();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : t('trade_delete_error') });
      throw e;
    }
  },

  bookmarkTrade: async (id, bookmarked) => {
    try {
      await toggleBookmark(id, bookmarked);
      set(state => ({
        trades: state.trades.map(tr => tr.id === id ? { ...tr, bookmarked } : tr),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : t('trade_bookmark_error') });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));

import { create } from 'zustand';
import type { CurrencyPair, AppSettings } from '../types';
import {
  getCurrencyPairs, upsertCurrencyPair, deleteCurrencyPair,
  getAllSettings, setSetting, getEntryTags, saveEntryTags,
  getTradeRules, saveTradeRules,
} from '../db/queries';

interface SettingsStore {
  pairs: CurrencyPair[];
  settings: AppSettings;
  entryTags: string[];
  tradeRules: string[];
  isLoaded: boolean;
  error: string | null;

  loadAll: () => Promise<void>;
  addPair: (pair: CurrencyPair) => Promise<void>;
  updatePair: (pair: CurrencyPair) => Promise<void>;
  removePair: (id: string) => Promise<void>;
  updateLotUnit: (value: number) => Promise<void>;
  updateDefaultStyle: (value: string) => Promise<void>;
  updateAccountBalance: (value: number) => Promise<void>;
  updateDefaultRiskPct: (value: number) => Promise<void>;
  updateMonthlyPipsGoal: (value: number) => Promise<void>;
  updateMonthlyWinRateGoal: (value: number) => Promise<void>;
  addEntryTag: (tag: string) => Promise<void>;
  removeEntryTag: (tag: string) => Promise<void>;
  addTradeRule: (rule: string) => Promise<void>;
  removeTradeRule: (rule: string) => Promise<void>;
  updateThemeMode: (value: AppSettings['themeMode']) => Promise<void>;
  updateAppLockEnabled: (value: boolean) => Promise<void>;
}

const defaultSettings: AppSettings = {
  lotUnit: 10000, defaultStyle: 'day',
  accountBalance: 0, defaultRiskPct: 2,
  monthlyPipsGoal: 0, monthlyWinRateGoal: 0,
  themeMode: 'dark',
  appLockEnabled: false,
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  pairs: [],
  settings: defaultSettings,
  entryTags: [],
  tradeRules: [],
  isLoaded: false,
  error: null,

  loadAll: async () => {
    try {
      const [pairs, settings, entryTags, tradeRules] = await Promise.all([
        getCurrencyPairs(), getAllSettings(), getEntryTags(), getTradeRules(),
      ]);
      set({ pairs, settings, entryTags, tradeRules, isLoaded: true, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の読み込みに失敗しました' });
    }
  },

  addPair: async (pair) => {
    try {
      await upsertCurrencyPair(pair);
      const pairs = await getCurrencyPairs();
      set({ pairs, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '通貨ペアの追加に失敗しました' });
      throw e;
    }
  },
  updatePair: async (pair) => {
    try {
      await upsertCurrencyPair(pair);
      const pairs = await getCurrencyPairs();
      set({ pairs, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '通貨ペアの更新に失敗しました' });
      throw e;
    }
  },
  removePair: async (id) => {
    try {
      await deleteCurrencyPair(id);
      set(state => ({ pairs: state.pairs.filter(p => p.id !== id), error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '通貨ペアの削除に失敗しました' });
      throw e;
    }
  },

  updateLotUnit: async (value) => {
    try {
      await setSetting('lot_unit', String(value));
      set(state => ({ settings: { ...state.settings, lotUnit: value }, error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の保存に失敗しました' });
      throw e;
    }
  },
  updateDefaultStyle: async (value) => {
    try {
      await setSetting('default_style', value);
      set(state => ({ settings: { ...state.settings, defaultStyle: value }, error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の保存に失敗しました' });
      throw e;
    }
  },
  updateAccountBalance: async (value) => {
    try {
      await setSetting('account_balance', String(value));
      set(state => ({ settings: { ...state.settings, accountBalance: value }, error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の保存に失敗しました' });
      throw e;
    }
  },
  updateDefaultRiskPct: async (value) => {
    try {
      await setSetting('default_risk_pct', String(value));
      set(state => ({ settings: { ...state.settings, defaultRiskPct: value }, error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の保存に失敗しました' });
      throw e;
    }
  },
  updateMonthlyPipsGoal: async (value) => {
    try {
      await setSetting('monthly_pips_goal', String(value));
      set(state => ({ settings: { ...state.settings, monthlyPipsGoal: value }, error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の保存に失敗しました' });
      throw e;
    }
  },
  updateMonthlyWinRateGoal: async (value) => {
    try {
      await setSetting('monthly_win_rate_goal', String(value));
      set(state => ({ settings: { ...state.settings, monthlyWinRateGoal: value }, error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の保存に失敗しました' });
      throw e;
    }
  },

  addEntryTag: async (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || get().entryTags.includes(trimmed)) return;
    const tags = [...get().entryTags, trimmed];
    try {
      await saveEntryTags(tags);
      set({ entryTags: tags, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'タグの追加に失敗しました' });
      throw e;
    }
  },
  removeEntryTag: async (tag) => {
    const tags = get().entryTags.filter(t => t !== tag);
    try {
      await saveEntryTags(tags);
      set({ entryTags: tags, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'タグの削除に失敗しました' });
      throw e;
    }
  },

  addTradeRule: async (rule) => {
    const trimmed = rule.trim();
    if (!trimmed || get().tradeRules.includes(trimmed)) return;
    const rules = [...get().tradeRules, trimmed];
    try {
      await saveTradeRules(rules);
      set({ tradeRules: rules, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'ルールの追加に失敗しました' });
      throw e;
    }
  },
  removeTradeRule: async (rule) => {
    const rules = get().tradeRules.filter(r => r !== rule);
    try {
      await saveTradeRules(rules);
      set({ tradeRules: rules, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'ルールの削除に失敗しました' });
      throw e;
    }
  },

  updateThemeMode: async (value) => {
    try {
      await setSetting('theme_mode', value);
      set(state => ({ settings: { ...state.settings, themeMode: value }, error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の保存に失敗しました' });
      throw e;
    }
  },

  updateAppLockEnabled: async (value) => {
    try {
      await setSetting('app_lock_enabled', value ? '1' : '0');
      set(state => ({ settings: { ...state.settings, appLockEnabled: value }, error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の保存に失敗しました' });
      throw e;
    }
  },
}));

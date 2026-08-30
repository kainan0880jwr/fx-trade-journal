import { create } from 'zustand';
import type { CurrencyPair, AppSettings } from '../types';
import {
  getCurrencyPairs, upsertCurrencyPair, deleteCurrencyPair,
  getAllSettings, setSetting, getEntryTags, saveEntryTags,
  getTradeRules, saveTradeRules, GOAL_SETTING_KEYS,
} from '../db/queries';
import type { GoalField } from '../db/queries';

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
  updateDefaultLotSize: (value: number) => Promise<void>;
  updateDefaultStyle: (value: string) => Promise<void>;
  updateAccountBalance: (value: number) => Promise<void>;
  updateDefaultRiskPct: (value: number) => Promise<void>;
  updateMonthlyPipsGoal: (value: number) => Promise<void>;
  updateMonthlyWinRateGoal: (value: number) => Promise<void>;
  updateMonthlyPLGoal: (value: number) => Promise<void>;
  updateGoal: (field: GoalField, value: number | boolean) => Promise<void>;
  addEntryTag: (tag: string) => Promise<void>;
  removeEntryTag: (tag: string) => Promise<void>;
  addTradeRule: (rule: string) => Promise<void>;
  removeTradeRule: (rule: string) => Promise<void>;
  updateThemeMode: (value: AppSettings['themeMode']) => Promise<void>;
  updateAppLockEnabled: (value: boolean) => Promise<void>;
}

const defaultSettings: AppSettings = {
  lotUnit: 10000, defaultLotSize: 0.1, defaultStyle: 'day',
  accountBalance: 0, defaultRiskPct: 2,
  monthlyPipsGoal: 0, monthlyWinRateGoal: 0, monthlyPLGoal: 0,
  // 期間別目標はすべて未設定で開始する。日単位のpips・損益は、
  // 未達の日に無理なトレードを誘発しうるため既定でオフ。
  dailyRuleGoal: false, dailyPipsGoal: 0, dailyPLGoal: 0,
  weeklyRuleDaysGoal: 0, weeklyPipsGoal: 0, weeklyPLGoal: 0,
  monthlyRuleDaysGoal: 0,
  yearlyRuleDaysGoal: 0, yearlyPipsGoal: 0, yearlyPLGoal: 0, yearlyWinRateGoal: 0,
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
      // 以前はここで握り潰しており、_layout.tsx の `await loadAll()` は成功扱いに
      // なっていた。中身は既定値（pairs=[] / accountBalance=0 / lotUnit=10000）のため、
      // 通貨ペアが空でトレードを記録できない・損益が別の数字になる・テーマが戻る、
      // といった状態のままアプリが通常起動していた。他のメソッドと同様に throw して
      // DBエラー画面（再試行あり）へ落とす。
      set({ error: e instanceof Error ? e.message : '設定の読み込みに失敗しました' });
      throw e;
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
  updateDefaultLotSize: async (value) => {
    try {
      await setSetting('default_lot_size', String(value));
      set(state => ({ settings: { ...state.settings, defaultLotSize: value }, error: null }));
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
  updateMonthlyPLGoal: async (value) => {
    try {
      await setSetting('monthly_pl_goal', String(value));
      set(state => ({ settings: { ...state.settings, monthlyPLGoal: value }, error: null }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '設定の保存に失敗しました' });
      throw e;
    }
  },

  /**
   * 期間別目標をまとめて扱う汎用setter。
   * 目標は14項目あり、1つずつsetterを書くと同じ定型が14回並ぶ。
   */
  updateGoal: async (field, value) => {
    try {
      await setSetting(GOAL_SETTING_KEYS[field], typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
      set(state => ({ settings: { ...state.settings, [field]: value } as AppSettings, error: null }));
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

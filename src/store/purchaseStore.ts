import { create } from 'zustand';
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  type PurchasesOfferings,
  LOG_LEVEL,
} from 'react-native-purchases';

const RC_API_KEY = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_RC_IOS_KEY ?? ''
  : process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '';

const ENTITLEMENT_ID = 'premium';

interface PurchaseStore {
  isPremium: boolean;
  isInitialized: boolean;

  initialize: () => void;
  checkPremium: () => Promise<void>;
  getOfferings: () => Promise<PurchasesOfferings | null>;
  purchase: (pkg: PurchasesPackage) => Promise<boolean | null>; // null = user cancelled
  restore: () => Promise<boolean>;
}

function hasPremium(info: CustomerInfo): boolean {
  return !!info.entitlements.active[ENTITLEMENT_ID];
}

export const usePurchaseStore = create<PurchaseStore>((set) => ({
  isPremium: false,
  isInitialized: false,

  initialize: () => {
    if (!RC_API_KEY || RC_API_KEY.startsWith('appl_xxxx') || RC_API_KEY.startsWith('goog_xxxx')) {
      // 開発中はキー未設定のため初期化をスキップ
      set({ isInitialized: true });
      return;
    }

    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      Purchases.configure({ apiKey: RC_API_KEY });
    } catch {
      set({ isInitialized: true });
      return;
    }

    // 起動をブロックしないよう非同期で購入状態を取得
    Purchases.getCustomerInfo()
      .then((info) => set({ isPremium: hasPremium(info), isInitialized: true }))
      .catch(() => set({ isInitialized: true }));

    // 購入状態変更リスナー（他デバイスでの購入・復元を反映）
    Purchases.addCustomerInfoUpdateListener((info) => {
      set({ isPremium: hasPremium(info) });
    });
  },

  checkPremium: async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      set({ isPremium: hasPremium(info) });
    } catch {
      // 失敗時は現状維持
    }
  },

  getOfferings: async () => {
    try {
      return await Purchases.getOfferings();
    } catch {
      return null;
    }
  },

  purchase: async (pkg: PurchasesPackage) => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const premium = hasPremium(customerInfo);
      set({ isPremium: premium });
      return premium;
    } catch (e: any) {
      if (e?.userCancelled === true) return null;
      return false;
    }
  },

  restore: async () => {
    try {
      const info = await Purchases.restorePurchases();
      const premium = hasPremium(info);
      set({ isPremium: premium });
      return premium;
    } catch {
      return false;
    }
  },
}));

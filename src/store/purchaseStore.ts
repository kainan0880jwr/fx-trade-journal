import { create } from 'zustand';
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  type PurchasesOfferings,
  type PurchasesError,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';

const RC_API_KEY = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_RC_IOS_KEY ?? ''
  : process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '';

const ENTITLEMENT_ID = 'premium';

// プレースホルダー（appl_xxxx.../goog_xxxx...）を含む未設定キーを弾く
const isPlaceholderKey = (key: string) => !key || /xxxx/i.test(key);

// 'success'      = 購入成功・プレミアム有効化まで完了
// 'pending'      = 承認待ち（Ask to Buy等）。エンタイトルメントは未確定
// 'no_entitlement' = 決済自体は成功したがエンタイトルメントが付与されていない（RevenueCat設定不備等）
// 'cancelled'    = ユーザーによるキャンセル
// 'error'        = 通信・SDKエラー
export type PurchaseResult = 'success' | 'pending' | 'no_entitlement' | 'cancelled' | 'error';
// 'success'        = 復元成功（プレミアム有効）
// 'no_entitlement' = 復元処理は成功したが有効なエンタイトルメントがない（未購入・期限切れ等）
// 'error'          = 通信・SDKエラー
export type RestoreResult = 'success' | 'no_entitlement' | 'error';

interface PurchaseStore {
  isPremium: boolean;
  isInitialized: boolean;
  // configure()が成功したかどうか。falseのままgetOfferings等を呼んでも常に失敗するため、
  // 呼び出し側でリトライ導線を出し分けるために公開する
  isConfigured: boolean;

  initialize: () => void;
  checkPremium: () => Promise<void>;
  getOfferings: () => Promise<PurchasesOfferings | null>;
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseResult>;
  restore: () => Promise<RestoreResult>;
}

function hasPremium(info: CustomerInfo): boolean {
  return !!info.entitlements.active[ENTITLEMENT_ID];
}

// StrictModeの二重マウントやuseEffectの多重発火でも configure/リスナー登録が
// 一度しか実行されないようにするモジュールレベルのガード。
// configure()自体が失敗した場合は再試行できるようfalseに戻す。
let hasStartedInit = false;

export const usePurchaseStore = create<PurchaseStore>((set, get) => ({
  isPremium: false,
  isInitialized: false,
  isConfigured: false,

  initialize: () => {
    if (hasStartedInit) return;
    hasStartedInit = true;

    if (isPlaceholderKey(RC_API_KEY)) {
      // 開発中はキー未設定のため初期化をスキップ
      set({ isInitialized: true });
      return;
    }

    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      Purchases.configure({ apiKey: RC_API_KEY });
    } catch {
      hasStartedInit = false; // 一時的なエラーの可能性があるため再初期化できるようにする
      set({ isInitialized: true });
      return;
    }

    set({ isConfigured: true });

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
    if (!get().isConfigured) return;
    try {
      const info = await Purchases.getCustomerInfo();
      set({ isPremium: hasPremium(info) });
    } catch {
      // 失敗時は現状維持
    }
  },

  getOfferings: async () => {
    if (!get().isConfigured) return null;
    try {
      return await Purchases.getOfferings();
    } catch {
      return null;
    }
  },

  purchase: async (pkg: PurchasesPackage) => {
    if (!get().isConfigured) return 'error';
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const premium = hasPremium(customerInfo);
      set({ isPremium: premium });
      return premium ? 'success' : 'no_entitlement';
    } catch (e) {
      const err = e as PurchasesError;
      if (err?.userCancelled === true) return 'cancelled';
      if (err?.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
      return 'error';
    }
  },

  restore: async () => {
    if (!get().isConfigured) return 'error';
    try {
      const info = await Purchases.restorePurchases();
      const premium = hasPremium(info);
      set({ isPremium: premium });
      return premium ? 'success' : 'no_entitlement';
    } catch {
      return 'error';
    }
  },
}));

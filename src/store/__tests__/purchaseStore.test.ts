import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

// purchaseStore.ts はモジュール読み込み時に process.env から RC_API_KEY を確定するため、
// 各テストで env を変えたい場合は resetModules() → 再require が必須。
// hasStartedInit もモジュールスコープの変数なので、同様に毎回リセットする。

function loadStore() {
  jest.resetModules();
  const Purchases = require('react-native-purchases').default;
  const { usePurchaseStore } = require('../purchaseStore');
  return { Purchases, usePurchaseStore };
}

function makeCustomerInfo(active: boolean): CustomerInfo {
  return {
    entitlements: { active: active ? { premium: {} } : {} },
  } as unknown as CustomerInfo;
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('initialize', () => {
  it('プレースホルダーキー（appl_xxxx...）の場合はconfigureを呼ばずに初期化完了とする', () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const { Purchases, usePurchaseStore } = loadStore();

    usePurchaseStore.getState().initialize();

    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(usePurchaseStore.getState().isInitialized).toBe(true);
    expect(usePurchaseStore.getState().isConfigured).toBe(false);
  });

  it('キー未設定（空文字）の場合もconfigureを呼ばない', () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = '';
    const { Purchases, usePurchaseStore } = loadStore();

    usePurchaseStore.getState().initialize();

    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(usePurchaseStore.getState().isInitialized).toBe(true);
  });

  it('本物のキーが設定されていればconfigureを呼ぶ', () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));

    usePurchaseStore.getState().initialize();

    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(usePurchaseStore.getState().isConfigured).toBe(true);
  });

  it('複数回呼んでもconfigureとリスナー登録は1回しか実行されない（冪等性）', () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));

    usePurchaseStore.getState().initialize();
    usePurchaseStore.getState().initialize();
    usePurchaseStore.getState().initialize();

    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
  });

  it('configure自体が例外を投げた場合はisConfigured=falseのまま再初期化できる', () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.configure.mockImplementationOnce(() => { throw new Error('native init failed'); });

    usePurchaseStore.getState().initialize();
    expect(usePurchaseStore.getState().isConfigured).toBe(false);
    expect(usePurchaseStore.getState().isInitialized).toBe(true);

    // 失敗後は再度initialize()を呼べば再試行される（hasStartedInitが戻っているため）
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    usePurchaseStore.getState().initialize();
    expect(Purchases.configure).toHaveBeenCalledTimes(2);
    expect(usePurchaseStore.getState().isConfigured).toBe(true);
  });

  it('addCustomerInfoUpdateListenerのコールバックでisPremiumが更新される', () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));

    usePurchaseStore.getState().initialize();
    const listener = Purchases.addCustomerInfoUpdateListener.mock.calls[0][0];
    listener(makeCustomerInfo(true));

    expect(usePurchaseStore.getState().isPremium).toBe(true);
  });
});

describe('未configure時', () => {
  it('getOfferings/purchase/restoreは呼び出さずエラー相当を返す', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const { Purchases, usePurchaseStore } = loadStore();

    usePurchaseStore.getState().initialize(); // プレースホルダーキーのためisConfigured=falseのまま

    expect(await usePurchaseStore.getState().getOfferings()).toBeNull();
    expect(await usePurchaseStore.getState().purchase({} as PurchasesPackage)).toBe('error');
    expect(await usePurchaseStore.getState().restore()).toBe('error');
    expect(Purchases.getOfferings).not.toHaveBeenCalled();
    expect(Purchases.purchasePackage).not.toHaveBeenCalled();
    expect(Purchases.restorePurchases).not.toHaveBeenCalled();
  });
});

describe('purchase', () => {
  it('購入成功でエンタイトルメントが有効になる場合は"success"を返す', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    Purchases.purchasePackage.mockResolvedValue({ customerInfo: makeCustomerInfo(true) });
    usePurchaseStore.getState().initialize();

    const result = await usePurchaseStore.getState().purchase({} as PurchasesPackage);

    expect(result).toBe('success');
    expect(usePurchaseStore.getState().isPremium).toBe(true);
  });

  it('決済は成功したがエンタイトルメントが付与されない場合は"no_entitlement"を返す（"error"と区別する）', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    Purchases.purchasePackage.mockResolvedValue({ customerInfo: makeCustomerInfo(false) });
    usePurchaseStore.getState().initialize();

    const result = await usePurchaseStore.getState().purchase({} as PurchasesPackage);

    expect(result).toBe('no_entitlement');
    expect(usePurchaseStore.getState().isPremium).toBe(false);
  });

  it('ユーザーがキャンセルした場合は"cancelled"を返す（エラー扱いにしない）', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    Purchases.purchasePackage.mockRejectedValue({ userCancelled: true });
    usePurchaseStore.getState().initialize();

    const result = await usePurchaseStore.getState().purchase({} as PurchasesPackage);

    expect(result).toBe('cancelled');
  });

  it('承認待ち（Ask to Buy等）の場合は"pending"を返す（失敗扱いにしない）', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    const { PURCHASES_ERROR_CODE } = require('react-native-purchases');
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    Purchases.purchasePackage.mockRejectedValue({ code: PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR });
    usePurchaseStore.getState().initialize();

    const result = await usePurchaseStore.getState().purchase({} as PurchasesPackage);

    expect(result).toBe('pending');
  });

  it('その他のエラーは"error"を返す（フェイルクローズ）', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    Purchases.purchasePackage.mockRejectedValue(new Error('network error'));
    usePurchaseStore.getState().initialize();

    const result = await usePurchaseStore.getState().purchase({} as PurchasesPackage);

    expect(result).toBe('error');
    expect(usePurchaseStore.getState().isPremium).toBe(false);
  });
});

describe('restore', () => {
  it('復元成功でエンタイトルメントが有効なら"success"を返す', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    Purchases.restorePurchases.mockResolvedValue(makeCustomerInfo(true));
    usePurchaseStore.getState().initialize();

    const result = await usePurchaseStore.getState().restore();

    expect(result).toBe('success');
  });

  it('復元は成功したが対象がない場合は"no_entitlement"を返す（エラーと区別する）', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    Purchases.restorePurchases.mockResolvedValue(makeCustomerInfo(false));
    usePurchaseStore.getState().initialize();

    const result = await usePurchaseStore.getState().restore();

    expect(result).toBe('no_entitlement');
  });

  it('通信エラー等で処理自体が失敗した場合は"error"を返す', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.getCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    Purchases.restorePurchases.mockRejectedValue(new Error('network error'));
    usePurchaseStore.getState().initialize();

    const result = await usePurchaseStore.getState().restore();

    expect(result).toBe('error');
  });
});

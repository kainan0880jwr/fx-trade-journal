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
});

describe('purchase', () => {
  it('購入成功でプレミアムが有効になる場合はtrueを返す', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.purchasePackage.mockResolvedValue({ customerInfo: makeCustomerInfo(true) });

    const result = await usePurchaseStore.getState().purchase({} as PurchasesPackage);

    expect(result).toBe(true);
    expect(usePurchaseStore.getState().isPremium).toBe(true);
  });

  it('ユーザーがキャンセルした場合はnullを返す（エラー扱いにしない）', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.purchasePackage.mockRejectedValue({ userCancelled: true });

    const result = await usePurchaseStore.getState().purchase({} as PurchasesPackage);

    expect(result).toBeNull();
  });

  it('その他のエラーはfalseを返す（フェイルクローズ）', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.purchasePackage.mockRejectedValue(new Error('network error'));

    const result = await usePurchaseStore.getState().purchase({} as PurchasesPackage);

    expect(result).toBe(false);
    expect(usePurchaseStore.getState().isPremium).toBe(false);
  });
});

describe('restore', () => {
  it('復元成功でエンタイトルメントが有効ならtrueを返す', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.restorePurchases.mockResolvedValue(makeCustomerInfo(true));

    const result = await usePurchaseStore.getState().restore();

    expect(result).toBe(true);
  });

  it('復元は成功したが対象がない場合はfalseを返す（エラーと区別する）', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.restorePurchases.mockResolvedValue(makeCustomerInfo(false));

    const result = await usePurchaseStore.getState().restore();

    expect(result).toBe(false);
  });

  it('通信エラー等で処理自体が失敗した場合はnullを返す', async () => {
    process.env.EXPO_PUBLIC_RC_IOS_KEY = 'appl_realKeyExample123';
    const { Purchases, usePurchaseStore } = loadStore();
    Purchases.restorePurchases.mockRejectedValue(new Error('network error'));

    const result = await usePurchaseStore.getState().restore();

    expect(result).toBeNull();
  });
});

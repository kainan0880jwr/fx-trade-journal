import React from 'react';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react-native';
import type { PurchasesPackage, PurchasesOfferings } from 'react-native-purchases';
import { PACKAGE_TYPE } from 'react-native-purchases';
import { router } from 'expo-router';
import { t } from '../../src/i18n';
import { usePurchaseStore } from '../../src/store/purchaseStore';
import PaywallScreen from '../paywall';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: (props: any) => <View {...props} /> };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: (props: any) => <Text>{props.name}</Text> };
});

jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

jest.mock('../../src/theme/useTheme', () => ({
  useTheme: () => require('../../src/theme/colors').darkColors,
}));

jest.mock('../../src/store/purchaseStore');

function makePkg(overrides: {
  identifier: string;
  packageType: PACKAGE_TYPE;
  introPrice?: { periodNumberOfUnits: number; periodUnit: string } | null;
}): PurchasesPackage {
  return {
    identifier: overrides.identifier,
    packageType: overrides.packageType,
    product: {
      identifier: overrides.identifier,
      title: overrides.identifier,
      priceString: '¥500',
      pricePerMonthString: '¥417',
      price: 500,
      pricePerMonth: 417,
      introPrice: overrides.introPrice ?? null,
    },
  } as unknown as PurchasesPackage;
}

function makeOfferings(pkgs: PurchasesPackage[]): PurchasesOfferings {
  return {
    current: { availablePackages: pkgs },
  } as unknown as PurchasesOfferings;
}

const mockedUsePurchaseStore = usePurchaseStore as unknown as jest.Mock;

function setStore(overrides: Partial<{
  getOfferings: jest.Mock;
  purchase: jest.Mock;
  restore: jest.Mock;
  isPremium: boolean;
}>) {
  mockedUsePurchaseStore.mockReturnValue({
    getOfferings: jest.fn().mockResolvedValue(null),
    purchase: jest.fn().mockResolvedValue('success'),
    restore: jest.fn().mockResolvedValue('success'),
    isPremium: false,
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PaywallScreen', () => {
  it('プラン取得が0件の場合は再試行ボタンを表示し、押すとgetOfferingsを再度呼ぶ', async () => {
    const getOfferings = jest.fn().mockResolvedValue(makeOfferings([]));
    setStore({ getOfferings });

    await render(<PaywallScreen />);
    await waitFor(() => expect(getOfferings).toHaveBeenCalledTimes(1));

    const retryBtn = await screen.findByText(t('paywall_retry'));
    fireEvent.press(retryBtn);

    await waitFor(() => expect(getOfferings).toHaveBeenCalledTimes(2));
  });

  it('アンマウント後にgetOfferingsが解決しても状態更新やクラッシュが起きない', async () => {
    let resolveOfferings: (v: PurchasesOfferings) => void;
    const pending = new Promise<PurchasesOfferings>((resolve) => { resolveOfferings = resolve; });
    const getOfferings = jest.fn().mockReturnValue(pending);
    setStore({ getOfferings });

    await render(<PaywallScreen />);
    await waitFor(() => expect(getOfferings).toHaveBeenCalledTimes(1));

    // cleanup()はRNTLの自動クリーンアップキューから取り除きつつアンマウントするため、
    // afterEachでの二重unmount（"overlapping act() calls"警告の原因）を避けられる
    await cleanup();

    // アンマウント後にレスポンスが解決しても例外を投げない（isMountedガード）
    await expect(act(async () => {
      resolveOfferings(makeOfferings([
        makePkg({ identifier: 'late.yearly', packageType: PACKAGE_TYPE.ANNUAL }),
      ]));
    })).resolves.not.toThrow();
  });

  it('トライアル資格がある商品だけにトライアルラベルを表示する', async () => {
    const eligible = makePkg({
      identifier: 'eligible.yearly',
      packageType: PACKAGE_TYPE.ANNUAL,
      introPrice: { periodNumberOfUnits: 7, periodUnit: 'DAY' },
    });
    const ineligible = makePkg({
      identifier: 'ineligible.monthly',
      packageType: PACKAGE_TYPE.MONTHLY,
      introPrice: { periodNumberOfUnits: 7, periodUnit: 'DAY' },
    });
    const getOfferings = jest.fn().mockResolvedValue(makeOfferings([eligible, ineligible]));
    setStore({ getOfferings });

    const Purchases = require('react-native-purchases').default;
    const { INTRO_ELIGIBILITY_STATUS } = require('react-native-purchases');
    Purchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      'eligible.yearly': { status: INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE },
      'ineligible.monthly': { status: INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE },
    });

    await render(<PaywallScreen />);

    const trialLabel = t('paywall_trial_day').replace('{n}', '7');
    await waitFor(() => expect(screen.getAllByText(trialLabel).length).toBe(1));
  });

  it('購入ボタンを連打してもpurchase()は1回しか呼ばれない', async () => {
    const yearly = makePkg({ identifier: 'yearly', packageType: PACKAGE_TYPE.ANNUAL });
    const getOfferings = jest.fn().mockResolvedValue(makeOfferings([yearly]));
    let resolvePurchase: (v: string) => void;
    const purchase = jest.fn().mockReturnValue(
      new Promise((resolve) => { resolvePurchase = resolve; })
    );
    setStore({ getOfferings, purchase });

    await render(<PaywallScreen />);
    const ctaBtn = await screen.findByText(t('premium_cta'));

    await act(async () => {
      fireEvent.press(ctaBtn);
      fireEvent.press(ctaBtn);
      fireEvent.press(ctaBtn);
    });

    expect(purchase).toHaveBeenCalledTimes(1);

    await act(async () => { resolvePurchase!('success'); });
    // handlePurchase内のsetLoading(false)等の後続状態更新が確実に完了するまで待つ
    // （そうしないと次のテストのact()スコープに漏れ、警告や不安定なテストの原因になる）
    await waitFor(() => expect(screen.getByText(t('premium_cta'))).toBeTruthy());
  });

  it('isPremiumがtrueになるとrouter.backが1回だけ呼ばれる', async () => {
    const getOfferings = jest.fn().mockResolvedValue(makeOfferings([]));
    setStore({ getOfferings, isPremium: false });

    const view = await render(<PaywallScreen />);
    await waitFor(() => expect(getOfferings).toHaveBeenCalledTimes(1));
    expect(router.back).not.toHaveBeenCalled();

    setStore({ getOfferings, isPremium: true });
    await view.rerender(<PaywallScreen />);

    expect(router.back).toHaveBeenCalledTimes(1);

    // isPremiumがtrueのまま再レンダリングされても増えない
    setStore({ getOfferings, isPremium: true });
    await view.rerender(<PaywallScreen />);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

import type { PurchasesPackage } from 'react-native-purchases';
import { monthlyEquivalent, annualDiscountPct } from '../paywallCalc';

function makePkg(product: Partial<PurchasesPackage['product']>): PurchasesPackage {
  return { product } as unknown as PurchasesPackage;
}

describe('monthlyEquivalent', () => {
  // 表示言語（i18nの/月 vs /mo）はテスト実行環境のロケールに依存するため、
  // ここでは「SDKが返した通貨表記（$ / ¥ 等）がそのまま使われ、¥に固定変換されないこと」だけを検証する。
  it('SDKのpricePerMonthStringの通貨表記がそのまま使われる（USドルの例）', () => {
    const pkg = makePkg({ pricePerMonthString: '$4.17' });
    expect(monthlyEquivalent(pkg)).toMatch(/^\$4\.17/);
  });

  it('SDKのpricePerMonthStringの通貨表記がそのまま使われる（日本円の例）', () => {
    const pkg = makePkg({ pricePerMonthString: '¥417' });
    expect(monthlyEquivalent(pkg)).toMatch(/^¥417/);
  });

  it('pricePerMonthStringがnullならnullを返す', () => {
    const pkg = makePkg({ pricePerMonthString: null });
    expect(monthlyEquivalent(pkg)).toBeNull();
  });
});

describe('annualDiscountPct', () => {
  it('年額が月額換算より安ければ割引率を返す', () => {
    const yearly = makePkg({ pricePerMonth: 317 }); // 年額を月割りした額
    const monthly = makePkg({ price: 580 });
    // 1 - 317/580 = 0.4534... → 45%
    expect(annualDiscountPct(yearly, monthly)).toBe(45);
  });

  it('月額プランが存在しなければnullを返す', () => {
    const yearly = makePkg({ pricePerMonth: 317 });
    expect(annualDiscountPct(yearly, undefined)).toBeNull();
  });

  it('年額の方が高い（割引にならない）場合はnullを返す', () => {
    const yearly = makePkg({ pricePerMonth: 700 });
    const monthly = makePkg({ price: 580 });
    expect(annualDiscountPct(yearly, monthly)).toBeNull();
  });

  it('価格情報が欠落している場合はnullを返す', () => {
    const yearly = makePkg({ pricePerMonth: null });
    const monthly = makePkg({ price: 580 });
    expect(annualDiscountPct(yearly, monthly)).toBeNull();
  });
});

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

  // Apple の価格帯は国ごとに独立して割り当てられる。2026-09-19 に配信中の144か国を
  // 照合したところ、日本で16%の設定がチリ・韓国・台湾・香港では 2〜13% だった。
  // 「おすすめ」バッジとトライアル年額限定はそのままに、数値だけ黙らせる。
  it('割引が小さすぎる（10%未満）ならnullを返す', () => {
    // チリ相当: 月 2,990 / 年 34,990（月割 2,915.83）→ 2%
    expect(annualDiscountPct(makePkg({ pricePerMonth: 34990 / 12 }), makePkg({ price: 2990 }))).toBeNull();
    // 韓国相当: 月 4,400 / 年 49,000（月割 4,083.33）→ 7%
    expect(annualDiscountPct(makePkg({ pricePerMonth: 49000 / 12 }), makePkg({ price: 4400 }))).toBeNull();
    // 香港相当: 月 22 / 年 228（月割 19）→ 13%
    expect(annualDiscountPct(makePkg({ pricePerMonth: 228 / 12 }), makePkg({ price: 22 }))).toBe(13);
  });

  it('ちょうど10%は出す（境界）', () => {
    expect(annualDiscountPct(makePkg({ pricePerMonth: 90 }), makePkg({ price: 100 }))).toBe(10);
    expect(annualDiscountPct(makePkg({ pricePerMonth: 91 }), makePkg({ price: 100 }))).toBeNull();
  });
});

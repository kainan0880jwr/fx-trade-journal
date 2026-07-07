import type { PurchasesPackage } from 'react-native-purchases';
import { t } from '../i18n';

/** 年額プランの月割り価格文字列（通貨・ロケールはSDKが解決するため¥固定にしない）*/
export function monthlyEquivalent(pkg: PurchasesPackage): string | null {
  const str = pkg.product.pricePerMonthString;
  return str ? `${str}${t('paywall_per_month')}` : null;
}

/** 年額プランが月額プラン比で何%お得かを算出（両プランが揃っている場合のみ）*/
export function annualDiscountPct(yearly: PurchasesPackage, monthly: PurchasesPackage | undefined): number | null {
  if (!monthly) return null;
  const yearlyPerMonth = yearly.product.pricePerMonth;
  const monthlyPrice = monthly.product.price;
  if (!yearlyPerMonth || !monthlyPrice) return null;
  const pct = Math.round((1 - yearlyPerMonth / monthlyPrice) * 100);
  return pct > 0 ? pct : null;
}

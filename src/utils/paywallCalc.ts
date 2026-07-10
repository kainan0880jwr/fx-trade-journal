import type { PurchasesPackage } from 'react-native-purchases';
import { t } from '../i18n';

/** 年額プランの月割り価格（数値文字列のみ。「/月」等の表示語は呼び出し側で付与する）*/
export function monthlyEquivalent(pkg: PurchasesPackage): string | null {
  return pkg.product.pricePerMonthString ?? null;
}

/**
 * 年額プランが月額プラン比で何%お得かを算出（両プランが揃っている場合のみ）。
 * 実際の割引率を上回る数値を表示しないようMath.floorで切り捨てる。
 */
export function annualDiscountPct(yearly: PurchasesPackage, monthly: PurchasesPackage | undefined): number | null {
  if (!monthly) return null;
  const yearlyPerMonth = yearly.product.pricePerMonth;
  const monthlyPrice = monthly.product.price;
  if (!yearlyPerMonth || !monthlyPrice) return null;
  const pct = Math.floor((1 - yearlyPerMonth / monthlyPrice) * 100);
  return pct > 0 ? pct : null;
}

const TRIAL_UNIT_KEYS = {
  DAY: 'paywall_trial_day',
  WEEK: 'paywall_trial_week',
  MONTH: 'paywall_trial_month',
  YEAR: 'paywall_trial_year',
} as const;

/** トライアル期間のラベル（例: "7日間無料トライアル" / "7-Day Free Trial"）。トライアルなしなら空文字 */
export function trialLabel(pkg: PurchasesPackage): string {
  const intro = pkg.product.introPrice;
  if (!intro) return '';
  const key = TRIAL_UNIT_KEYS[intro.periodUnit as keyof typeof TRIAL_UNIT_KEYS];
  if (!key) return '';
  return t(key).replace('{n}', String(intro.periodNumberOfUnits));
}

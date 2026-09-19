import type { PurchasesPackage } from 'react-native-purchases';
import { t } from '../i18n';

/** 年額プランの月割り価格（数値文字列のみ。「/月」等の表示語は呼び出し側で付与する）*/
export function monthlyEquivalent(pkg: PurchasesPackage): string | null {
  return pkg.product.pricePerMonthString ?? null;
}

/**
 * 割引バッジを出す下限。**これ未満なら数値を出さない。**
 *
 * Apple の価格帯は国ごとに独立して割り当てられるため、日本で 33% でも
 * 同じ組み合わせが他国でそうなる保証は無い。2026-09-19 に配信中の144か国を
 * 実際に照合したところ、年額¥5,000／月額¥500（日本で16%）の設定で
 * チリ・ボスニア・セルビア・コソボが **2%**、韓国 7%、台湾 8%、香港 13% だった。
 *
 * 「おすすめ」バッジが付き、トライアルが年額にしか付かない画面で
 * 「月払いより2%お得」と出すのは、得だと言っているのか言っていないのか
 * 分からない表示になる。数値が意味を持たない水準では黙る方がよい。
 */
const MIN_DISCOUNT_PCT_TO_SHOW = 10;

/**
 * 年額プランが月額プラン比で何%お得かを算出（両プランが揃っている場合のみ）。
 * 実際の割引率を上回る数値を表示しないようMath.floorで切り捨てる。
 * 小さすぎる割引は null を返す（MIN_DISCOUNT_PCT_TO_SHOW 参照）。
 */
export function annualDiscountPct(yearly: PurchasesPackage, monthly: PurchasesPackage | undefined): number | null {
  if (!monthly) return null;
  const yearlyPerMonth = yearly.product.pricePerMonth;
  const monthlyPrice = monthly.product.price;
  if (!yearlyPerMonth || !monthlyPrice) return null;
  // `1 - a/b` と書くと、ちょうど10%引き（90/100）が浮動小数で 9.999… になり
  // 切り捨てで 9 に落ちる。差を先に取り、さらに極小の余裕を足して境界を守る。
  const pct = Math.floor(((monthlyPrice - yearlyPerMonth) / monthlyPrice) * 100 + 1e-9);
  return pct >= MIN_DISCOUNT_PCT_TO_SHOW ? pct : null;
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

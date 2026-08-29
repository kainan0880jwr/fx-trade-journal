import { lang } from '../i18n';

/**
 * 損益額の表示を全画面で統一する。
 *
 * ■ なぜ必要か
 *
 * 同じ画面内で `¥` と `円` が混在していた。たとえば月次タブでは
 * 大きい合計損益が「+10,000円」なのに、すぐ下の表は「+10,000¥」。
 * カレンダーの日別詳細も個別行は「円」・日次合計は「¥」だった。
 * 判定も `lang === 'ja' ? '円' : '¥'` の箇所と `¥` 固定の箇所が混在していた。
 *
 * 損益はクロス円ペアでのみ算出されるため通貨は常に日本円である
 * （profitCalc.ts はクロス円専用）。表記だけを言語に合わせて揃える。
 */
export function formatMoney(amount: number, withSign = true): string {
  if (!Number.isFinite(amount)) return '-';
  const suffix = lang === 'ja' ? '円' : '¥';
  const sign = withSign && amount > 0 ? '+' : '';
  return `${sign}${Math.round(amount).toLocaleString()}${suffix}`;
}

/** 単位のみが必要な箇所（説明文など）用 */
export function moneySuffix(): string {
  return lang === 'ja' ? '円' : '¥';
}

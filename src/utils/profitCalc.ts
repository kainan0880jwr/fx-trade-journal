/**
 * 損益計算（クロス円ペア専用: is_yen_pair=1）
 *
 * クロス円は pipDigits=2（database.ts の初期ペア定義でUSD/JPYは2）なので
 * **1pip = 0.01円**。取引通貨数は lotSize × lotUnit（設定の「1ロット = 何通貨」）。
 *
 *   損益(円) = pips × 0.01 × lotSize × lotUnit = pips × lotSize × lotUnit ÷ 100
 *
 * 以前は ÷10 になっており、表示される損益がすべて**実際の10倍**だった。
 * 例: ロット0.1・ロット単位10000（=1,000通貨）で 150.00→150.50（+50pips）
 *     実際 1,000 × 0.50 = 500円 のところ 5,000円 と表示していた。
 * 同一プロジェクト内の非円ペアの式（calculator.tsx の lotUnit × 0.0001 × USDJPY）
 * は正しく、両者が同時に正しいことはあり得なかった。
 */
export function calcProfitLoss(
  pips: number,
  lotSize: number,
  lotUnit: number
): number {
  return Math.round(pips * lotSize * lotUnit / 100);
}

/**
 * トレード結果を判定（pipsのプラス/マイナスから）
 */
export function determineResult(pips: number): 'win' | 'loss' | 'even' {
  if (pips > 0) return 'win';
  if (pips < 0) return 'loss';
  return 'even';
}

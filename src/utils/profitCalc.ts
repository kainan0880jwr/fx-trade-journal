/**
 * 損益計算（クロス円ペア専用: is_yen_pair=1）
 * 損益(円) = pips × lotSize × lotUnit ÷ 10
 */
export function calcProfitLoss(
  pips: number,
  lotSize: number,
  lotUnit: number
): number {
  return Math.round(pips * lotSize * lotUnit / 10);
}

/**
 * トレード結果を判定（pipsのプラス/マイナスから）
 */
export function determineResult(pips: number): 'win' | 'loss' | 'even' {
  if (pips > 0) return 'win';
  if (pips < 0) return 'loss';
  return 'even';
}

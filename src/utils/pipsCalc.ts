/**
 * pips計算
 * pipDigits=2: ドル円・クロス円（小数点2桁が1pip）
 * pipDigits=4: EUR/USDなど（小数点4桁が1pip）
 */
export function calcPips(
  direction: 'buy' | 'sell',
  entryRate: number,
  exitRate: number,
  pipDigits: number
): number {
  const diff = direction === 'buy'
    ? exitRate - entryRate
    : entryRate - exitRate;
  const multiplier = Math.pow(10, pipDigits);
  return Math.round(diff * multiplier * 10) / 10;
}

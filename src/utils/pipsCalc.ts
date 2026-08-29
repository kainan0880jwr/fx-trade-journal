import { parseDecimal } from './parseDecimal';
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

/**
 * クイック入力の pips に、選択された結果から符号を与える。
 *
 * クイック入力欄は keyboardType="decimal-pad" で、iOSにはマイナス記号のキーが無い。
 * つまりユーザーは負の値を入力できない。それにもかかわらず入力値をそのまま保存して
 * いたため、「負け」を選んで 50 と入れると +50 として記録され、次の全てが狂っていた。
 *
 *   - 合計pipsが負けトレードでも増える
 *   - grossLossが常に0になり、プロフィットファクターが永久に ∞
 *   - 分析タブのpips系指標とホーム画面ウィジェットの表示
 *
 * 詳細入力はレートから calcPips() で符号付きに算出し、結果もそこから導出するため
 * 影響を受けない。したがって「result が 'loss' なのに pips が正」という組み合わせは、
 * このクイック入力の不具合でしか発生しない。
 *
 * @param raw    入力欄の文字列（符号なしを想定）
 * @param result 選択された結果
 * @returns      符号付きpips。未入力・数値でない場合は null
 */
export function signedQuickPips(
  raw: string,
  result: 'win' | 'loss' | 'even' | null
): number | null {
  return signedByResult(raw, result);
}

/**
 * 符号なしで入力された数値に、選択された結果から符号を与える。
 *
 * pips と損益の**両方**で必要になる。どちらの入力欄も
 * `keyboardType="decimal-pad"` で、iOSにはマイナス記号のキーが無いため、
 * ユーザーは負の値を打てない。にもかかわらず入力値をそのまま保存すると、
 * 「負け」を選んで 500 と入れた損益が +500 として記録される。
 *
 * pips では一度これを修正したが、後から追加した損益の手入力欄で同じ
 * 間違いを繰り返した（EUR/USD が「負け・-20pips」なのに「+500¥」と
 * 表示される状態で実機報告された）。符号付けを1箇所に集約して再発を防ぐ。
 */
export function signedByResult(
  raw: string,
  result: 'win' | 'loss' | 'even' | null
): number | null {
  const n = parseDecimal(raw);
  if (n == null) return null;
  if (result === 'loss') return -Math.abs(n);
  if (result === 'win') return Math.abs(n);
  // 引き分けは入力値をそのまま尊重する（0以外を入れる運用を妨げない）
  return n;
}

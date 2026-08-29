/**
 * ユーザーが入力した数値文字列を安全に数値へ変換する。
 *
 * ■ なぜ必要か
 *
 * 数値入力欄はすべて `keyboardType="decimal-pad"` を使っているが、
 * iOS/Android とも**小数点記号は端末のロケールに従う**。本アプリが対応する11言語のうち
 * ドイツ語・フランス語・スペイン語・イタリア語・ポルトガル語・トルコ語・
 * ベトナム語・インドネシア語の**8言語はカンマ小数点圏**で、キーボードに `.` が出ない。
 *
 * それにもかかわらず素の `parseFloat()` を使っていたため、
 *   parseFloat("155,20") === 155
 * となり、レート・pips・ロットが黙って壊れていた。ロット欄では `0,5` が 0 と解釈され
 * 「ロットが不正」と弾かれるため、**キーボードで打てる値をアプリが拒否する**状態だった。
 *
 * ■ 方針
 *
 * - カンマは小数点として解釈する（数値入力欄では桁区切りは入力できないため曖昧さがない）
 * - 全角数字・全角記号も受け付ける（日本語IMEからの入力対策）
 * - 数値でないもの、Infinity、NaN は null を返し、呼び出し側で弾けるようにする
 *   （parseFloat は "20.5.3" を 20.5 として黙って受け入れていた）
 */

// 全角数字・全角ピリオド・全角カンマ・各種マイナス記号を半角へ
function toHalfWidth(input: string): string {
  return input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/[，、]/g, ',')
    .replace(/[－ー−–—]/g, '-');
}

/**
 * @returns 変換できた有限の数値。空文字・数値でない・Infinity/NaN の場合は null
 */
export function parseDecimal(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const normalized = toHalfWidth(String(raw)).trim().replace(/,/g, '.');
  if (normalized === '') return null;

  // 数値として妥当な形だけ通す
  if (!/^-?\d*\.?\d*$/.test(normalized)) return null;
  if (!/\d/.test(normalized)) return null;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

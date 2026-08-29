import { t } from '../i18n';

/**
 * 統計値の共通フォーマッタ。
 *
 * ■ なぜ必要か
 *
 * 同じ指標が画面ごとに違う値・違う書式で表示されていた。
 *   - 勝率: 記録タブ「67%」／月次・分析タブ「66.7%」／カレンダー「67%」（自前計算）
 *   - 合計pips: 記録タブは CountUp が Math.round して「+25」／月次タブは「+24.5」
 *   - PF: 記録タブ「1.50」「0.00」／他タブ「1.5」「-」
 * トレード日記として数値の信頼性が崩れるため、表示は必ずここを通す。
 */

/** 勝率。calcStats は小数1桁で返すので、末尾が .0 のときだけ整数に見せる */
export function formatWinRate(rate: number): string {
  if (!Number.isFinite(rate)) return '-';
  const r = Math.round(rate * 10) / 10;
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`;
}

/** pips。符号を明示し、小数1桁までを保つ */
export function formatPips(pips: number, withSign = true): string {
  if (!Number.isFinite(pips)) return '-';
  const p = Math.round(pips * 10) / 10;
  const body = Number.isInteger(p) ? String(p) : p.toFixed(1);
  return withSign && p > 0 ? `+${body}` : body;
}

/**
 * プロフィットファクター。
 *
 * 0 は「全敗（勝ちpipsが1つも無い）」であって「データなし」ではない。
 * 以前は 0 を '-' に落としており、最も改善が必要な月ほど情報が消えていた。
 * 取引が無い場合は呼び出し側で hasTrades=false を渡すこと。
 */
export function formatPF(pf: number, hasTrades = true): string {
  if (!hasTrades) return '-';
  if (!Number.isFinite(pf)) return t('pf_no_loss');
  return pf.toFixed(2);
}

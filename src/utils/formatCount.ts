import { lang, t } from '../i18n';

/**
 * 見出しに添える件数を「（3件）」「 (3)」のように整形する。
 *
 * 以前は JSX に全角括弧を直書きしており、**11言語すべてで全角**になっていた。
 * ラテン文字圏では見た目が不自然なうえ、前後にスペースが入らず詰まって見える。
 * 括弧の種類と空白の入れ方は言語で違うので、1箇所にまとめる。
 */
export function formatCount(n: number): string {
  const unit = t('count_unit');
  // 日本語・中国語系は全角括弧で前後にスペースを入れない。
  if (lang === 'ja') return `（${n}${unit}）`;
  return ` (${n}${unit ? unit : ''})`;
}

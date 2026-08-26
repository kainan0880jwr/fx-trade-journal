import { lang } from '../i18n';

const BASE_URL = 'https://kainan0880jwr.github.io/fx-trade-journal/';

// 日本語版のみサフィックスなし(privacy-policy.html)。他10言語は
// -en / -de / -fr / -es / -it / -id / -tr / -hi / -vi / -pt のファイルが存在する。
const suffix = lang === 'ja' ? '' : `-${lang}`;

export const PRIVACY_POLICY_URL = `${BASE_URL}privacy-policy${suffix}.html`;
export const TERMS_URL = `${BASE_URL}terms${suffix}.html`;

// 特定商取引法に基づく表記は日本国内向けの表示義務であり、翻訳版は用意していない。
// 他言語ユーザーに意味の分からない日本語ページを見せても有害なだけなので、日本語ロケール以外では
// 表示自体をしない(呼び出し側で null チェックする)。
export const TOKUSHOHO_URL = lang === 'ja' ? `${BASE_URL}tokushoho.html` : null;

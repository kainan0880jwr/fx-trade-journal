import { formatMoney, moneySuffix } from '../formatMoney';

jest.mock('../../i18n', () => ({ lang: 'ja' }));

describe('formatMoney（日本語）', () => {
  it('プラスには符号と「円」を付ける', () => {
    expect(formatMoney(10000)).toBe('+10,000円');
  });
  it('マイナスはそのまま', () => {
    expect(formatMoney(-3500)).toBe('-3,500円');
  });
  it('0に符号は付けない', () => {
    expect(formatMoney(0)).toBe('0円');
  });
  it('符号を出さない指定ができる（リスク額など）', () => {
    expect(formatMoney(10000, false)).toBe('10,000円');
  });
  it('小数は四捨五入する', () => {
    expect(formatMoney(1234.6)).toBe('+1,235円');
  });
  it('数値でなければ -', () => {
    expect(formatMoney(NaN)).toBe('-');
    expect(formatMoney(Infinity)).toBe('-');
  });
  it('回帰: 同じ画面で ¥ と 円 が混在しないこと', () => {
    // 以前は月次タブの合計が「+10,000円」、直下の表が「+10,000¥」だった
    expect(formatMoney(10000)).toBe(moneySuffix() === '円' ? '+10,000円' : '+10,000¥');
  });
});

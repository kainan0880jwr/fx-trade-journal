import { formatWinRate, formatPips, formatPF } from '../formatStats';

jest.mock('../../i18n', () => ({ t: (k: string) => (k === 'pf_no_loss' ? '負けなし' : k) }));

describe('formatWinRate', () => {
  it('小数がある場合は1桁で出す', () => {
    expect(formatWinRate(66.7)).toBe('66.7%');
  });
  it('整数のときは小数を付けない', () => {
    expect(formatWinRate(50)).toBe('50%');
    expect(formatWinRate(0)).toBe('0%');
  });
  it('画面ごとに 67% と 66.7% に割れないこと（回帰）', () => {
    expect(formatWinRate(66.66666)).toBe('66.7%');
  });
});

describe('formatPips', () => {
  it('プラスには符号を付ける', () => {
    expect(formatPips(25)).toBe('+25');
    expect(formatPips(24.5)).toBe('+24.5');
  });
  it('マイナスはそのまま', () => {
    expect(formatPips(-10.5)).toBe('-10.5');
  });
  it('0に符号は付けない', () => {
    expect(formatPips(0)).toBe('0');
  });
  it('小数が丸め落とされないこと（回帰: 記録タブが +25、月次が +24.5 になっていた）', () => {
    expect(formatPips(24.5)).not.toBe('+25');
  });
});

describe('formatPF', () => {
  it('常に小数2桁で揃える', () => {
    expect(formatPF(1.5)).toBe('1.50');
    expect(formatPF(2)).toBe('2.00');
  });
  it('全敗(0)は「データなし」ではなく 0.00 として出す', () => {
    expect(formatPF(0)).toBe('0.00');
  });
  it('取引が無いときだけ - を出す', () => {
    expect(formatPF(0, false)).toBe('-');
  });
  it('損失0のときは自然文にする（Infinityを出さない）', () => {
    expect(formatPF(Infinity)).toBe('負けなし');
  });
});

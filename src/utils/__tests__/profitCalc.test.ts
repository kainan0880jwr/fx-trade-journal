import { calcProfitLoss, determineResult } from '../profitCalc';

/**
 * クロス円は pipDigits=2（1pip = 0.01円）。
 * 取引通貨数 = lotSize × lotUnit（設定の「1ロット = 何通貨」）。
 * したがって 損益 = pips × 0.01 × lotSize × lotUnit。
 *
 * 以前は ÷10 で実装されており、表示・保存される損益がすべて10倍だった。
 */
describe('calcProfitLoss', () => {
  it('0.1ロット×10000通貨単位（=1,000通貨）で+50pipsなら500円', () => {
    // 1,000通貨 × 0.50円 = 500円
    expect(calcProfitLoss(50, 0.1, 10000)).toBe(500);
  });

  it('1ロット×10000通貨単位（=10,000通貨）で+50pipsなら5,000円', () => {
    expect(calcProfitLoss(50, 1, 10000)).toBe(5000);
  });

  it('負けは負の損益になる', () => {
    expect(calcProfitLoss(-30, 0.1, 10000)).toBe(-300);
  });

  it('ロット単位が1000（1000通貨単位の口座）でも比例する', () => {
    expect(calcProfitLoss(50, 1, 1000)).toBe(500);
  });

  it('ロット単位が100000（標準ロット）でも比例する', () => {
    expect(calcProfitLoss(10, 1, 100000)).toBe(10000);
  });

  it('pipsが0なら0', () => {
    expect(calcProfitLoss(0, 1, 10000)).toBe(0);
  });

  it('小数pipsも扱える', () => {
    // 20.5pips × 0.01 × 1,000通貨 = 205円
    expect(calcProfitLoss(20.5, 0.1, 10000)).toBe(205);
  });

  it('回帰: 旧実装(÷10)の値になっていないこと', () => {
    // 旧実装なら 5000 を返していた
    expect(calcProfitLoss(50, 0.1, 10000)).not.toBe(5000);
  });
});

describe('determineResult', () => {
  it('pipsの符号から結果を判定する', () => {
    expect(determineResult(10)).toBe('win');
    expect(determineResult(-10)).toBe('loss');
    expect(determineResult(0)).toBe('even');
  });

  it('微小な値でも符号どおりに判定する', () => {
    expect(determineResult(0.1)).toBe('win');
    expect(determineResult(-0.1)).toBe('loss');
  });
});

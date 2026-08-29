import { parseDecimal } from '../parseDecimal';

describe('parseDecimal', () => {
  it('通常の半角小数を読める', () => {
    expect(parseDecimal('155.20')).toBe(155.2);
    expect(parseDecimal('0.1')).toBe(0.1);
  });

  it('カンマ小数点を読める（対応11言語中8言語がカンマ圏）', () => {
    expect(parseDecimal('155,20')).toBe(155.2);
    expect(parseDecimal('0,5')).toBe(0.5);
    expect(parseDecimal('1,08532')).toBe(1.08532);
  });

  it('回帰: 旧実装(parseFloat)の誤った結果になっていないこと', () => {
    // parseFloat("155,20") は 155 を返していた
    expect(parseDecimal('155,20')).not.toBe(155);
    // parseFloat("0,5") は 0 を返し、ロット検証で弾かれていた
    expect(parseDecimal('0,5')).not.toBe(0);
  });

  it('全角数字・全角記号を読める', () => {
    expect(parseDecimal('１５５．２')).toBe(155.2);
    expect(parseDecimal('１５５，２')).toBe(155.2);
    expect(parseDecimal('－３０')).toBe(-30);
  });

  it('負の値を読める', () => {
    expect(parseDecimal('-30')).toBe(-30);
    expect(parseDecimal('-30,5')).toBe(-30.5);
  });

  it('空・空白・nullは null', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });

  it('数値でない入力は null', () => {
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('-')).toBeNull();
    expect(parseDecimal('.')).toBeNull();
    // parseFloat は 1.2 を返して黙って受け入れていた
    expect(parseDecimal('1.2.3')).toBeNull();
    expect(parseDecimal('20.5.3')).toBeNull();
  });

  it('Infinityにつながる入力を弾く（統計を壊さないため）', () => {
    expect(parseDecimal('1e999')).toBeNull();
    expect(parseDecimal('Infinity')).toBeNull();
  });
});

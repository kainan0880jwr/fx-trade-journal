import { num, calcPips, resultFromProfit, normalizePair, detectSep, parseDate } from '../mt4Import';

jest.mock('../../i18n', () => ({ t: (k: string) => k, tArr: () => [] }));

describe('num（数値パース）', () => {
  it('通常のCSV（カンマは桁区切り）', () => {
    expect(num('1,234.56')).toBe(1234.56);
    expect(num('-50')).toBe(-50);
    expect(num('0.1')).toBe(0.1);
  });

  it('カンマ小数点のCSV（欧州系ブローカー）', () => {
    // 取り違えると "0,5" ロットが 5 になり損益が10倍になる
    expect(num('0,5', true)).toBe(0.5);
    expect(num('123,45', true)).toBe(123.45);
    expect(num('-1.234,56', true)).toBe(-1234.56);
    expect(num('1.234.567,89', true)).toBe(1234567.89);
  });

  it('Infinity・巨大値・パース不能は0にする（統計をNaNで汚さない）', () => {
    expect(num('1e999')).toBe(0);
    expect(num('99999999999')).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num('')).toBe(0);
  });
});

describe('detectSep', () => {
  it('タブ・セミコロン・カンマを見分ける', () => {
    expect(detectSep('a\tb\tc')).toBe('\t');
    expect(detectSep('a;b;c')).toBe(';');
    expect(detectSep('a,b,c')).toBe(',');
  });

  it('セミコロン区切りはカンマ小数点の目印になる', () => {
    expect(detectSep('Time;Symbol;Profit')).toBe(';');
  });
});

describe('calcPips', () => {
  it('クロス円は2桁', () => {
    expect(calcPips('USD/JPY', 150.00, 150.50, 'buy')).toBe(50);
    expect(calcPips('USD/JPY', 150.00, 150.50, 'sell')).toBe(-50);
  });

  it('ドルストレートは4桁', () => {
    expect(calcPips('EUR/USD', 1.0850, 1.0900, 'buy')).toBe(50);
  });

  it('クロス円かどうかは決済通貨で決める（JPY/xxx を誤判定しない）', () => {
    // 名前に JPY が含まれるかだけで見ると EUR/JPY 以外も巻き込む
    expect(calcPips('EUR/JPY', 160.00, 160.50, 'buy')).toBe(50);
  });

  it('為替以外の銘柄は pips を出さない（null）', () => {
    // MT5のDealsには金・指数が普通に混ざる。10000倍すると1件で統計が壊れる
    expect(calcPips('XAU/USD', 2650.00, 2660.00, 'buy')).toBeNull();
    expect(calcPips('US30', 38000, 38100, 'buy')).toBeNull();
    expect(calcPips('BTC/USD', 60000, 61000, 'buy')).toBeNull();
  });
});

describe('resultFromProfit', () => {
  it('符号で勝敗を決め、0は引き分け', () => {
    expect(resultFromProfit(100)).toBe('win');
    expect(resultFromProfit(-100)).toBe('loss');
    expect(resultFromProfit(0)).toBe('even');
  });

  it('手数料負けは負けとして扱えること（呼び出し側が実損益を渡す前提）', () => {
    // profit=+150, commission=-200 → 実損益 -50
    expect(resultFromProfit(150 + 0 + -200)).toBe('loss');
    // profit=-50, swap=+200 → 実損益 +150
    expect(resultFromProfit(-50 + 200 + 0)).toBe('win');
  });
});

describe('normalizePair', () => {
  it('6文字表記をスラッシュ区切りに直す', () => {
    expect(normalizePair('USDJPY')).toBe('USD/JPY');
    expect(normalizePair('usdjpy')).toBe('USD/JPY');
    expect(normalizePair('USD/JPY')).toBe('USD/JPY');
  });

  it('記号を含む値は空にする', () => {
    expect(normalizePair('<script>')).toBe('');
    expect(normalizePair('US D/JPY')).toBe('');
  });

  it('長い銘柄名は先頭6文字で切り出される（既知の仕様）', () => {
    // 為替ペアとしては無意味な結果になるが、FX_CURRENCIES に無いため
    // calcPips は null を返し、統計は壊れない
    expect(normalizePair('A'.repeat(40))).toBe('AAA/AAA');
    expect(calcPips('AAA/AAA', 1, 2, 'buy')).toBeNull();
  });
});

describe('parseDate', () => {
  it('MT4形式とISO形式を受ける', () => {
    expect(parseDate('2024.01.15 10:23')).toBe('2024-01-15');
    expect(parseDate('2024-01-15T10:23:00')).toBe('2024-01-15');
  });

  it('不正な日付は null（「今日」に化けさせない）', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
});

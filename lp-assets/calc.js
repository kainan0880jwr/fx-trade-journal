// 計算機ページ（fx-*-calculator(-en).html）の計算と画面のつなぎ込み。2026-11-19
//
// - 計算は下の純粋関数だけで行う（jest から require して数値を確かめる: scripts/__tests__/calcPages.test.ts）。
// - 外部への送信はしない。fetch・XHR・sendBeacon・eval などを使わない（同じテストが見張る）。
//   換算レートは利用者が入力する（相場を取りに行かない）。
// - CSP の都合でインラインスクリプトは使えないので、ページは <script src="lp-assets/calc.js" defer> で読む。
//   JS が動かなくても、説明文と式は HTML の本文で読める。
(function () {
  'use strict';

  /** 換算レートの表記の順（市場の慣習。前にある通貨が基軸側になる。EUR/USD・GBP/JPY・AUD/USD・USD/JPY など） */
  var CURRENCY_ORDER = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
  /** 金額の小数の桁（円は整数、ほかはセント） */
  var MONEY_DIGITS = { JPY: 0 };
  /** 取引できる最小のロット（アプリの src/utils/lotCalc.ts の MIN_LOT と同じ） */
  var MIN_LOT = 0.01;
  /** 浮動小数の誤差で 0.6 が 0.59 に切り捨てられないための余裕 */
  var EPS = 1e-9;

  /** 全角数字・全角の記号・桁区切りのカンマを受け付けて数値にする。読めなければ NaN */
  function parseNum(s) {
    if (typeof s === 'number') return s;
    if (s == null) return NaN;
    var t = String(s)
      .replace(/[０-９．－，]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[,\s]/g, '')
      .replace(/[−–]/g, '-');
    if (t === '' || !/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return Number(t);
  }

  /** 'EUR/USD' → { base: 'EUR', quote: 'USD' } */
  function parsePair(pair) {
    var m = /^([A-Z]{3})\/([A-Z]{3})$/.exec(String(pair));
    if (!m || m[1] === m[2]) return null;
    return { base: m[1], quote: m[2] };
  }

  /** 1 pip の値幅。決済通貨（右側）が円なら 0.01、それ以外は 0.0001（アプリの取り込みと同じ考え方） */
  function pipSize(quote) {
    return quote === 'JPY' || quote === 'HUF' ? 0.01 : 0.0001;
  }

  /**
   * 決済通貨 from を口座通貨 to に換算するのに要るレートの表記。
   * 例: from=USD, to=JPY → { pair: 'USD/JPY', invert: false }（1 USD = レート 円）
   *     from=JPY, to=USD → { pair: 'USD/JPY', invert: true }（1 円 = 1 ÷ レート ドル）
   * 同じ通貨なら null（換算しない）。
   */
  function conversionPair(from, to) {
    if (from === to) return null;
    var a = CURRENCY_ORDER.indexOf(from);
    var b = CURRENCY_ORDER.indexOf(to);
    if (a < 0 || b < 0) return undefined;
    return a < b ? { pair: from + '/' + to, invert: false } : { pair: to + '/' + from, invert: true };
  }

  /** 決済通貨 1 単位が口座通貨でいくらか。同じ通貨なら 1、レートが無効なら NaN */
  function quoteToAccount(quote, account, rate) {
    var c = conversionPair(quote, account);
    if (c === null) return 1;
    if (c === undefined || !(rate > 0)) return NaN;
    return c.invert ? 1 / rate : rate;
  }

  /** 口座通貨の金額を表示の桁で丸める（円は整数、ほかは小数第2位。負の .5 も絶対値で丸める） */
  function roundMoney(v, currency) {
    var d = Object.prototype.hasOwnProperty.call(MONEY_DIGITS, currency) ? MONEY_DIGITS[currency] : 2;
    var f = Math.pow(10, d);
    var r = Math.round(Math.abs(v) * f + EPS) / f;
    return v < 0 && r !== 0 ? -r : r;
  }

  /** pips を 0.1 単位に丸める（アプリの roundPips と同じ。符号に関係なく絶対値で丸める） */
  function roundPips(raw) {
    var r = Math.round(Math.abs(raw) * 10 + EPS) / 10;
    return raw < 0 && r !== 0 ? -r : r;
  }

  /** 1ロット・1 pip あたりの価値（口座通貨）。換算できなければ NaN */
  function pipValuePerLot(pair, lotUnits, account, rate) {
    var p = parsePair(pair);
    if (!p || !(lotUnits > 0)) return NaN;
    return pipSize(p.quote) * lotUnits * quoteToAccount(p.quote, account, rate);
  }

  /**
   * ロット計算。許容損失（残高 × %）÷（損切り pips × 1ロット 1pip の価値）を 0.01 ロット単位で切り捨てる。
   * 切り捨てなので、出したロットで損切りになったときの損失は許容損失を超えない（最小ロットで止めたときを除く）。
   * @returns {{ ok: true, riskAmount, pipValue, lot, units, lossAtLot, belowMin } | { ok: false, error }}
   */
  function lotSize(o) {
    var balance = parseNum(o.balance), riskPct = parseNum(o.riskPct), slPips = parseNum(o.slPips);
    var lotUnits = parseNum(o.lotUnits), rate = parseNum(o.rate);
    if (!(balance > 0)) return { ok: false, error: 'balance' };
    if (!(riskPct > 0 && riskPct <= 100)) return { ok: false, error: 'riskPct' };
    if (!(slPips > 0)) return { ok: false, error: 'slPips' };
    var p = parsePair(o.pair);
    if (!p) return { ok: false, error: 'pair' };
    if (!(lotUnits > 0)) return { ok: false, error: 'lotUnits' };
    var pipValue = pipValuePerLot(o.pair, lotUnits, o.account, rate);
    if (!(pipValue > 0)) return { ok: false, error: 'rate' };
    var riskAmount = balance * riskPct / 100;
    var raw = riskAmount / (slPips * pipValue);
    var belowMin = raw + EPS < MIN_LOT;
    var lot = belowMin ? MIN_LOT : Math.floor(raw * 100 + EPS) / 100;
    return {
      ok: true,
      riskAmount: roundMoney(riskAmount, o.account),
      pipValue: pipValue,
      rawLot: raw,
      lot: lot,
      units: Math.round(lot * lotUnits),
      lossAtLot: roundMoney(lot * slPips * pipValue, o.account),
      belowMin: belowMin,
    };
  }

  /**
   * pips と損益。買いは（決済 − エントリー）、売りは（エントリー − 決済）。
   * 損益（決済通貨）＝ 値幅 × ロット × 1ロットの通貨量。口座通貨と違えば換算レートを掛ける（または割る）。
   * 換算に要るレートが取引した通貨ペアそのもの（例: 米ドル口座で USD/JPY）でレートの入力が無いときは、決済レートで換算する。
   * @returns {{ ok: true, pips, plQuote, pl, quote, usedExitAsRate } | { ok: false, error }}
   */
  function pipsAndPL(o) {
    var p = parsePair(o.pair);
    if (!p) return { ok: false, error: 'pair' };
    if (o.direction !== 'buy' && o.direction !== 'sell') return { ok: false, error: 'direction' };
    var entry = parseNum(o.entry), exit = parseNum(o.exit), lots = parseNum(o.lots), lotUnits = parseNum(o.lotUnits);
    if (!(entry > 0)) return { ok: false, error: 'entry' };
    if (!(exit > 0)) return { ok: false, error: 'exit' };
    if (!(lots > 0)) return { ok: false, error: 'lots' };
    if (!(lotUnits > 0)) return { ok: false, error: 'lotUnits' };
    var diff = o.direction === 'buy' ? exit - entry : entry - exit;
    var pips = roundPips(diff / pipSize(p.quote));
    var plQuote = diff * lots * lotUnits;
    var rate = parseNum(o.rate);
    var conv = conversionPair(p.quote, o.account);
    var usedExitAsRate = false;
    if (conv && conv.pair === o.pair && !(rate > 0)) { rate = exit; usedExitAsRate = true; }
    var factor = quoteToAccount(p.quote, o.account, rate);
    if (!(factor > 0)) return { ok: false, error: 'rate', pips: pips, plQuote: roundMoney(plQuote, p.quote), quote: p.quote };
    return {
      ok: true,
      pips: pips,
      plQuote: roundMoney(plQuote, p.quote),
      pl: roundMoney(plQuote * factor, o.account),
      quote: p.quote,
      usedExitAsRate: usedExitAsRate,
    };
  }

  /** 損益分岐勝率 ＝ 1 ÷（1 ＋ RR）。0〜1 の割合で返す（記事 fx-win-rate-risk-reward-guide.html と同じ式） */
  function breakevenWinRate(rr) {
    rr = parseNum(rr);
    return rr > 0 ? 1 / (1 + rr) : NaN;
  }

  /** 損益分岐 RR ＝（1 − 勝率）÷ 勝率。勝率は 0〜1 の割合 */
  function breakevenRR(winRate) {
    return winRate > 0 && winRate < 1 ? (1 - winRate) / winRate : NaN;
  }

  /** 1回あたりの期待値（平均損失を 1R とした単位）＝ 勝率 × RR −（1 − 勝率）。勝率は 0〜1 の割合 */
  function expectancyR(winRate, rr) {
    if (!(winRate >= 0 && winRate <= 1) || !(rr > 0)) return NaN;
    return winRate * rr - (1 - winRate);
  }

  /**
   * 損益分岐勝率と期待値の目安。winRatePct（%）は任意、avgLoss（1回の平均損失。pips でも金額でもよい）も任意。
   * @returns {{ ok: true, breakeven, breakevenRR?, expectancyR?, expectancy?, margin? } | { ok: false, error }}
   */
  function breakeven(o) {
    var rr = parseNum(o.rr);
    if (!(rr > 0)) return { ok: false, error: 'rr' };
    var out = { ok: true, breakeven: breakevenWinRate(rr) };
    var hasWin = o.winRatePct != null && String(o.winRatePct).trim() !== '';
    if (!hasWin) return out;
    var pct = parseNum(o.winRatePct);
    if (!(pct >= 0 && pct <= 100)) return { ok: false, error: 'winRate' };
    var p = pct / 100;
    out.breakevenRR = breakevenRR(p);
    out.expectancyR = expectancyR(p, rr);
    out.margin = p - out.breakeven;
    var hasLoss = o.avgLoss != null && String(o.avgLoss).trim() !== '';
    if (hasLoss) {
      var loss = parseNum(o.avgLoss);
      if (!(loss > 0)) return { ok: false, error: 'avgLoss' };
      out.expectancy = out.expectancyR * loss;
    }
    return out;
  }

  var Calc = {
    MIN_LOT: MIN_LOT,
    parseNum: parseNum,
    parsePair: parsePair,
    pipSize: pipSize,
    conversionPair: conversionPair,
    quoteToAccount: quoteToAccount,
    roundMoney: roundMoney,
    roundPips: roundPips,
    pipValuePerLot: pipValuePerLot,
    lotSize: lotSize,
    pipsAndPL: pipsAndPL,
    breakevenWinRate: breakevenWinRate,
    breakevenRR: breakevenRR,
    expectancyR: expectancyR,
    breakeven: breakeven,
  };

  if (typeof module === 'object' && module && module.exports) module.exports = Calc;
  if (typeof document === 'undefined') return;

  // ---------------- ここから画面（ブラウザのときだけ） ----------------

  var LANG = (document.documentElement.getAttribute('lang') || 'ja').slice(0, 2) === 'en' ? 'en' : 'ja';
  var T = {
    ja: {
      balance: '口座残高を入力してください。',
      riskPct: '許容損失は 0 より大きく 100 以下の % で入力してください。',
      slPips: '損切りの幅（pips）を入力してください。',
      pair: '通貨ペアを選んでください。',
      rate: '換算レートを入力してください。',
      entry: 'エントリーのレートを入力してください。',
      exit: '決済のレートを入力してください。',
      lots: 'ロット数を入力してください。',
      lotUnits: '1ロットの通貨量を選んでください。',
      direction: '売買の方向を選んでください。',
      rr: 'リスクリワード（RR）を 0 より大きい数で入力してください。',
      winRate: '勝率は 0〜100 の % で入力してください。',
      avgLoss: '1回の平均損失は 0 より大きい数で入力してください（空欄でも計算できます）。',
      rateLabel: function (pair) { return '換算レート（' + pair + '）'; },
      rateHint: function (q, a, pair, inv) {
        return '損益は' + q + 'で出るので、口座通貨（' + a + '）に直すために ' + pair + ' のレートを使います' + (inv ? '（' + pair + ' のレートで割ります）' : '（' + pair + ' のレートを掛けます）') + '。';
      },
      rateHintSelf: function (pair) { return '空欄なら決済レート（' + pair + '）で換算します。'; },
      units: '通貨',
      lotUnit: 'ロット',
      lotResult: function (r, c) {
        return [
          ['ロット数の目安', fmt(r.lot, 2) + ' ロット（' + fmt(r.units, 0) + ' 通貨）'],
          ['許容損失', money(r.riskAmount, c)],
          ['1ロット・1pipの価値', money(roundMoneyShow(r.pipValue, c), c)],
          ['このロットで損切りになったときの損失', money(r.lossAtLot, c)],
        ];
      },
      belowMin: '計算上のロットが最小の 0.01 ロットより小さいため、0.01 ロットにしています。この場合、損切りになったときの損失は許容損失を超えます。',
      pipsResult: function (r, c) {
        var rows = [['pips', signed(r.pips, 1) + ' pips'], ['損益（' + r.quote + '）', money(r.plQuote, r.quote, true)]];
        if (r.ok && r.quote !== c) rows.push(['損益（口座通貨 ' + c + '）', money(r.pl, c, true)]);
        return rows;
      },
      usedExit: '換算レートが空欄のため、決済レートで換算しました。',
      beResult: function (r) {
        var rows = [['損益分岐勝率', pct(r.breakeven)]];
        if (r.expectancyR != null) {
          rows.push(['勝率と損益分岐勝率の差', signed(r.margin * 100, 1) + ' ポイント']);
          rows.push(['1回あたりの期待値の目安', signed(r.expectancyR, 2) + ' R（平均損失を 1 としたとき）']);
          rows.push(['この勝率で損益ゼロになるRR', isFinite(r.breakevenRR) ? fmt(r.breakevenRR, 2) : '—']);
        }
        if (r.expectancy != null) rows.push(['1回あたりの期待値の目安（入力した単位）', signed(r.expectancy, 2)]);
        return rows;
      },
      beNote: '過去の記録から出した勝率・RRの読み方の目安であり、今後の結果を示すものではありません。',
    },
    en: {
      balance: 'Enter your account balance.',
      riskPct: 'Enter the risk as a percentage greater than 0 and up to 100.',
      slPips: 'Enter the stop-loss distance in pips.',
      pair: 'Choose a currency pair.',
      rate: 'Enter the conversion rate.',
      entry: 'Enter the entry price.',
      exit: 'Enter the exit price.',
      lots: 'Enter the position size in lots.',
      lotUnits: 'Choose the units per lot.',
      direction: 'Choose buy or sell.',
      rr: 'Enter a risk-reward (RR) greater than 0.',
      winRate: 'Enter the win rate as a percentage from 0 to 100.',
      avgLoss: 'Enter an average loss greater than 0 (or leave it blank).',
      rateLabel: function (pair) { return 'Conversion rate (' + pair + ')'; },
      rateHint: function (q, a, pair, inv) {
        return 'P/L comes out in ' + q + ', so the ' + pair + ' rate is used to convert it to your account currency (' + a + ')' + (inv ? ' — the amount is divided by it.' : ' — the amount is multiplied by it.');
      },
      rateHintSelf: function (pair) { return 'Leave blank to convert at the exit price (' + pair + ').'; },
      units: 'units',
      lotUnit: 'lots',
      lotResult: function (r, c) {
        return [
          ['Position size (estimate)', fmt(r.lot, 2) + ' lots (' + fmt(r.units, 0) + ' units)'],
          ['Amount at risk', money(r.riskAmount, c)],
          ['Value of 1 pip per lot', money(roundMoneyShow(r.pipValue, c), c)],
          ['Loss if the stop is hit at this size', money(r.lossAtLot, c)],
        ];
      },
      belowMin: 'The calculated size is below the 0.01-lot minimum, so 0.01 lots is shown. At this size a stop-out would lose more than the amount at risk.',
      pipsResult: function (r, c) {
        var rows = [['Pips', signed(r.pips, 1) + ' pips'], ['P/L (' + r.quote + ')', money(r.plQuote, r.quote, true)]];
        if (r.ok && r.quote !== c) rows.push(['P/L (account currency, ' + c + ')', money(r.pl, c, true)]);
        return rows;
      },
      usedExit: 'No conversion rate was entered, so the exit price was used.',
      beResult: function (r) {
        var rows = [['Break-even win rate', pct(r.breakeven)]];
        if (r.expectancyR != null) {
          rows.push(['Win rate minus break-even', signed(r.margin * 100, 1) + ' points']);
          rows.push(['Expectancy per trade (estimate)', signed(r.expectancyR, 2) + ' R (average loss = 1)']);
          rows.push(['RR that breaks even at this win rate', isFinite(r.breakevenRR) ? fmt(r.breakevenRR, 2) : '—']);
        }
        if (r.expectancy != null) rows.push(['Expectancy per trade (in the unit you entered)', signed(r.expectancy, 2)]);
        return rows;
      },
      beNote: 'This is a way to read win rate and RR from past records. It does not predict future results.',
    },
  }[LANG];

  function fmt(v, d) {
    return Number(v).toLocaleString(LANG === 'en' ? 'en-US' : 'ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function signed(v, d) { return (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d); }
  function digits(c) { return Object.prototype.hasOwnProperty.call(MONEY_DIGITS, c) ? MONEY_DIGITS[c] : 2; }
  /** 1pip の価値は小さい数（例: 6.67 ドル、0.67 円）になりうるので、表示は円でも小数第2位まで */
  function roundMoneyShow(v) { return Math.round(v * 100) / 100; }
  function money(v, c, withSign) {
    var d = digits(c);
    if (Math.round(v) !== v) d = Math.max(d, 2);
    return (withSign ? signed(v, d) : fmt(v, d)) + ' ' + c;
  }
  function pct(v) { return fmt(v * 100, 1) + '%'; }

  function val(form, name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el.length && !el.tagName) { // ラジオボタンの組
      for (var i = 0; i < el.length; i++) if (el[i].checked) return el[i].value;
      return '';
    }
    return el.value;
  }

  function render(out, rows, notes, error) {
    while (out.firstChild) out.removeChild(out.firstChild);
    if (error) {
      var p = document.createElement('p');
      p.className = 'calc-error';
      p.textContent = error;
      out.appendChild(p);
      return;
    }
    var dl = document.createElement('dl');
    dl.className = 'calc-dl';
    rows.forEach(function (r, i) {
      var dt = document.createElement('dt');
      dt.textContent = r[0];
      var dd = document.createElement('dd');
      dd.textContent = r[1];
      if (i === 0) dd.className = 'calc-main';
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    out.appendChild(dl);
    (notes || []).forEach(function (n) {
      var p = document.createElement('p');
      p.className = 'calc-sub';
      p.textContent = n;
      out.appendChild(p);
    });
  }

  /** 換算レートの欄の見出し・説明・表示を、通貨ペアと口座通貨に合わせて書き換える */
  function syncRateField(form, selfPairUsesExit) {
    var wrap = form.querySelector('[data-rate-field]');
    if (!wrap) return;
    var p = parsePair(val(form, 'pair'));
    var account = val(form, 'account');
    var c = p ? conversionPair(p.quote, account) : null;
    wrap.hidden = !c;
    if (!c) return;
    var label = wrap.querySelector('[data-rate-label]');
    var hint = wrap.querySelector('[data-rate-hint]');
    if (label) label.textContent = T.rateLabel(c.pair);
    var h = T.rateHint(p.quote, account, c.pair, c.invert);
    if (selfPairUsesExit && c.pair === val(form, 'pair')) h += ' ' + T.rateHintSelf(c.pair);
    if (hint) hint.textContent = h;
  }

  function update(form) {
    var out = form.querySelector('.calc-result');
    var kind = form.getAttribute('data-calc');
    var account = val(form, 'account');
    var r;
    if (kind === 'lot') {
      syncRateField(form, false);
      r = lotSize({ balance: val(form, 'balance'), riskPct: val(form, 'riskPct'), slPips: val(form, 'slPips'),
        pair: val(form, 'pair'), account: account, lotUnits: val(form, 'lotUnits'), rate: val(form, 'rate') });
      if (!r.ok) return render(out, null, null, T[r.error]);
      return render(out, T.lotResult(r, account), r.belowMin ? [T.belowMin] : []);
    }
    if (kind === 'pips') {
      syncRateField(form, true);
      r = pipsAndPL({ pair: val(form, 'pair'), direction: val(form, 'direction'), entry: val(form, 'entry'), exit: val(form, 'exit'),
        lots: val(form, 'lots'), lotUnits: val(form, 'lotUnits'), account: account, rate: val(form, 'rate') });
      if (!r.ok && r.error !== 'rate') return render(out, null, null, T[r.error]);
      return render(out, T.pipsResult(r, account), r.ok ? (r.usedExitAsRate ? [T.usedExit] : []) : [T.rate]);
    }
    if (kind === 'breakeven') {
      r = breakeven({ rr: val(form, 'rr'), winRatePct: val(form, 'winRate'), avgLoss: val(form, 'avgLoss') });
      if (!r.ok) return render(out, null, null, T[r.error]);
      return render(out, T.beResult(r), r.expectancyR != null ? [T.beNote] : []);
    }
  }

  function init() {
    var forms = document.querySelectorAll('form[data-calc]');
    for (var i = 0; i < forms.length; i++) {
      (function (form) {
        form.addEventListener('submit', function (e) { e.preventDefault(); update(form); });
        form.addEventListener('input', function () { update(form); });
        form.addEventListener('change', function () { update(form); });
        form.classList.add('calc-ready');
        update(form);
      })(forms[i]);
    }
  }

  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  } catch (e) {
    // 計算機が動かなくても、本文（説明と式）は読める
  }
})();

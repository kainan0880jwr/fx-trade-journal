// FX Trade Journal — landing page
// 画面下の固定ボタン（#stickyCta）だけを扱う。本文は JS が無くても全部読める。
// 出す条件: 同意バナーが閉じている／ヒーローのボタンと最後のボタンがどちらも画面外／
// iOS の Safari ではない（Safari は上部にアプリのバナーが出るため）／幅 860px 以下（CSS 側）。
(function () {
  'use strict';
  try {
    var bar = document.getElementById('stickyCta');
    var hero = document.querySelector('.hero-actions');
    var fin = document.getElementById('download');
    var consent = document.getElementById('consentBanner');
    if (!bar || !hero || !fin || !('IntersectionObserver' in window)) return;

    var ua = navigator.userAgent;
    var iosSafari = /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) &&
      !/CriOS|FxiOS|EdgiOS|GSA|Line\/|FBAN|FBAV|Instagram|Twitter/.test(ua);
    if (iosSafari) return;

    var heroVisible = true;
    var finVisible = false;

    function update() {
      var consentOpen = consent && !consent.hidden;
      var show = !heroVisible && !finVisible && !consentOpen;
      if (show) {
        bar.hidden = false;
        // hidden を外した次の描画で動かす（transform だけを変える）
        requestAnimationFrame(function () { bar.classList.add('is-shown'); });
      } else {
        bar.classList.remove('is-shown');
        bar.hidden = true;
      }
    }

    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      update();
    }).observe(hero);
    new IntersectionObserver(function (entries) {
      finVisible = entries[0].isIntersecting;
      update();
    }).observe(fin);
    if (consent && 'MutationObserver' in window) {
      new MutationObserver(update).observe(consent, { attributes: true, attributeFilter: ['hidden'] });
    }
  } catch (e) {
    // 固定ボタンが出ないだけで、本文と他のボタンには影響しない
  }
})();

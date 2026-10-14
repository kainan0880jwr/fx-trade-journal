(function(){
  var KEY = 'ga_consent';
  var GA_ID = 'G-S3HNGHT6YJ';
  var banner = document.getElementById('consentBanner');
  var loaded = false;
  var saved;
  try { saved = localStorage.getItem(KEY); } catch(e) { saved = null; }

  // gtag.js の <script> をここで初めて作る。以前は head に静的に置いていたが、
  // それだと同意を拒否した人でも取得のHTTPリクエストが Google に飛び、
  // IP・User-Agent・Referer が渡っていた（プライバシーポリシーの記載とも食い違っていた）。
  // 同意が確定するまでスクリプト自体を読み込まないので、本当に何も送信されない。
  function startMeasurement(){
    if (loaded) return;
    loaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID);
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }

  // 撤回したときに、既に置かれた _ga / _ga_<ID> Cookie を失効させる。
  // 既に Google 側へ送られたデータは消えない（その旨はポリシーに記載）。
  function clearGaCookies(){
    var names = ['_ga', '_ga_' + GA_ID.replace('G-', ''), '_gid'];
    var host = location.hostname;
    for (var i = 0; i < names.length; i++) {
      document.cookie = names[i] + '=; Max-Age=0; path=/';
      document.cookie = names[i] + '=; Max-Age=0; path=/; domain=' + host;
    }
  }

  function setConsent(value){
    try { localStorage.setItem(KEY, value); } catch(e) {}
    if (value === 'granted') { startMeasurement(); }
    if (banner) { banner.hidden = true; }
  }

  if (saved === 'granted') {
    startMeasurement();
  } else if (saved !== 'denied' && banner) {
    banner.hidden = false;
  }

  var accept = document.getElementById('consentAccept');
  var decline = document.getElementById('consentDecline');
  if (accept) accept.addEventListener('click', function(){ setConsent('granted'); });
  if (decline) decline.addEventListener('click', function(){ setConsent('denied'); });

  // 撤回リンクはフッターにあり、このスクリプトの実行時点ではまだ DOM に無い。
  // 読み込み順に依存しないよう document 側で拾う。
  document.addEventListener('click', function(e){
    // closest で判定する。リンクの中に span やアイコンを入れると e.target が子要素になり、
    // id の一致だけでは撤回が黙って効かなくなる
    var t = e.target && e.target.closest ? e.target.closest('#consentReset') : null;
    if (!t) return;
    e.preventDefault();
    try { localStorage.removeItem(KEY); } catch(err) {}
    clearGaCookies();
    location.reload();
  });
})();

// ---- ストアへのボタンのクリック計測（2026-10-08。10/9 に main.js から移した） ----
// ガイド記事は main.js を読まないので、ガイドのボタン（data-cta="guide-*"）が数えられていなかった。
// consent.js は LP とガイドの両方が読む。
// それまで LP からインストールまでの流れが見えなかった（5か所のボタンが同じ ct で、クリックも送っていなかった）。
// 位置は data-cta、送るのは同意済み（consent.js が ga_consent=granted を保存）のときだけ。
// ページを離れる直前の送信なので beacon で送る。ほかの処理と独立させ、ここで失敗しても本文に影響しない。
(function(){
  document.addEventListener('click', function(e){
    try {
      var a = e.target && e.target.closest ? e.target.closest('a[data-cta]') : null;
      if (!a) return;
      if (localStorage.getItem('ga_consent') !== 'granted' || typeof gtag !== 'function') return;
      var href = a.getAttribute('href') || '';
      gtag('event', 'cta_click', {
        cta_position: a.getAttribute('data-cta'),
        store: href.indexOf('play.google.com') >= 0 ? 'google_play'
          : href.charAt(0) === '#' ? 'android_notice' : 'app_store',
        transport_type: 'beacon'
      });
    } catch (err) {}
  });
})();

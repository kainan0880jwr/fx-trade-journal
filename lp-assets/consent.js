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
    var t = e.target;
    if (!t || t.id !== 'consentReset') return;
    e.preventDefault();
    try { localStorage.removeItem(KEY); } catch(err) {}
    clearGaCookies();
    location.reload();
  });
})();

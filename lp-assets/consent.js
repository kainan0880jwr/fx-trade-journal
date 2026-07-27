(function(){
  var KEY = 'ga_consent';
  var banner = document.getElementById('consentBanner');
  var saved;
  try { saved = localStorage.getItem(KEY); } catch(e) { saved = null; }

  // gtag('config', ...) をここで初めて呼ぶ。同意が確定するまでは一切呼ばないため、
  // 「同意しない」場合はCookieなしの計測ピングも含めて本当に何も送信されない。
  function startMeasurement(){
    gtag('js', new Date());
    gtag('config', 'G-S3HNGHT6YJ');
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }

  if (saved === 'granted') {
    startMeasurement();
  } else if (saved !== 'denied') {
    banner.hidden = false;
  }

  document.getElementById('consentAccept').addEventListener('click', function(){
    try { localStorage.setItem(KEY, 'granted'); } catch(e) {}
    startMeasurement();
    banner.hidden = true;
  });
  document.getElementById('consentDecline').addEventListener('click', function(){
    try { localStorage.setItem(KEY, 'denied'); } catch(e) {}
    banner.hidden = true;
  });
})();

// 同意が確定するまで gtag('config', ...) を呼ばず、gtag.js の読み込みもしない。
// gtag.js の <script> は consent.js が同意後に動的に作る（head に静的に置くと、
// 拒否した人でも取得のリクエストが Google に飛んでしまう）。
// これにより「同意しない」場合はCookieなしの計測ピングも含めて一切送信されない。
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('consent', 'default', {
  'analytics_storage': 'denied',
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied'
});

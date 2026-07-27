// 同意が確定するまで gtag('config', ...) 自体を呼ばない。
// これにより「同意しない」場合はCookieなしの計測ピングも含めて一切送信されない。
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }
gtag('consent', 'default', {
  'analytics_storage': 'denied',
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied'
});

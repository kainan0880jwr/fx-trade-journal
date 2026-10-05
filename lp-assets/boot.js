// JSが生きていることを示すクラスを、スタイルシートより前に付ける。
//
// LPは13箇所の .reveal（問題提起・全機能・数値バンド・料金・FAQ・最終CTA、
// つまりヒーロー以外のほぼ全部）を opacity:0 で置き、main.js の
// IntersectionObserver が .in を付けて現す作りになっている。
// そのため **main.js が途中で例外を出すと、ページ本文が丸ごと白いまま**になり、
// App Store への導線も全部消える。CSPの都合でインラインスクリプトは使えないので、
// head から読む最小の外部スクリプトでクラスを付け、CSS側は
// 「JSがあるときだけ隠す」ようにしておく。
document.documentElement.classList.add('js');

// Android 版はクローズドテスト中のため、Android の端末にだけテスター募集の案内を出す
// （.android-notice。CSS 側で html.android のときだけ表示する）。
// 募集の投稿は `#android` 付きのリンクで来るので、そのときは端末に関係なく出す。
// 以前は iPhone や PC で投稿のリンクを開くと、何の案内も無い LP に着地していた（2026-10-05）。
if (/Android/i.test(navigator.userAgent) || location.hash === '#android') document.documentElement.classList.add('android');

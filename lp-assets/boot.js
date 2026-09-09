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

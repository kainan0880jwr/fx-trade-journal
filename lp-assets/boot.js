// JSが生きていることを示すクラスを、スタイルシートより前に付ける。
//
// 旧 LP は本文を .reveal（opacity:0）で置き、main.js が現す作りだったため、main.js が例外で
// 止まると本文が白いまま残った。そのため CSS は「JSがあるときだけ隠す」形にしてある（style.css）。
// 2026-10-14 の刷新で LP は JS 無しで全部見える作り（lp.css / lp.js）になり、main.js は削除した。
// このクラスと下の Android の判定は、LP とガイド記事の両方が使う。CSPの都合でインラインスクリプトは使えない。
document.documentElement.classList.add('js');

// Android 版はクローズドテスト中のため、Android の端末にだけテスター募集の案内を出す
// （.android-notice。CSS 側で html.android のときだけ表示する）。
// 募集の投稿は `#android` 付きのリンクで来るので、そのときは端末に関係なく出す。
// 以前は iPhone や PC で投稿のリンクを開くと、何の案内も無い LP に着地していた（2026-10-05）。
if (/Android/i.test(navigator.userAgent) || location.hash === '#android') document.documentElement.classList.add('android');
// 主ボタンの差し替えは「Android の端末」のときだけ（.android-device）。#android で開いた iPhone・PC の人から
// App Store のボタンを消さないよう、案内の表示（.android）とは分ける（2026-10-08）。
if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('android-device');

// ページ内の「Android 版はテスター募集」のリンク（#android）で、iPhone や PC からでも案内を開く。
// boot.js は読み込み時の hash しか見ていないので、あとから #android に移ったときも同じクラスを付ける。
window.addEventListener('hashchange', function(){
  if (location.hash === '#android') document.documentElement.classList.add('android');
});


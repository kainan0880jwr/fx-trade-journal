#!/bin/bash
# 実機で撮ったスクリーンショットを App Store Connect の必要サイズに整える。
#
# ASC が受け付けるサイズ（このアプリで使っている区分）:
#   APP_IPHONE_65          1284 x 2778
#   APP_IPAD_PRO_3GEN_129  2064 x 2752
#
# 実機のスクショはこのサイズと一致しないことが多い（例: iPhone 16 Pro は
# 1206x2622）。幅を合わせてから中央で高さを切り出す。アスペクト比の差は
# 1%未満なので、見た目が破綻することはない。
#
# 使い方:
#   scripts/prepare-screenshots.sh <入力ディレクトリ> <出力ディレクトリ> [iphone|ipad]
#
# 入力ディレクトリのPNGをファイル名順に 01_, 02_... と採番して出力する。
# 撮る順番＝並べたい順番にしておくこと。
set -euo pipefail

IN="${1:?入力ディレクトリを指定してください}"
OUT="${2:?出力ディレクトリを指定してください}"
KIND="${3:-iphone}"

case "$KIND" in
  iphone) W=1284; H=2778 ;;
  ipad)   W=2064; H=2752 ;;
  *) echo "第3引数は iphone か ipad"; exit 1 ;;
esac

mkdir -p "$OUT"
i=0
shopt -s nullglob nocaseglob
for f in "$IN"/*.png "$IN"/*.jpg "$IN"/*.jpeg; do
  i=$((i+1))
  base=$(printf "%02d_%s" "$i" "$(basename "${f%.*}" | tr ' ' '_')")
  dst="$OUT/$base.png"
  cp "$f" "$dst"
  # 幅を合わせる → 中央で高さを切り出す（sips は -c が「高さ 幅」の順）
  sips --resampleWidth "$W" "$dst" >/dev/null
  sips -c "$H" "$W" "$dst" >/dev/null
  sips -s format png "$dst" >/dev/null
  printf "%-40s -> %s\n" "$(basename "$f")" "$(sips -g pixelWidth -g pixelHeight "$dst" | tail -2 | tr -d '\n ' | sed 's/pixelWidth:/ /;s/pixelHeight:/x/')"
done

if [ "$i" -eq 0 ]; then
  echo "入力ディレクトリに画像がありません: $IN"; exit 1
fi
echo
echo "$i 枚を $OUT に出力しました（$W x $H）。"
echo "ASC は1つの表示サイズにつき最大10枚です。"

#!/bin/bash
# ビルド済み .ipa の中身を機械的に検証する。
#
# ウィジェットは「ビルドが成功した」だけでは正しく出荷できたことにならない。
# 実際に確認が必要だったのは以下で、いずれも過去に一度ずつ問題になっている:
#   - FXWidget.appex がそもそも同梱されているか
#     （build 23 は targets/widget が存在しないコミットから作られており未同梱だった）
#   - .lproj が11言語ぶんバンドルに入っているか
#     （@bacons/apple-targets のフォルダ同期に依存しており、保証されていない）
#   - App Group の entitlement が署名後も残っているか
#     （ローカルの ad-hoc 署名では空になることが判明している）
#   - URLスキームが本体アプリに登録されているか（ウィジェットのタップ先）
#
# 使い方:
#   scripts/verify-widget-bundle.sh <ipaのURL または ローカルの.ipaパス>
#
# 引数を省略した場合は eas build:list から最新ビルドのURLを取得する。

set -uo pipefail

EXPECTED_LANGS=(ja en de fr es it id tr hi vi pt)
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SRC="${1:-}"
if [ -z "$SRC" ]; then
  echo "▸ 最新ビルドのURLを eas から取得します"
  SRC=$(eas build:list --platform ios --limit 1 2>/dev/null \
        | grep "Application Archive URL" | awk '{print $NF}')
  [ -z "$SRC" ] && { echo "✖ URLを取得できませんでした"; exit 1; }
fi

if [[ "$SRC" == http* ]]; then
  echo "▸ ダウンロード: $SRC"
  curl -sL -o "$WORK/app.ipa" "$SRC" || { echo "✖ ダウンロード失敗"; exit 1; }
else
  cp "$SRC" "$WORK/app.ipa" || { echo "✖ ファイルを読めません: $SRC"; exit 1; }
fi

unzip -q "$WORK/app.ipa" -d "$WORK/x" || { echo "✖ 展開失敗"; exit 1; }
APP=$(find "$WORK/x/Payload" -maxdepth 1 -name "*.app" | head -1)
[ -z "$APP" ] && { echo "✖ .app が見つかりません"; exit 1; }
APPEX="$APP/PlugIns/FXWidget.appex"

fail=0
ok()   { echo "  ✓ $1"; }
bad()  { echo "  ✖ $1"; fail=1; }

echo
echo "── 1. ウィジェット拡張の同梱 ──"
if [ -d "$APPEX" ]; then ok "FXWidget.appex を検出"; else bad "FXWidget.appex が無い"; echo; exit 1; fi

echo
echo "── 2. ギャラリー名の多言語化（.lproj）──"
found=0
for l in "${EXPECTED_LANGS[@]}"; do
  if [ -f "$APPEX/$l.lproj/Localizable.strings" ]; then found=$((found+1)); else bad "$l.lproj が無い"; fi
done
[ "$found" -eq "${#EXPECTED_LANGS[@]}" ] && ok "11言語すべての Localizable.strings を検出"

echo
echo "── 3. App Group entitlement（署名後）──"
ENT=$(codesign -d --entitlements :- "$APPEX" 2>/dev/null)
if echo "$ENT" | grep -q "group.com.fxtradejournal.ios"; then
  ok "ウィジェット側に App Group あり"
else
  bad "ウィジェット側の App Group が空。データ受け渡しが動かない"
fi
ENT_APP=$(codesign -d --entitlements :- "$APP" 2>/dev/null)
if echo "$ENT_APP" | grep -q "group.com.fxtradejournal.ios"; then
  ok "本体アプリ側に App Group あり"
else
  bad "本体アプリ側の App Group が空。データ受け渡しが動かない"
fi

echo
echo "── 4. タップ先のURLスキーム ──"
if plutil -p "$APP/Info.plist" 2>/dev/null | grep -q "fx-trade-journal"; then
  ok "fx-trade-journal スキームが登録済み"
else
  bad "URLスキームが未登録。ウィジェットのタップが機能しない"
fi

echo
echo "── 5. バージョン ──"
plutil -p "$APP/Info.plist" 2>/dev/null \
  | grep -E "CFBundleShortVersionString|CFBundleVersion" | sed 's/^/  /'

echo
if [ "$fail" -eq 0 ]; then
  echo "✅ すべて合格。提出して問題ありません。"
else
  echo "❌ 問題があります。提出前に修正してください。"
fi
exit "$fail"

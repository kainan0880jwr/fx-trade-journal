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
#   - ExtensionStorage のネイティブモジュールが本体バイナリにリンクされているか
#     （podspecの最低iOS要求がアプリ本体を上回ると、autolinkingが無言で除外する。
#      JS側はダミー関数にフォールバックして例外も出さないため、ウィジェットは
#      表示されるのに永久に --% のまま。v1.3.0で実際に発生した）
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
echo "── 4. ExtensionStorage ネイティブモジュール ──"
# 本日(2026-08-29)いちばん見つけにくかった不具合の検査。
# podspecが要求する最低iOS(16.4)がアプリ本体(15.1)を上回ると、Expoのautolinkingは
# そのpodをエラーも警告も出さずに除外する。JS側は例外を投げず「何もしないダミー関数」に
# フォールバックするため、書き込みも更新通知も成功したふりをして、App Groupには
# 何も届かず、ウィジェットは永久にプレースホルダー(--%)を表示する。
# 上の1〜3が全て合格でもこれだけが欠けうるので、独立して確認する。
BIN="$APP/$(basename "$APP" .app)"
COUNT=$(strings "$BIN" 2>/dev/null | grep -c "ExtensionStorage")
CONTROL=$(strings "$BIN" 2>/dev/null | grep -c "SecureStore")
if [ "$CONTROL" -eq 0 ]; then
  bad "検査不能（対照モジュールも検出できずstringsが機能していない）"
elif [ "$COUNT" -gt 0 ]; then
  ok "本体バイナリにリンク済み（${COUNT}件）"
else
  bad "本体バイナリに無い。ウィジェットはデータを受け取れず --% のままになる"
fi

echo
echo "── 5. タップ先のURLスキーム ──"
if plutil -p "$APP/Info.plist" 2>/dev/null | grep -q "fx-trade-journal"; then
  ok "fx-trade-journal スキームが登録済み"
else
  bad "URLスキームが未登録。ウィジェットのタップが機能しない"
fi

echo
echo "── 6. バージョン ──"
plutil -p "$APP/Info.plist" 2>/dev/null \
  | grep -E "CFBundleShortVersionString|CFBundleVersion" | sed 's/^/  /'

echo
if [ "$fail" -eq 0 ]; then
  echo "✅ すべて合格。提出して問題ありません。"
else
  echo "❌ 問題があります。提出前に修正してください。"
fi
exit "$fail"

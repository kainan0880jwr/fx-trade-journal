#!/bin/bash
# App Store 用のスクリーンショットを、シミュレータから自動で撮る。
#
# なぜ要るか: 11ロケール × 8画面 = 88枚を手で撮るのは現実的でない。前回
# (2026-09-01) も同じことを一時的な仕掛けでやったが、**コミットしなかったので
# 失われた**。今度は残す。
#
# 前提:
#   1. デモデータは src/utils/screenshotMode.ts が入れる。アプリを
#      EXPO_PUBLIC_SCREENSHOT_MODE=1 でビルドしてあること。
#        EXPO_PUBLIC_SCREENSHOT_MODE=1 npx expo run:ios --device "<シミュレータ名>"
#   2. シミュレータのサイズが 1284x2778 であること（iPhone 14 Plus / 15 Plus など）。
#      違う機種で撮ると scripts/prepare-screenshots.sh の切り出しが要る。
#
# 使い方:
#   scripts/capture-screenshots.sh <シミュレータ名または UDID> <出力先> [ロケール...]
#   例: scripts/capture-screenshots.sh "iPhone 14 Plus - EN" ~/Desktop/shots ja en-US de-DE
#
# ロケールを省くと、今シミュレータに設定されている言語のまま1回だけ撮る。
set -euo pipefail

SIM="${1:?シミュレータ名か UDID を指定してください}"
OUT="${2:?出力先ディレクトリを指定してください}"
shift 2
LOCALES=("$@")

BUNDLE_ID="com.fxtradejournal.ios"
SCHEME="fx-trade-journal"   # 参考。遷移には使わない（下の理由でディープリンクが使えない）
# 撮影モードは __DEV__ が前提なので、JS は必ず Metro から来る。
DEV_SERVER="${SCREENSHOT_DEV_SERVER:-http://localhost:8081}"
SEQ=0

# 以降は UDID で扱う。言語設定でデバイスの plist を直接触るため名前では足りない。
if [[ "$SIM" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
  UDID="$SIM"
else
  UDID="$(xcrun simctl list devices | grep -F "$SIM (" | head -1 | grep -oE '[0-9A-F]{8}-[0-9A-F-]{27}')"
  [ -n "$UDID" ] || { echo "シミュレータが見つからない: $SIM"; exit 1; }
fi
GLOBAL_PLIST="$HOME/Library/Developer/CoreSimulator/Devices/$UDID/data/Library/Preferences/.GlobalPreferences.plist"

# 撮る画面と、それを開くディープリンク。順番がそのままファイル名の連番になり、
# store.config.json での並び順（＝ストアでの表示順）になる。
# expo-router の (tabs) はグループなので URL には出ない。
# 並びの考え方（2026-09-20 に組み替え）:
#   1〜3 は検索結果に出る位置。**ここに PRO を置かない。** 「何のアプリか」と
#   「自分にも記録できそう」を伝える。実測で最大の減り所は初回記録の手前
#   （first_open 138 → first_trade_saved 48）で、ストア→インストールではない。
#   4〜5 で初めて PRO の中身（時間帯・曜日／資産推移）を見せる。キャプション帯で
#   PRO と明示すること — 無印で載せると「あると思った機能がロックされていた」に
#   なり、Guideline 2.3.1（正確なメタデータ）の観点でも良くない。
#   設定画面と目標画面は外した。バッジは無料になったので「無料でここまで」の締めに使う。
#
# `?tab=` と `?share=1` は **撮影モードでしか効かない**（stats.tsx / monthly.tsx）。
# サブタブと共有シートはローカル state で、ファイル経由の遷移からは触れないため。
# 撮り直すたびに世代を上げる。**同名で中身だけ差し替えても `metadata:push` は
# 何も送らない**（CLAUDE.md）。iPhone と iPad は別系列なので番号は揃っていなくてよい。
#   iPhone: SHOT_SUFFIX=_v4   iPad: SHOT_SUFFIX=_v3
SHOT_SUFFIX="${SHOT_SUFFIX:-}"

# 一部の画面だけ撮り直したいとき（アプリ側を直して1枚だけ古くなった、など）。
# 名前に対する grep -E のパターン。空なら全部撮る。
#   SHOT_ONLY='^07_share$' scripts/capture-screenshots.sh ...
# **連番は撮る枚数ではなく ROUTES の位置で決まる**ので、絞っても
# ファイル名（＝ストアでの並び順）は変わらない。
SHOT_ONLY="${SHOT_ONLY:-}"

ROUTES=(
  "01_home:"
  "02_monthly:monthly"
  "03_entry:trade/new"
  "04_analysis_time:stats?tab=time"
  "05_analysis_equity:stats?tab=equity"
  "06_calendar:calendar"
  "07_share:monthly?share=1"
  "08_badges:badges"
)

# ロケール -> シミュレータに設定する言語/地域。アプリ側の i18n は
# 端末ロケールを**起動時に一度だけ**読む（src/i18n/index.ts）ので、
# 言語を変えたらアプリを必ず起動し直す。
declare -a LOCALE_LANG=(
  "ja:ja-JP:ja_JP"
  "en-US:en-US:en_US"
  "de-DE:de-DE:de_DE"
  "es-ES:es-ES:es_ES"
  "fr-FR:fr-FR:fr_FR"
  "it:it-IT:it_IT"
  "id:id-ID:id_ID"
  "tr:tr-TR:tr_TR"
  "hi:hi-IN:hi_IN"
  "vi:vi-VN:vi_VN"
  "pt-BR:pt-BR:pt_BR"
)

lookup_lang() {
  local want="$1"
  for row in "${LOCALE_LANG[@]}"; do
    IFS=: read -r key lang region <<<"$row"
    if [ "$key" = "$want" ]; then echo "$lang:$region"; return 0; fi
  done
  return 1
}

boot_if_needed() {
  if ! xcrun simctl list devices | grep -q "$UDID.*Booted"; then
    echo "  シミュレータを起動中..."
    xcrun simctl boot "$UDID" 2>/dev/null || true
    xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true
  fi
}

capture_one_locale() {
  local locale="$1" dest="$2"
  mkdir -p "$dest"

  if [ -n "$locale" ]; then
    local pair lang region
    pair="$(lookup_lang "$locale")" || { echo "  未知のロケール: $locale"; return 1; }
    IFS=: read -r lang region <<<"$pair"
    echo "==> ${locale} (${lang} / ${region})"
    # 言語の変更は再起動しないと効かない。かつ simctl spawn は起動中のデバイスに
    # しか使えないので、止めてから plist を直接書く（起動中に書いても終了時に上書きされる）。
    xcrun simctl shutdown "$UDID" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Delete :AppleLanguages" "$GLOBAL_PLIST" >/dev/null 2>&1 || true
    /usr/libexec/PlistBuddy -c "Add :AppleLanguages array" "$GLOBAL_PLIST" >/dev/null
    /usr/libexec/PlistBuddy -c "Add :AppleLanguages:0 string ${lang}" "$GLOBAL_PLIST" >/dev/null
    /usr/libexec/PlistBuddy -c "Set :AppleLocale ${region}" "$GLOBAL_PLIST" >/dev/null 2>&1 \
      || /usr/libexec/PlistBuddy -c "Add :AppleLocale string ${region}" "$GLOBAL_PLIST" >/dev/null
    boot_if_needed
  else
    echo "==> 現在の言語のまま撮影"
    boot_if_needed
  fi

  # 端末の見た目を揃える。時計は 9:41、電波・電池は満杯、キャリア名は消す。
  # iPad の Wi-Fi モデルにはセルラーが無く、そこだけ失敗しうる。set -e で全体を
  # 落とさないよう握り潰す（見た目が少し揃わないだけで、撮影自体は続けられる）。
  xcrun simctl status_bar "$UDID" override \
    --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100 \
    2>/dev/null || xcrun simctl status_bar "$UDID" override \
    --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --batteryState charged --batteryLevel 100 2>/dev/null || true

  # expo-dev-client は初回起動時に「developer menu」の説明ダイアログを全画面に出す。
  # タップして閉じる手段が無い（System Events は補助アクセス権限が無く -25211 で失敗する）ので、
  # 表示済みフラグを立てておく。キーは expo-dev-menu の DevMenuPreferences.swift より。
  xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" EXDevMenuIsOnboardingFinished -bool YES 2>/dev/null || true

  # アプリを入れ直さずに再起動する（デモデータは起動のたびに作り直される）
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  # --initialUrl は dev client を Metro に直結させる。これが無いと dev launcher の
  # 一覧が出たままになり、そこから先へ進む手段が無い（下記のとおりタップできない）。
  xcrun simctl launch "$UDID" "$BUNDLE_ID" --args --initialUrl "$DEV_SERVER" >/dev/null

  # アプリのコンテナは再インストールで変わるので、起動のたびに取り直す。
  local docs
  docs="$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" data)/Documents"
  mkdir -p "$docs"
  rm -f "$docs/screenshot-here.txt"

  for row in "${ROUTES[@]}"; do
    IFS=: read -r name path <<<"$row"
    SEQ=$((SEQ + 1))
    if [ -n "$SHOT_ONLY" ] && ! echo "$name" | grep -qE "$SHOT_ONLY"; then
      continue
    fi
    local token="${SEQ}:${path}"

    # 行き先をファイルで渡す。**`simctl openurl` は使えない** — Xcode 27 / iOS 26 は
    # アプリが前面にあっても毎回「"アプリ名" で開きますか?」の確認を出し、Xcode 27 が
    # Simulator.app を廃止した（置き換えの DeviceHub はCLIからウィンドウを開けない）ため
    # 押す手段が無い。アプリ側の useScreenshotNavigator() がこのファイルを見て遷移する。
    echo -n "$token" > "$docs/screenshot-goto.txt"

    # 遷移したという書き戻しを待つ。時間だけで待つと、初回はJSバンドルの読み込みで
    # 間に合わず前の画面が写る。
    local waited=0
    while [ "$(cat "$docs/screenshot-here.txt" 2>/dev/null)" != "$token" ]; do
      sleep 1
      waited=$((waited + 1))
      if [ "$waited" -ge 60 ]; then
        echo "    !! $name: アプリが応答しない（Metro は動いているか）"
        break
      fi
    done

    # CountUp のアニメーションが終わるのを待つ。ここを詰めすぎると
    # pips が「-」のまま写る（id/tr/hi/vi/pt-BR の既存素材が実際にそうなっている）。
    sleep 4
    xcrun simctl io "$UDID" screenshot --type png "$dest/${name}${SHOT_SUFFIX}.png" >/dev/null
    echo "    ${name}${SHOT_SUFFIX}.png"
  done
}

if [ ${#LOCALES[@]} -eq 0 ]; then
  capture_one_locale "" "$OUT"
else
  for loc in "${LOCALES[@]}"; do
    capture_one_locale "$loc" "$OUT/$loc"
  done
fi

xcrun simctl status_bar "$UDID" clear 2>/dev/null || true
echo
echo "完了: $OUT"
echo "サイズが 1284x2778 でなければ scripts/prepare-screenshots.sh で整えること。"

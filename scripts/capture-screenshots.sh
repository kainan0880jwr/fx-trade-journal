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
SCHEME="fx-trade-journal"

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
ROUTES=(
  "01_home:"
  "02_calendar:calendar"
  "03_monthly:monthly"
  "04_stats:stats"
  "05_goals:goals"
  "06_badges:badges"
  "07_entry:trade/new"
  "08_settings:settings"
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
  xcrun simctl status_bar "$UDID" override \
    --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100

  # expo-dev-client は初回起動時に「developer menu」の説明ダイアログを全画面に出す。
  # タップして閉じる手段が無い（System Events は補助アクセス権限が無く -25211 で失敗する）ので、
  # 表示済みフラグを立てておく。キーは expo-dev-menu の DevMenuPreferences.swift より。
  xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" EXDevMenuIsOnboardingFinished -bool YES 2>/dev/null || true

  # アプリを入れ直さずに再起動する（デモデータは起動のたびに作り直される）
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
  sleep 6   # DBを開いて22件を入れ終わるまで待つ

  for row in "${ROUTES[@]}"; do
    IFS=: read -r name path <<<"$row"
    xcrun simctl openurl "$UDID" "$SCHEME://$path"
    # CountUp のアニメーションが終わるのを待つ。ここを詰めすぎると
    # pips が「-」のまま写る（id/tr/hi/vi/pt-BR の既存素材が実際にそうなっている）。
    sleep 4
    xcrun simctl io "$UDID" screenshot --type png "$dest/$name.png" >/dev/null
    echo "    $name.png"
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

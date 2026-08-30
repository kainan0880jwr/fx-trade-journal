#!/bin/bash
set -euo pipefail

# キーストアの場所。gen-keystore.sh が作る場所と揃えてある。
# 以前は get-fingerprint.sh / export-pubkey.sh だけが
# ~/Desktop/FXlog/FXlog/ を見ており、実在しない場所を指していた
# (生成側は ~/Keys/ に作っていたため、実行するとエラーになる状態だった)。
# プロジェクトの外に置いてあるので、プロジェクトを移動しても影響を受けない。
# 環境変数 FXLOG_KEYSTORE で上書きもできる。
KEYSTORE="${FXLOG_KEYSTORE:-$HOME/Keys/fx-trade-journal/android-signing/fx-trade-journal.keystore}"
KEYTOOL="${KEYTOOL:-/opt/homebrew/opt/openjdk/bin/keytool}"

# 証明書の書き出し先は、このスクリプトから見た相対位置にする
# (プロジェクトを移動しても壊れないように)
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

"$KEYTOOL" \
  -export \
  -rfc \
  -keystore "$KEYSTORE" \
  -alias "fx-trade-journal" \
  -file "$OUT_DIR/fx-trade-journal-cert.pem"

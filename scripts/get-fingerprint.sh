#!/bin/bash
/opt/homebrew/opt/openjdk/bin/keytool \
  -list \
  -v \
  -keystore "/Users/ikebatadaiki/Desktop/アプリ開発/fx-trade-journal/fx-trade-journal.keystore" \
  -alias "fx-trade-journal" \
  | grep "SHA256:"

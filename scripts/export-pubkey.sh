#!/bin/bash
/opt/homebrew/opt/openjdk/bin/keytool \
  -export \
  -rfc \
  -keystore "/Users/ikebatadaiki/Desktop/アプリ開発/fx-trade-journal/fx-trade-journal.keystore" \
  -alias "fx-trade-journal" \
  -file "/Users/ikebatadaiki/Desktop/アプリ開発/fx-trade-journal/fx-trade-journal-cert.pem"

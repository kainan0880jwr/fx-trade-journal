#!/bin/bash
/opt/homebrew/opt/openjdk/bin/keytool \
  -export \
  -rfc \
  -keystore "/Users/ikebatadaiki/Desktop/FXlog/FXlog/fx-trade-journal.keystore" \
  -alias "fx-trade-journal" \
  -file "/Users/ikebatadaiki/Desktop/FXlog/FXlog/fx-trade-journal-cert.pem"

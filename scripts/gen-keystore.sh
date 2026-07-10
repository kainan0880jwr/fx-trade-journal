#!/bin/bash
/opt/homebrew/opt/openjdk/bin/keytool \
  -genkeypair \
  -v \
  -keystore "/Users/ikebatadaiki/Keys/fx-trade-journal/android-signing/fx-trade-journal.keystore" \
  -alias "fx-trade-journal" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=FX Trade Journal, OU=IKD Studio, O=IKD Studio, L=Tokyo, S=Tokyo, C=JP"

#!/bin/bash
/opt/homebrew/opt/openjdk/bin/keytool \
  -list \
  -v \
  -keystore "/Users/ikebatadaiki/Desktop/FXlog/FXlog/fx-trade-journal.keystore" \
  -alias "fx-trade-journal" \
  | grep "SHA256:"

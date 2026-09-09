#!/usr/bin/env python3
"""LP の最終CTAに置く QR コードを言語ごとに生成する。

なぜ要るか: LPのCTAは全部 App Store のWebページへのリンクで、**デスクトップで
踏むと行き止まり**になる。検索流入（例:「MT4 CSV 損益 集計」）はデスクトップが
少なくないのに、そこに出口が無かった。

- 出力は SVG（1〜2KB、どの解像度でも潰れない。CSP の img-src 'self' で読める）
- `ct` を lp-<lang> とは別にして、QR経由の流入を App Analytics で分けて見る
- 色はテーマに追随させない。QRは**読み取り精度が最優先**なので、
  暗いモジュール/明るい背景の固定配色にする（ダーク背景の上に白カードで置く）

必要: segno（このリポジトリの依存ではない。ローカル専用のツール）
使い方: python3 scripts/make-qr.py
"""
import os
import segno

ROOT = os.path.join(os.path.dirname(__file__), '..')
APP_ID = '6786188634'
LANGS = ['ja', 'en', 'de', 'fr', 'es', 'it', 'id', 'tr', 'hi', 'vi', 'pt']

for lang in LANGS:
    url = f'https://apps.apple.com/app/id{APP_ID}?ct=qr-{lang}'
    # error='m' は 15% の誤り訂正。印刷ではなく画面表示なので M で十分。
    qr = segno.make(url, error='m')
    out = os.path.join(ROOT, 'lp-assets', f'qr-{lang}.svg')
    qr.save(out, kind='svg', scale=1, border=2, dark='#0E1420', light='#FFFFFF')
    print(f'  qr-{lang}.svg  {os.path.getsize(out)} bytes  {url}')

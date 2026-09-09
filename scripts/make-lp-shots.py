#!/usr/bin/env python3
"""LP に載せる製品スクリーンショットを生成する。

なぜ要るか: LPには `<img>` の製品画面が**1枚も無く**、手書きHTMLのモックだけだった。
アプリの見た目が分からないまま「App Storeへ」を押させている状態。
しかもモックは実物より情報が少なく、実機のほうが説得力がある。

- **ホーム画面はヘッダーごと切り落とす。** ヘッダーにアプリ名が出ており、
  非日本語ロケールの素材は改名前に撮ったもので "FX Trade Log"（旧名）と写る。
  区切り線の位置はロケールで違う（ja/en は y=311、他は y=270）ので毎回検出する。
- 分析・記録の画面はヘッダーが**画面タイトル**（「分析」「トレード記録」）なので残し、
  ステータスバーだけ切る。
- 出力は WebP と AVIF。表示幅は .phone 枠の内側で約250px なので、2.2倍の 560px で書き出す。

必要: Pillow（このリポジトリの依存ではない。ローカル専用のツール）
使い方: OG_SHOT_DIR=<原本のscreenshotディレクトリ> python3 scripts/make-lp-shots.py
"""
import os, sys, statistics
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'lp-assets', 'shots')
WIDTH = 560
STATUS_BAR = 200          # ステータスバー（時刻・電波・電池）の下端
LANG_TO_LOCALE = {
    'ja': 'ja', 'en': 'en-US', 'de': 'de-DE', 'fr': 'fr-FR', 'es': 'es-ES',
    'it': 'it', 'id': 'id', 'tr': 'tr', 'hi': 'hi', 'vi': 'vi', 'pt': 'pt-BR',
}
# 役割 -> ロケールごとのファイル名（撮影時期が違い、連番の割り当てが揃っていない）
PICK = {
    'home':     {'*': '01_home'},
    'analysis': {'ja': '04_stats', 'en-US': '04_stats',
                 'de-DE': '05_analysis', 'fr-FR': '05_analysis',
                 'es-ES': '05_analysis', 'it': '05_analysis', '*': '04_analysis'},
    'entry':    {'ja': '07_entry', 'en-US': '07_entry',
                 'de-DE': '02_new_trade', 'fr-FR': '02_new_trade',
                 'es-ES': '02_new_trade', 'it': '02_new_trade', '*': '06_add_trade'},
}


def find_divider(im):
    """ヘッダー下の水平区切り線。幅いっぱいで均一かつ、背景より明るい行。"""
    for y in range(240, 420):
        row = [im.getpixel((x, y)) for x in range(0, im.width, 16)]
        lum = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in row]
        if statistics.pstdev(lum) < 0.6 and 20 < statistics.mean(lum) < 60:
            return y
    return None


def header_top(im, divider):
    """ヘッダー帯の上端。ステータスバーとヘッダーの間の均一な隙間を探す。
    固定値で切るとロケールでステータスバーの高さが違い、タイトルが欠ける。"""
    run = 0
    for y in range(divider - 2, 100, -1):
        row = [im.getpixel((x, y)) for x in range(0, im.width, 16)]
        lum = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in row]
        if statistics.pstdev(lum) < 0.6:
            run += 1
            if run >= 10:
                return y + run - 2
        else:
            run = 0
    return STATUS_BAR


def build(src, role):
    im = Image.open(src).convert('RGB')
    d = find_divider(im)
    if role == 'home':
        # ヘッダーにアプリ名が出る画面。ヘッダーごと落とす。
        if d is None:
            raise SystemExit(f'区切り線が見つからない: {src}（アプリ名が写ったままになる）')
        top = d + 2
    elif d is not None:
        # ヘッダーは画面タイトル（「分析」等）なので残し、ステータスバーだけ落とす。
        top = header_top(im, d)
    else:
        # モーダル（記録画面）は区切り線を持たない。
        top = STATUS_BAR
    im = im.crop((0, top, im.width, im.height))
    h = round(im.height * WIDTH / im.width)
    return im.resize((WIDTH, h), Image.LANCZOS)


def main():
    base = os.environ.get('OG_SHOT_DIR')
    if not base:
        raise SystemExit('OG_SHOT_DIR に、キャプション帯を焼く前の screenshot ディレクトリを指定してください')
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for lang, loc in LANG_TO_LOCALE.items():
        for role, table in PICK.items():
            name = table.get(loc, table.get('*'))
            src = os.path.join(base, loc, 'APP_IPHONE_65', name + '.png')
            if not os.path.exists(src):
                raise SystemExit(f'素材が無い: {src}')
            img = build(src, role)
            stem = os.path.join(OUT, f'{role}-{lang}')
            img.save(stem + '.webp', quality=82, method=6)
            img.save(stem + '.avif', quality=58)
            total += 2
            print(f'  {role:8} {lang:3} {img.size}  webp={os.path.getsize(stem+".webp")//1024}KB'
                  f'  avif={os.path.getsize(stem+".avif")//1024}KB')
    print(f'\n{total} ファイル / 合計 {sum(os.path.getsize(os.path.join(OUT,f)) for f in os.listdir(OUT))//1024} KB')


if __name__ == '__main__':
    main()

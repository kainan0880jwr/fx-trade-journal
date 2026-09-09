#!/usr/bin/env python3
"""App Store のスクリーンショットにキャプション帯を付ける。

なぜ要るか: 検索結果に出るのは先頭3枚で、しかも横幅80〜100px程度の
サムネイル。素の実機スクショだと「暗い画面に何か並んでいる」以上の情報が
伝わらない。上部にキャプションを置いて、何ができるアプリかを文字で伝える。

- 出力は 1284x2778 のまま（App Store の規格）。スクショを縮小して下に敷く。
- 背景はアプリのダーク背景と同じ #05070C。LP・共有カードとも揃う。
- **原本を上書きする。** store/ は gitignore されており ASC が正本なので、
  やり直したいときは `eas metadata:pull` で取り直す。
- 冪等ではない。二重に掛けると帯が二重になる。掛ける前に必ず原本を確保すること。

必要: Pillow（このリポジトリの依存ではない。ローカル専用のツール）
  python3 -m pip install --user Pillow

使い方: python3 scripts/caption-screenshots.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
W, H = 1284, 2778
BG = (5, 7, 12, 255)          # --bg / #05070C
FG = (237, 241, 250, 255)     # --ink / #EDF1FA
FONT_JA = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
FONT_EN = '/System/Library/Fonts/Helvetica.ttc'

CAP_TOP, CAP_BOTTOM = 150, 500   # キャプション帯（この中で縦中央に置く）
SHOT_TOP, SHOT_BOTTOM = 545, 2690

CAPTIONS = {
    'ja': {
        '01_home.png':     ['1タップで記録。', 'MT4/MT5の履歴も取り込める'],
        '02_calendar.png': ['勝ち負けが、', 'カレンダーで見える'],
        '03_monthly.png':  ['今月の勝率・pips・PFが', 'ひと目でわかる'],
    },
    'en-US': {
        '01_home.png':     ['Log a trade in one tap.', 'Import MT4/MT5 history.'],
        '02_calendar.png': ['See your wins and losses,', 'day by day.'],
        '03_monthly.png':  ['Win rate, pips and profit factor', 'at a glance.'],
    },
}


def fit_font(path, lines, max_width, start=76, min_size=44):
    """全行が max_width に収まる最大のフォントサイズを返す。"""
    for size in range(start, min_size - 1, -2):
        font = ImageFont.truetype(path, size)
        if all(font.getbbox(l)[2] - font.getbbox(l)[0] <= max_width for l in lines):
            return font
    return ImageFont.truetype(path, min_size)


def rounded(im, radius):
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1],
                                           radius=radius, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def caption(src, lines, font_path):
    shot = Image.open(src).convert('RGBA')

    # 高さ優先で縮小（幅で決めると入りきらない）
    avail_h = SHOT_BOTTOM - SHOT_TOP
    scale = avail_h / shot.height
    new_w, new_h = int(shot.width * scale), avail_h
    shot = shot.resize((new_w, new_h), Image.LANCZOS)
    shot = rounded(shot, int(58 * scale))

    canvas = Image.new('RGBA', (W, H), BG)
    canvas.paste(shot, ((W - new_w) // 2, SHOT_TOP), shot)

    d = ImageDraw.Draw(canvas)
    font = fit_font(font_path, lines, max_width=W - 2 * 110)
    gap = int(font.size * 0.42)
    heights = [font.getbbox(l)[3] - font.getbbox(l)[1] for l in lines]
    total = sum(heights) + gap * (len(lines) - 1)
    y = (CAP_TOP + CAP_BOTTOM) // 2 - total // 2
    for line, h in zip(lines, heights):
        bbox = font.getbbox(line)
        d.text(((W - (bbox[2] - bbox[0])) // 2 - bbox[0], y - bbox[1]), line, font=font, fill=FG)
        y += h + gap
    return canvas


def main():
    for locale, files in CAPTIONS.items():
        font_path = FONT_JA if locale == 'ja' else FONT_EN
        for name, lines in files.items():
            p = os.path.join(ROOT, 'store', 'apple', 'screenshot', locale, 'APP_IPHONE_65', name)
            if not os.path.exists(p):
                print(f'  skip (無い): {p}')
                continue
            caption(p, lines, font_path).save(p)
            print(f'  {locale}/{name}  {" / ".join(lines)}')


if __name__ == '__main__':
    main()

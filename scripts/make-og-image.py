#!/usr/bin/env python3
"""LP の OGP 画像（1200x630）を生成する。

なぜ作り直したか: 従来の og-image.png は**アプリアイコンを黒地に置いただけ**で、
左右に広大な余白があり、読める文字はアイコン内の「FX LOG」だけだった。
OGPはXやSlackのタイムラインで本文より先に見られる面なのに、製品名も
一言も製品画面も無く、しかも**ブランド名の4番目の表記を拡散していた**。

- 左: ブランドマーク（LPのSVGと同じ、ヒゲ付きローソク足3本）＋ 製品名 ＋ 1行コピー
- 右: ホーム画面のスクリーンショットを端末枠に入れ、右端で半分見切れさせる
- 文字を入れる以上、1枚を11言語で使い回せない。ja / en の2枚を作る

必要: Pillow（このリポジトリの依存ではない。ローカル専用のツール）
使い方: python3 scripts/make-og-image.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
W, H = 1200, 630
BG      = (5, 7, 12)        # --bg
INK     = (237, 241, 250)   # --ink
INK_DIM = (144, 153, 180)   # --ink-dim
PROFIT  = (51, 214, 166)    # --profit-large (dark)
LOSS    = (255, 98, 89)     # --loss-large (dark)
ACCENT  = (79, 126, 247)    # --accent

FONT_JA_B = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
FONT_EN_B = '/System/Library/Fonts/Helvetica.ttc'

VARIANTS = {
    'og-image.png': {
        'font': FONT_JA_B, 'shot': 'ja',
        'name': 'FXトレードログ',
        'lines': ['記録するだけで、勝率・pips・PFが自動集計。',
                  'MT4/MT5インポート対応。記録は端末内に暗号化保存。'],
    },
    'og-image-en.png': {
        'font': FONT_EN_B, 'shot': 'en-US',
        'name': 'FX Trade Journal',
        'lines': ['Win rate, pips and profit factor, calculated for you.',
                  'MT4/MT5 import. Every trade stays encrypted on your device.'],
    },
}


def mark(d, x, y, s):
    """LPの brand-mark と同じ形（32x32 のビューボックスを s 倍）"""
    def r(x0, y0, w, h, fill):
        d.rounded_rectangle([x + x0 * s, y + y0 * s, x + (x0 + w) * s, y + (y0 + h) * s],
                            radius=max(1, int(1.5 * s)), fill=fill)
    r(6.4, 12, 1.2, 6, PROFIT);  r(4, 17, 6, 10, PROFIT)
    r(15.4, 6.5, 1.2, 5, LOSS);  r(13, 11, 6, 16, LOSS)
    r(24.4, 1, 1.2, 4, PROFIT);  r(22, 4, 6, 23, PROFIT)


def rounded(im, radius):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=radius, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), m)
    return out


def build(cfg, shot_path):
    canvas = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(canvas)

    # 右: スクリーンショットを端末枠で、右端から見切れさせる
    shot = Image.open(shot_path).convert('RGBA')
    target_h = 560
    scale = target_h / shot.height
    shot = shot.resize((int(shot.width * scale), target_h), Image.LANCZOS)
    shot = rounded(shot, 26)
    # 見切れ幅。スクショのヘッダーにはアプリ名が中央寄せで写っており、
    # en-US 等の素材は改名前（"FX Trade Log"）に撮ったものなので、
    # そこが見えない位置で切る。**旧名をOGPで拡散しないため。**
    sx, sy = W - int(shot.width * 0.46), (H - target_h) // 2
    frame = Image.new('RGBA', (shot.width + 12, shot.height + 12), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle([0, 0, frame.width - 1, frame.height - 1],
                                            radius=32, outline=(40, 50, 74), width=3)
    canvas.paste(shot, (sx, sy), shot)
    canvas.paste(frame, (sx - 6, sy - 6), frame)

    # 左: マーク → 製品名 → コピー。ブロック全体を縦中央に置く
    x = 72
    name_f = ImageFont.truetype(cfg['font'], 54)
    body_f = ImageFont.truetype(cfg['font'], 27)
    line_h, gap_name, gap_rule = 44, 92, 40
    block_h = 56 + gap_name + line_h * len(cfg['lines']) + gap_rule + 6
    top = (H - block_h) // 2

    mark(d, x, top, 1.5)
    d.text((x + 66, top + 4), cfg['name'], font=name_f, fill=INK)

    y = top + gap_name + 8
    for line in cfg['lines']:
        d.text((x, y), line, font=body_f, fill=INK_DIM)
        y += line_h

    # アクセントの下線（LPのCTAと同じ色）
    d.rounded_rectangle([x, y + gap_rule, x + 96, y + gap_rule + 6], radius=3, fill=ACCENT)
    return canvas


def main():
    orig = os.environ.get('OG_SHOT_DIR')  # キャプション帯を焼く前の原本を使う
    for out, cfg in VARIANTS.items():
        base = orig or os.path.join(ROOT, 'store', 'apple', 'screenshot')
        shot = os.path.join(base, cfg['shot'], 'APP_IPHONE_65', '01_home.png')
        if not os.path.exists(shot):
            print(f'  skip: {shot} が無い'); continue
        p = os.path.join(ROOT, 'lp-assets', out)
        build(cfg, shot).save(p, optimize=True)
        print(f'  {out}  {os.path.getsize(p)//1024} KB')


if __name__ == '__main__':
    main()

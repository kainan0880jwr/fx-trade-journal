#!/usr/bin/env python3
"""アプリアイコンを生成する（文字なし・フルブリード）。

現行の `assets/icon.png` には「FX LOG」という文字が焼き込まれている。これは:
- 全ユーザーのホーム画面に常時出る、最も強いブランド面
- 同じ画像が favicon / apple-touch-icon にも使われている
- ブランド名の4番目の表記（FX Trade Journal / FXトレードログ / 旧 FX Trade Log に加えて）

文字入りアイコンは多言語アプリでは構造的に不利で、小さいサイズでは潰れて読めない。
また現行アイコンは**角丸と外周グローがPNGに焼き込まれており**、iOS がさらに
squircle でマスクするため二重角丸の縁が出る。

そこで:
- 文字を外し、ローソク足だけにする（LPのブランドマークと同じ形）
- **角丸なし・フルブリードの正方形**にする（マスクはOSに任せる）
- グローは焼き込まない

必要: Pillow（このリポジトリの依存ではない。ローカル専用のツール）
使い方: python3 scripts/make-icon.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
S = 1024
# アプリのダークテーマと同系。上が少し明るい斜めのグラデーション。
BG_TOP, BG_BOTTOM = (16, 24, 44), (5, 8, 15)
PROFIT = (51, 214, 166)   # --profit-large
LOSS = (255, 98, 89)      # --loss-large

# LPの brand-mark と同じ 32x32 のビューボックス
BARS = [
    (6.4, 12, 1.2, 6, PROFIT), (4, 17, 6, 10, PROFIT),
    (15.4, 6.5, 1.2, 5, LOSS), (13, 11, 6, 16, LOSS),
    (24.4, 1, 1.2, 4, PROFIT), (22, 4, 6, 23, PROFIT),
]
CONTENT = 0.62   # キャンバスに対する図形の占有率。squircle マスクで欠けない範囲


def main():
    # 背景
    bg = Image.new('RGB', (S, S), BG_BOTTOM)
    d = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / (S - 1)
        d.line([(0, y), (S, y)], fill=tuple(
            round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))

    # ローソク足。ビューボックスの実効範囲 x:4..28, y:1..27 を中央に置く
    vx0, vy0, vx1, vy1 = 4.0, 1.0, 28.0, 27.0
    scale = S * CONTENT / max(vx1 - vx0, vy1 - vy0)
    ox = (S - (vx1 - vx0) * scale) / 2 - vx0 * scale
    oy = (S - (vy1 - vy0) * scale) / 2 - vy0 * scale

    shapes = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shapes)
    for x, y, w, h, color in BARS:
        box = [ox + x * scale, oy + y * scale, ox + (x + w) * scale, oy + (y + h) * scale]
        sd.rounded_rectangle(box, radius=max(2, int(1.5 * scale)), fill=color + (255,))

    # 図形の色をわずかに広げた光。**背景の一部**として置くので、
    # アイコンの外周には出ない（外周グローを焼き込まない）。
    glow = shapes.filter(ImageFilter.GaussianBlur(S * 0.035))
    glow.putalpha(glow.getchannel('A').point(lambda a: int(a * 0.45)))

    out = bg.convert('RGBA')
    out.alpha_composite(glow)
    out.alpha_composite(shapes)
    out = out.convert('RGB')   # アイコンにアルファは持たせない（Appleの要件）

    p = os.path.join(ROOT, 'assets', 'icon-v2.png')
    out.save(p, optimize=True)
    print(f'  {p}  {out.size}  {os.path.getsize(p)//1024} KB  mode={out.mode}')

    # 小さいサイズでの見え方を確認するための縮小版
    prev = Image.new('RGB', (60 + 120 + 180 + 40, 200), (24, 24, 24))
    x = 10
    for n in (60, 120, 180):
        prev.paste(out.resize((n, n), Image.LANCZOS), (x, (200 - n) // 2))
        x += n + 10
    prev.save(os.path.join(ROOT, '..', 'icon-preview.png'))
    print('  縮小プレビュー: Desktop/FXlog/icon-preview.png（60 / 120 / 180 px）')


if __name__ == '__main__':
    main()

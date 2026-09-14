#!/usr/bin/env python3
"""アプリアイコンを生成する（文字なし・フルブリード）。

旧 `assets/icon.png` には「FX LOG」という文字が焼き込まれていた。これは:
- 全ユーザーのホーム画面に常時出る、最も強いブランド面
- 同じ画像が favicon / apple-touch-icon にも使われている
- ブランド名の4番目の表記（FX Trade Journal / FXトレードログ / 旧 FX Trade Log に加えて）

文字入りアイコンは多言語アプリでは構造的に不利で、小さいサイズでは潰れて読めない。
また旧アイコンは**角丸と外周グローがPNGに焼き込まれており**、iOS がさらに
squircle でマスクするため二重角丸の縁が出る。

そこで:
- 文字を外し、ローソク足だけにする（LPのブランドマークと同じ形）
- **角丸なし・フルブリードの正方形**にする（マスクはOSに任せる）
- グローは焼き込まない

**Android のアダプティブアイコンも同じ形から作る**（2026-09-15 追加）。
それまでの `android-icon-foreground.png` は「FX LOG」入りで、しかも角丸の四角と
影がレイヤー内に焼き込まれていた（Android がさらにマスクするので二重角丸になる）。
不透明だったため background レイヤーは一度も見えていない。`android-icon-monochrome.png`
に至ってはブランドと無関係な「＾」型だった。
- 前景は**透過**で、図形を**セーフゾーン（108dp 中 72dp = 66.6%）の内側**に収める。
  ランチャーは円・四角・角丸など任意の形で切り抜き、さらに視差でずらすため、
  ここを越えると端が欠ける。
- モノクロ（テーマ付きアイコン）は同じ図形のシルエット。色はOSが塗り替えるので
  アルファだけが意味を持つ。

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
# アダプティブアイコンのセーフゾーン。前景レイヤーはこの内側にしか描けない。
ANDROID_SAFE = 72 / 108


def make_background():
    """ダークの斜めグラデーション（不透明）。"""
    bg = Image.new('RGB', (S, S), BG_BOTTOM)
    d = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / (S - 1)
        d.line([(0, y), (S, y)], fill=tuple(
            round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))
    return bg


def make_shapes(content, color=None):
    """ローソク足を透過キャンバスに描く。`content` はキャンバスに対する占有率。

    `color` を渡すと全てその色で塗る（モノクロ用）。
    """
    vx0, vy0, vx1, vy1 = 4.0, 1.0, 28.0, 27.0
    scale = S * content / max(vx1 - vx0, vy1 - vy0)
    ox = (S - (vx1 - vx0) * scale) / 2 - vx0 * scale
    oy = (S - (vy1 - vy0) * scale) / 2 - vy0 * scale

    shapes = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shapes)
    for x, y, w, h, c in BARS:
        box = [ox + x * scale, oy + y * scale, ox + (x + w) * scale, oy + (y + h) * scale]
        sd.rounded_rectangle(box, radius=max(2, int(1.5 * scale)),
                             fill=(color or c) + (255,))
    return shapes


def make_glow(shapes):
    """図形の色をわずかに広げた光。**背景の一部**として置くので、
    アイコンの外周には出ない（外周グローを焼き込まない）。"""
    glow = shapes.filter(ImageFilter.GaussianBlur(S * 0.035))
    glow.putalpha(glow.getchannel('A').point(lambda a: int(a * 0.45)))
    return glow


def save(img, name):
    p = os.path.join(ROOT, 'assets', name)
    img.save(p, optimize=True)
    print(f'  {p}  {img.size}  {os.path.getsize(p) // 1024} KB  mode={img.mode}')
    return p


def main():
    # --- iOS / 共通のアイコン ---
    shapes = make_shapes(CONTENT)
    out = make_background().convert('RGBA')
    out.alpha_composite(make_glow(shapes))
    out.alpha_composite(shapes)
    out = out.convert('RGB')   # アイコンにアルファは持たせない（Appleの要件）
    save(out, 'icon-v2.png')

    # --- Android アダプティブアイコン ---
    # 前景はセーフゾーンの内側。マスクと視差はランチャーに任せる。
    fg_shapes = make_shapes(CONTENT * ANDROID_SAFE)
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    fg.alpha_composite(make_glow(fg_shapes))
    fg.alpha_composite(fg_shapes)
    save(fg, 'android-icon-foreground.png')
    save(make_background(), 'android-icon-background.png')
    # テーマ付きアイコン。OSが単色で塗り替えるのでアルファだけが効く。
    save(make_shapes(CONTENT * ANDROID_SAFE, color=(255, 255, 255)),
         'android-icon-monochrome.png')

    # --- 確認用のプレビュー（リポジトリ外） ---
    # 小さいサイズでの見え方
    prev = Image.new('RGB', (60 + 120 + 180 + 40, 200), (24, 24, 24))
    x = 10
    for n in (60, 120, 180):
        prev.paste(out.resize((n, n), Image.LANCZOS), (x, (200 - n) // 2))
        x += n + 10
    prev.save(os.path.join(ROOT, '..', 'icon-preview.png'))
    print('  縮小プレビュー: Desktop/FXlog/icon-preview.png（60 / 120 / 180 px）')

    # Android は前景＋背景を合成したうえでランチャーの形に切り抜かれる。
    # 円（最も内側まで削られる形）と角丸四角で確認する。
    composed = make_background().convert('RGBA')
    composed.alpha_composite(fg)
    n = 180
    small = composed.resize((n, n), Image.LANCZOS)
    ap = Image.new('RGB', (n * 2 + 30, n + 20), (24, 24, 24))
    for i, shape in enumerate(('circle', 'squircle')):
        mask = Image.new('L', (n, n), 0)
        md = ImageDraw.Draw(mask)
        if shape == 'circle':
            md.ellipse([0, 0, n - 1, n - 1], fill=255)
        else:
            md.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=255)
        ap.paste(small, (10 + i * (n + 10), 10), mask)
    ap.save(os.path.join(ROOT, '..', 'android-icon-preview.png'))
    print('  Androidプレビュー: Desktop/FXlog/android-icon-preview.png（円 / 角丸）')


if __name__ == '__main__':
    main()

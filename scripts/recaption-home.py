#!/usr/bin/env python3
"""ホーム画面のスクリーンショットからヘッダーを落とし、キャプション帯を付け直す。

なぜ要るか: ホーム画面のヘッダーにはアプリ名が出る。**非日本語10ロケールの
素材は改名前（2026-09-09 のブランド統一より前）に撮ったもので、"FX Trade Log"
という旧名が写っている。** 現在のアプリは全言語 `FX Trade Journal` なので、
ストアの画像だけが実物と食い違っている状態だった。

LP側は `make-lp-shots.py` が同じ理由でヘッダーを切り落として回避済み。
こちらはストア用に、切ったうえで 1284x2778 の規格に収める。

- 素材が2種類ある。**帯なし**（de/es/fr/it/id/tr/hi/vi/pt-BR）はそのまま扱えるが、
  **帯あり**（en-US）は `caption-screenshots.py` を掛けた後の画像しか残っていない
  （原本は ASC が正本で手元に無い）ので、帯の中のスクショ部分を切り出してから扱う。
  切り出す座標は `caption-screenshots.py` の配置計算と一致させてある。
  拡大は一切しないので、二度目の縮小による劣化は起きない。
- **原本を上書きしない。** `01_home.png` は残し、`01_home_v2.png` として書き出す。
  `store.config.json` のファイル名一覧が正本で、同名で中身だけ差し替えても
  `eas metadata:push` は何も送らないため、名前を変える必要もある。
- キャプションはアプリ内の文言（`onboarding_step1_title` /
  `onboarding_choice_import_title`）と揃えてある。新しく訳を起こしていない。

必要: Pillow（このリポジトリの依存ではない。ローカル専用のツール）
使い方: python3 scripts/recaption-home.py [出力先ディレクトリ]
        引数を省くと store/ の中に _v2 として書き出す。
"""
import os
import statistics
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
W, H = 1284, 2778
BG = (5, 7, 12, 255)          # --bg / #05070C
FG = (237, 241, 250, 255)     # --ink / #EDF1FA
FONT_JA = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
FONT_EN = '/System/Library/Fonts/Helvetica.ttc'
# デーヴァナーガリー（hi）は Helvetica に字形が無く、豆腐になる
FONT_HI = '/System/Library/Fonts/Kohinoor.ttc'

CAP_TOP, CAP_BOTTOM = 150, 500
SHOT_TOP, SHOT_BOTTOM = 545, 2690

# caption-screenshots.py が帯付き画像を作ったときの配置（切り出しに使う）
CAPTIONED_SCALE = (SHOT_BOTTOM - SHOT_TOP) / H       # 2145/2778
CAPTIONED_W = int(W * CAPTIONED_SCALE)               # 991
CAPTIONED_X = (W - CAPTIONED_W) // 2                 # 146

# キャプション。アプリの i18n から取っており、新規の訳ではない。
CAPTIONS = {
    'de-DE': ['Erfassen mit einem Tipp', 'MT4/MT5-Historie importieren'],
    'es-ES': ['Registra en un toque', 'Importar historial de MT4/MT5'],
    'fr-FR': ['Enregistrez en un geste', "Importer l'historique MT4/MT5"],
    'it':    ['Registra con un tocco', 'Importa lo storico MT4/MT5'],
    'id':    ['Catat dengan Satu Ketukan', 'Impor riwayat MT4/MT5'],
    'tr':    ['Tek Dokunuşla Kaydedin', 'MT4/MT5 geçmişini içe aktarın'],
    'hi':    ['एक टैप में रिकॉर्ड करें', 'MT4/MT5 इतिहास आयात करें'],
    'vi':    ['Ghi Lại Chỉ Với Một Chạm', 'Nhập lịch sử MT4/MT5'],
    'pt-BR': ['Registre com Um Toque', 'Importar histórico do MT4/MT5'],
    # 既に帯が焼かれている。文面は変えず、ヘッダーだけ落とす。
    'en-US': ['Log a trade in one tap.', 'Import MT4/MT5 history.'],
}
# 既に caption-screenshots.py を掛けてある（＝原本ではない）ロケール
ALREADY_CAPTIONED = {'en-US'}


def font_for(locale):
    if locale == 'hi':
        return FONT_HI
    return FONT_EN


def find_divider(im):
    """ヘッダー下の水平区切り線。幅いっぱいで均一かつ、背景より明るい行。

    make-lp-shots.py と同じ判定。座標は素材の解像度に依存するので、
    帯付き素材（縮小済み）に掛けるときは探索範囲を縮尺で割る。
    """
    lo, hi = int(240 * im.width / W), int(420 * im.width / W)
    for y in range(lo, hi):
        row = [im.getpixel((x, y))[:3] for x in range(0, im.width, 16)]
        lum = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in row]
        if statistics.pstdev(lum) < 0.6 and 20 < statistics.mean(lum) < 60:
            return y
    return None


def fit_font(path, lines, max_width, start=76, min_size=44):
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


def load_shot(path, locale):
    """スクショ部分を取り出す。帯付き素材は帯を取り除いてから返す。"""
    im = Image.open(path).convert('RGBA')
    if locale in ALREADY_CAPTIONED:
        im = im.crop((CAPTIONED_X, SHOT_TOP,
                      CAPTIONED_X + CAPTIONED_W, SHOT_BOTTOM))
    return im


def build(path, locale, lines):
    shot = load_shot(path, locale)
    divider = find_divider(shot)
    if divider is None:
        raise SystemExit(f'区切り線が見つからない: {path}（アプリ名が写ったままになる）')
    shot = shot.crop((0, divider + 2, shot.width, shot.height))

    # 拡大しない。帯なし素材は 1284 幅なので 991 まで縮小、
    # 帯あり素材は既に 991 幅なのでそのまま。
    if shot.width > CAPTIONED_W:
        h = round(shot.height * CAPTIONED_W / shot.width)
        shot = shot.resize((CAPTIONED_W, h), Image.LANCZOS)
    shot = rounded(shot, int(58 * CAPTIONED_SCALE))

    canvas = Image.new('RGBA', (W, H), BG)
    # ヘッダーを落とした分だけ縦に余るので、スクショ枠の中で縦中央に置く
    y = SHOT_TOP + ((SHOT_BOTTOM - SHOT_TOP) - shot.height) // 2
    canvas.paste(shot, ((W - shot.width) // 2, y), shot)

    d = ImageDraw.Draw(canvas)
    font = fit_font(font_for(locale), lines, max_width=W - 2 * 110)
    gap = int(font.size * 0.42)
    heights = [font.getbbox(l)[3] - font.getbbox(l)[1] for l in lines]
    total = sum(heights) + gap * (len(lines) - 1)
    ty = (CAP_TOP + CAP_BOTTOM) // 2 - total // 2
    for line, lh in zip(lines, heights):
        bbox = font.getbbox(line)
        d.text(((W - (bbox[2] - bbox[0])) // 2 - bbox[0], ty - bbox[1]),
               line, font=font, fill=FG)
        ty += lh + gap
    return canvas


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else None
    for locale, lines in CAPTIONS.items():
        src = os.path.join(ROOT, 'store', 'apple', 'screenshot', locale,
                           'APP_IPHONE_65', '01_home.png')
        if not os.path.exists(src):
            print(f'  skip (無い): {src}')
            continue
        img = build(src, locale, lines)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
            dst = os.path.join(out_dir, f'{locale}_01_home_v2.png')
        else:
            dst = os.path.join(os.path.dirname(src), '01_home_v2.png')
        img.convert('RGB').save(dst)
        print(f'  {locale:6} -> {dst}  {" / ".join(lines)}')


if __name__ == '__main__':
    main()

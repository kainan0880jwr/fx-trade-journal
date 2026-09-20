#!/usr/bin/env python3
"""App Store のスクリーンショットにキャプション帯を付ける。

なぜ要るか: 検索結果に出るのは先頭3枚で、しかも横幅80〜100px程度の
サムネイル。素の実機スクショだと「暗い画面に何か並んでいる」以上の情報が
伝わらない。上部にキャプションを置いて、何ができるアプリかを文字で伝える。

■ 対象は先頭5枚・11言語（2026-09-20 に 3枚・2言語から拡大）

以前は ja / en-US の先頭3枚だけで、**他9ロケールは全8枚が素のスクショ**だった。
日本語版を見ている限り気づけない類の抜けで、`legalDocs` / `lpPages` のテストと
同じ構図（CLAUDE.md「11言語の整合は機械的に検証すること」）。

4〜5枚目は **PRO 専用の分析画面**なので、帯で PRO と明示する。撮影モードは
`isPremium` を立てて撮るためロック表示が出ず、無印で載せると
「あると思った機能がロックされていた」になる（Guideline 2.3.1）。

■ 文字の描画は Pillow ではなく CoreText（scripts/textshot.swift）

このマシンの Pillow は **libraqm 無し**でビルドされており、複雑文字体系の
シェーピングを一切しない。ヒンディー語が論理順のまま並び、「दिन」が「दनि」に、
「दर्ज」の reph が落ち、「प्रॉफिट」の合字が崩れる。**字形は存在するので、
豆腐（.notdef）を探す検査では見つからない。** 配信先にインドが含まれる以上
これで出荷はできないので、macOS 標準の CoreText に描かせる（追加の依存は不要）。

フォントは言語ごとに PostScript 名で指定する。太字が要る:
  - ja    … HiraginoSans-W6
  - hi    … KohinoorDevanagari-Bold
  - その他 … Helvetica-Bold（tr の ğİ も vi の声調記号も持っている）
**CoreText は欠けた文字を黙って別のフォントで補う。** 豆腐にはならない代わりに
書体が入れ替わるので、`textshot` が実際に使ったフォント名を返し、要求と違ったら
ここで失敗させる。

■ ファイル名

キーは **`01_home` のように世代サフィックス（`_v4`）を含めない**。`<キー>*.png` で
探す。撮り直しのたびに世代を上げる運用（CLAUDE.md、同名だと `metadata:push` が
何も送らない）と、この表を切り離しておくため。

■ 出力

- 1284x2778 のまま（App Store の規格）。スクショを縮小して下に敷く。
- 背景はアプリのダーク背景と同じ #05070C。LP・共有カードとも揃う。
- **原本を `_originals/` に退避してから加工する。** 以前は原本を上書きしており、
  二度掛けると帯が二重になった。いまは原本から毎回描き直すので冪等。
  `_originals/` は `store.config.json` の一覧に載らないので push の対象外。

必要: Pillow（このリポジトリの依存ではない。ローカル専用のツール）
  python3 -m pip install --user Pillow

使い方: python3 scripts/caption-screenshots.py
"""
import glob
import json
import os
import shutil
import subprocess
import tempfile
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..')
W, H = 1284, 2778
BG = (5, 7, 12, 255)          # --bg / #05070C
FG = (237, 241, 250, 255)     # --ink / #EDF1FA

# PostScript 名で指定する（CoreText がこれで引く）。
FONT_LATIN = 'Helvetica-Bold'
FONTS = {'ja': 'HiraginoSans-W6', 'hi': 'KohinoorDevanagari-Bold'}

SWIFT_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'textshot.swift')
SWIFT_BIN = os.path.join(tempfile.gettempdir(), 'fxlog-textshot')

CAP_TOP, CAP_BOTTOM = 150, 500   # キャプション帯（この中で縦中央に置く）
SHOT_TOP, SHOT_BOTTOM = 545, 2690

ORIG_DIR = '_originals'

# 先頭3枚は「何のアプリか」と「自分にも記録できそう」。PRO はここに置かない
# （検索結果に出る位置で有料アプリだと判断される余地を作らないため）。
CAPTIONS = {
    'ja': {
        '01_home':             ['記録は1タップ。', 'MT4/MT5の履歴も取り込める'],
        '02_monthly':          ['勝率・pips・PFを', '自動で集計'],
        '03_entry':            ['入力はかんたん。', 'クイックなら数字だけ'],
        '04_analysis_time':    ['時間帯・曜日ごとの成績', 'PRO で見られます'],
        '05_analysis_equity':  ['資産の推移をグラフで', 'PRO で見られます'],
    },
    'en-US': {
        '01_home':             ['Log a trade in one tap.', 'Import MT4/MT5 history.'],
        '02_monthly':          ['Win rate, pips and', 'profit factor, calculated.'],
        '03_entry':            ['Entry stays simple.', 'Quick mode takes numbers only.'],
        '04_analysis_time':    ['Results by hour and weekday.', 'Included with PRO.'],
        '05_analysis_equity':  ['Follow your equity curve.', 'Included with PRO.'],
    },
    'de-DE': {
        '01_home':             ['Trade-Eintrag per Tipp.', 'MT4/MT5-Verlauf importieren.'],
        '02_monthly':          ['Trefferquote, Pips und', 'Profitfaktor – automatisch.'],
        '03_entry':            ['Eingabe bleibt einfach.', 'Im Schnellmodus nur Zahlen.'],
        '04_analysis_time':    ['Ergebnisse nach Zeit und Tag.', 'Teil von PRO.'],
        '05_analysis_equity':  ['Kapitalkurve im Blick.', 'Teil von PRO.'],
    },
    'es-ES': {
        '01_home':             ['Registra con un toque.', 'Importa historial MT4/MT5.'],
        '02_monthly':          ['Tasa de acierto, pips y', 'factor de beneficio, al instante.'],
        '03_entry':            ['Registrar es sencillo.', 'En modo rápido, solo números.'],
        '04_analysis_time':    ['Resultados por hora y día.', 'Incluido en PRO.'],
        '05_analysis_equity':  ['Sigue tu curva de capital.', 'Incluido en PRO.'],
    },
    'fr-FR': {
        '01_home':             ['Un geste pour enregistrer.', 'Importez MT4/MT5.'],
        '02_monthly':          ['Taux de réussite, pips et', 'facteur de profit, calculés.'],
        '03_entry':            ['La saisie reste simple.', 'En mode rapide, que des chiffres.'],
        '04_analysis_time':    ['Résultats par heure et jour.', 'Inclus dans PRO.'],
        '05_analysis_equity':  ['Suivez votre courbe de capital.', 'Inclus dans PRO.'],
    },
    'it': {
        '01_home':             ['Registri con un tocco.', 'Importa lo storico MT4/MT5.'],
        '02_monthly':          ['Win rate, pips e', 'profit factor, in automatico.'],
        '03_entry':            ['Inserire è semplice.', 'In modalità rapida, solo numeri.'],
        '04_analysis_time':    ['Risultati per ora e giorno.', 'Incluso in PRO.'],
        '05_analysis_equity':  ['Segui la curva del capitale.', 'Incluso in PRO.'],
    },
    'pt-BR': {
        '01_home':             ['Registre com um toque.', 'Importe o histórico MT4/MT5.'],
        '02_monthly':          ['Taxa de acerto, pips e', 'fator de lucro, automáticos.'],
        '03_entry':            ['Registrar é simples.', 'No modo rápido, só números.'],
        '04_analysis_time':    ['Resultados por hora e dia.', 'Incluído no PRO.'],
        '05_analysis_equity':  ['Acompanhe sua curva de capital.', 'Incluído no PRO.'],
    },
    'tr': {
        '01_home':             ['Tek dokunuşla kaydet.', 'MT4/MT5 geçmişini içe aktar.'],
        '02_monthly':          ['Kazanma oranı, pip ve', 'kâr faktörü otomatik.'],
        '03_entry':            ['Girmek çok kolay.', 'Hızlı modda sadece sayılar.'],
        '04_analysis_time':    ['Saate ve güne göre sonuçlar.', "PRO'ya dahil."],
        '05_analysis_equity':  ['Bakiye eğrinizi izleyin.', "PRO'ya dahil."],
    },
    'hi': {
        '01_home':             ['एक टैप में ट्रेड दर्ज।', 'MT4/MT5 हिस्ट्री इम्पोर्ट करें।'],
        '02_monthly':          ['विन रेट, पिप्स और', 'प्रॉफिट फैक्टर अपने आप।'],
        '03_entry':            ['दर्ज करना आसान है।', 'क्विक मोड में सिर्फ़ नंबर।'],
        '04_analysis_time':    ['घंटे और दिन के नतीजे।', 'PRO में शामिल।'],
        '05_analysis_equity':  ['अपनी इक्विटी कर्व देखें।', 'PRO में शामिल।'],
    },
    'vi': {
        '01_home':             ['Ghi giao dịch chỉ một chạm.', 'Nhập lịch sử MT4/MT5.'],
        '02_monthly':          ['Tỷ lệ thắng, pip và', 'profit factor tự động.'],
        '03_entry':            ['Nhập liệu rất đơn giản.', 'Chế độ nhanh chỉ cần số.'],
        '04_analysis_time':    ['Kết quả theo giờ và thứ.', 'Có trong PRO.'],
        '05_analysis_equity':  ['Theo dõi đường vốn của bạn.', 'Có trong PRO.'],
    },
    'id': {
        '01_home':             ['Catat dengan sekali ketuk.', 'Impor riwayat MT4/MT5.'],
        '02_monthly':          ['Win rate, pips, dan', 'profit factor otomatis.'],
        '03_entry':            ['Mencatat itu sederhana.', 'Mode cepat cukup angka.'],
        '04_analysis_time':    ['Hasil per jam dan hari.', 'Termasuk di PRO.'],
        '05_analysis_equity':  ['Pantau kurva ekuitas Anda.', 'Termasuk di PRO.'],
    },
}


def build_helper():
    """textshot をその場でビルドする。ソースより新しければ作り直さない。"""
    if (os.path.exists(SWIFT_BIN)
            and os.path.getmtime(SWIFT_BIN) >= os.path.getmtime(SWIFT_SRC)):
        return
    subprocess.run(['swiftc', '-O', '-o', SWIFT_BIN, SWIFT_SRC], check=True)


def render_text(locale, lines, max_width):
    """キャプションの文字列を透過PNGにして返す。

    戻り値は (画像, 使われたフォント名の集合)。**使われたフォントは呼び出し側で
    必ず確かめること** — CoreText は欠けた文字を黙って別のフォントで補うので、
    豆腐にはならない代わりに書体が入れ替わる。
    """
    font = FONTS.get(locale, FONT_LATIN)
    payload = json.dumps({
        'lines': lines, 'font': font, 'maxWidth': max_width,
        'start': 76, 'min': 44, 'gapRatio': 0.42,
        'color': [FG[0], FG[1], FG[2]],
    })
    with tempfile.NamedTemporaryFile(suffix='.png') as tmp:
        r = subprocess.run([SWIFT_BIN, tmp.name], input=payload.encode('utf-8'),
                           capture_output=True, check=True)
        used = r.stdout.decode('utf-8').split()[1].split(',')
        return Image.open(tmp.name).convert('RGBA'), set(used)


def rounded(im, radius):
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1],
                                           radius=radius, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def caption(src, lines, locale):
    shot = Image.open(src).convert('RGBA')

    # 高さ優先で縮小（幅で決めると入りきらない）
    avail_h = SHOT_BOTTOM - SHOT_TOP
    scale = avail_h / shot.height
    new_w, new_h = int(shot.width * scale), avail_h
    shot = shot.resize((new_w, new_h), Image.LANCZOS)
    shot = rounded(shot, int(58 * scale))

    canvas = Image.new('RGBA', (W, H), BG)
    canvas.paste(shot, ((W - new_w) // 2, SHOT_TOP), shot)

    text, used = render_text(locale, lines, max_width=W - 2 * 110)
    want = FONTS.get(locale, FONT_LATIN)
    if used != {want}:
        raise SystemExit(
            f'!! {locale}: 要求したフォント({want})以外が使われた: {sorted(used)}\n'
            '   CoreText が欠けた文字を別のフォントで補っている。'
            '書体が混ざったまま出荷しないよう、FONTS の割り当てを直すこと。')
    canvas.paste(text, ((W - text.width) // 2,
                        (CAP_TOP + CAP_BOTTOM) // 2 - text.height // 2), text)
    return canvas


def main():
    build_helper()
    total = 0
    for locale, files in CAPTIONS.items():
        base = os.path.join(ROOT, 'store', 'apple', 'screenshot', locale, 'APP_IPHONE_65')
        orig = os.path.join(base, ORIG_DIR)
        for key, lines in files.items():
            hits = sorted(f for f in glob.glob(os.path.join(base, key + '*.png')))
            if len(hits) != 1:
                print(f'  skip ({len(hits)}件ヒット): {locale}/{key}*.png')
                continue
            p = hits[0]
            o = os.path.join(orig, os.path.basename(p))
            if not os.path.exists(o):
                os.makedirs(orig, exist_ok=True)
                shutil.copy2(p, o)          # 原本を退避。以後はここから描き直す
            caption(o, lines, locale).save(p)
            print(f'  {locale}/{os.path.basename(p)}  {" / ".join(lines)}')
            total += 1
    print(f'{total} 枚に帯を付けた')


if __name__ == '__main__':
    main()

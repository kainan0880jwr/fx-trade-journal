#!/usr/bin/env python3
"""スクリーンショットからアルファチャンネルを落とす。**push の前に必ず通すこと。**

■ なぜ要るか

App Store Connect はアルファ付きの画像を受け付けない。`eas metadata:push` は
  Error processing screenshot '01_home_v4.png'.
  IMAGE_ALPHA_NOT_ALLOWED - IMAGE_ALPHA_NOT_ALLOWED
で止まる（2026-09-22 に実際に踏んだ）。

**`xcrun simctl io screenshot` は RGBA で書き出す。** つまり撮ったままのファイルは
必ずこの条件に引っかかる。`caption-screenshots.py` も RGBA のキャンバスに合成して
いたので、帯を付けても消えなかった（こちらは同日に RGB 保存へ直した）。

質が悪いのは **`metadata:push` が「先に消してから上げる」順で動く**こと。
上げる側で失敗すると、そのロケールのスクリーンショットが**消えたまま**残る。
実際 en-US の8枚が消えた状態で止まった。作り直して push し直せば復旧するが、
**途中で失敗しない状態にしてから走らせる**のが前提。

■ 何をするか

`store.config.json` に並んでいるファイルだけを対象に、アルファがあれば RGB へ
変換して上書きする。アルファは実測で全面不透明（extrema の下限が 255）なので、
落としても見た目は変わらない。透明な画素があれば黒地に合成されるため、
**不透明でないファイルは変換せず報告して止める。**

必要: Pillow（このリポジトリの依存ではない。ローカル専用のツール）

使い方: python3 scripts/flatten-screenshots.py [--check]
  --check を付けると変換せず、アルファ付きが残っていないかだけ調べる（終了コードで返す）
"""
import json
import os
import sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
ALPHA_MODES = ('RGBA', 'LA', 'PA', 'P')


def listed_files():
    with open(os.path.join(ROOT, 'store.config.json'), encoding='utf-8') as f:
        config = json.load(f)
    for info in config['apple']['info'].values():
        for paths in info.get('screenshots', {}).values():
            for p in paths:
                yield os.path.join(ROOT, p)


def main():
    check_only = '--check' in sys.argv
    missing, transparent, converted, already = [], [], 0, 0

    for path in listed_files():
        if not os.path.exists(path):
            missing.append(path)
            continue
        with Image.open(path) as im:
            if im.mode not in ALPHA_MODES:
                already += 1
                continue
            rgba = im.convert('RGBA')
            lo, _ = rgba.getchannel('A').getextrema()
            if lo != 255:
                # 透明な画素がある。黒地に合成すると見た目が変わるので、勝手に潰さない。
                transparent.append(path)
                continue
            if check_only:
                converted += 1          # --check では「要変換」の件数として数える
                continue
            rgba.convert('RGB').save(path)
            converted += 1

    if missing:
        print(f'!! store.config.json が参照するファイルが {len(missing)} 件無い:')
        for p in missing[:5]:
            print('   ', os.path.relpath(p, ROOT))
        raise SystemExit(1)

    if transparent:
        print(f'!! 透明な画素を含むファイルが {len(transparent)} 件ある。'
              '黒地に合成すると見た目が変わるので自動変換しない:')
        for p in transparent[:5]:
            print('   ', os.path.relpath(p, ROOT))
        raise SystemExit(1)

    if check_only:
        if converted:
            print(f'!! アルファ付きが {converted} 件残っている。'
                  'push する前に python3 scripts/flatten-screenshots.py を実行すること。')
            raise SystemExit(1)
        print(f'OK: {already} 枚すべてアルファ無し')
        return

    print(f'変換 {converted} 枚 / 元からアルファ無し {already} 枚')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
ストア説明文にウィジェット節を追加する（審査通過後に実行する想定）。

v1.3.0 で追加したホーム画面／ロック画面ウィジェットが、11言語すべての
説明文に一度も出てこない状態だった。v1.3.1 でようやく実際に動くように
なった（ExtensionStorage が同梱されず半年間プレースホルダのままだった）
ので、ここで初めて訴求できる。

審査待ち／審査中のバージョンのメタデータを触ると差し戻しになりうるため、
このスクリプトは通過後に実行すること。

  python3 scripts/apply-store-copy-widgets.py
  npx eas-cli metadata:push --profile production

何度実行しても二重には入らない。
"""
import json, io, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF = os.path.join(ROOT, 'store.config.json')

# 見出し付きの節（de/en/es/fr/it/ja）と、箇条書きだけ追加する簡易版
# （hi/id/pt-BR/tr/vi は「主な機能」1節にまとまっているため）
SECTION = {
'ja': ("""■ ホーム画面ウィジェット

・今月の勝率と合計pipsをひと目で確認
・中サイズではプロフィットファクター・取引件数・連続記録日数も表示
・ロック画面ウィジェットにも対応
・タップするとすぐ記録画面が開く

""", '■ こんな方におすすめ'),
'en-US': ("""■ Home Screen widgets

・See this month's win rate and total pips at a glance
・The medium size also shows profit factor, trade count and your logging streak
・Lock Screen widgets included
・Tap any widget to jump straight to the trade entry screen

""", "■ Who it's for"),
'de-DE': ("""■ Home-Bildschirm-Widgets

・Trefferquote und Gesamt-Pips des Monats auf einen Blick
・Die mittlere Größe zeigt zusätzlich Profitfaktor, Anzahl der Trades und deine Erfassungs-Serie
・Auch Widgets für den Sperrbildschirm
・Ein Tipp öffnet direkt die Trade-Erfassung

""", '■ Für wen geeignet'),
'fr-FR': ("""■ Widgets d'écran d'accueil

・Taux de réussite et total de pips du mois en un coup d'œil
・La taille moyenne affiche aussi le profit factor, le nombre de trades et votre série
・Widgets d'écran verrouillé également disponibles
・Un appui ouvre directement la saisie d'un trade

""", '■ Pour qui'),
'es-ES': ("""■ Widgets de pantalla de inicio

・Tasa de acierto y pips totales del mes de un vistazo
・El tamaño mediano muestra además el profit factor, el número de operaciones y tu racha
・También widgets para la pantalla de bloqueo
・Un toque abre directamente el registro de una operación

""", '■ Para quién es'),
'it': ("""■ Widget per la schermata Home

・Percentuale di vincita e pips totali del mese a colpo d'occhio
・La dimensione media mostra anche profit factor, numero di operazioni e la tua serie
・Disponibili anche widget per la schermata di blocco
・Un tocco apre direttamente la registrazione di un'operazione

""", '■ Per chi è pensata'),
}

# 「主な機能」型のロケールは、その節の末尾に箇条書きを足す
BULLETS = {
'hi': ('・होम स्क्रीन विजेट: इस माह की विन रेट और कुल pips एक नज़र में (लॉक स्क्रीन विजेट भी)', '■ यह किनके लिए सही है'),
'id': ('・Widget Layar Utama: win rate dan total pips bulan ini sekilas (juga widget Layar Kunci)', '■ Cocok untuk trader yang'),
'pt-BR': ('・Widgets na Tela de Início: taxa de acerto e pips do mês num relance (também na Tela Bloqueada)', '■ Ideal para traders que'),
'tr': ('・Ana Ekran widget’ları: bu ayın kazanma oranı ve toplam pip’i tek bakışta (Kilit Ekranı widget’ları da var)', '■ Şunlar için idealdir'),
'vi': ('・Tiện ích Màn hình chính: tỷ lệ thắng và tổng pips tháng này trong nháy mắt (có cả tiện ích Màn hình khóa)', '■ Phù hợp với những trader'),
}

MARK = ('ウィジェット', 'idget', 'विजेट', 'widget')


def already(text: str) -> bool:
    return any(m in text for m in MARK)


def main() -> int:
    conf = json.load(io.open(CONF, encoding='utf-8'))
    info = conf['apple']['info']
    changed = []
    for loc, d in info.items():
        desc = d.get('description') or ''
        if already(desc):
            print(f'{loc:7} 既に記載あり。スキップ')
            continue
        if loc in SECTION:
            block, anchor = SECTION[loc]
            if anchor not in desc:
                print(f'{loc:7} ✖ 挿入位置 "{anchor}" が見つからない', file=sys.stderr)
                continue
            desc = desc.replace(anchor, block + anchor, 1)
        elif loc in BULLETS:
            line, anchor = BULLETS[loc]
            if anchor not in desc:
                print(f'{loc:7} ✖ 挿入位置 "{anchor}" が見つからない', file=sys.stderr)
                continue
            desc = desc.replace('\n' + anchor, '\n' + line + '\n\n' + anchor, 1)
        else:
            print(f'{loc:7} 対象外', file=sys.stderr)
            continue

        if len(desc) > 4000:
            print(f'{loc:7} ✖ 4000字を超える ({len(desc)})', file=sys.stderr)
            continue
        d['description'] = desc
        changed.append(loc)
        print(f'{loc:7} 追加 ({len(desc)}文字)')

    if changed:
        json.dump(conf, io.open(CONF, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print(f'\n{len(changed)}言語を更新した。反映するには:')
        print('  npx eas-cli metadata:push --profile production')
    else:
        print('\n変更なし')
    return 0


if __name__ == '__main__':
    sys.exit(main())

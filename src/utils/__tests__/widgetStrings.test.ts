/**
 * ウィジェットのローカライズを固定する。
 *
 * **仕組みが特殊なので壊れ方も特殊。** Swift 側は
 * `.configurationDisplayName("成績サマリー")` のように**日本語の文字列リテラルを
 * そのままキー**として使い、各 `*.lproj/Localizable.strings` がそれを翻訳に写す。
 * つまり **Swift のリテラルを1文字でも変えるとキーが変わり、全言語で翻訳が外れて
 * 日本語がそのまま出る**（英語環境に「成績サマリー」と表示される）。
 * 型でもコンパイルでも捕まらない。
 *
 * 加えて 1.3.5 で「期間を選ぶ」ウィジェット（AppIntents）を足したため、
 * 選択肢の表示名も同じ仕組みに乗っている。対象が増えたぶん外れやすい。
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const WIDGET_DIR = join(ROOT, 'targets', 'widget');
const SWIFT = readFileSync(join(WIDGET_DIR, 'FXWidget.swift'), 'utf8');

const LPROJ = readdirSync(WIDGET_DIR).filter(n => n.endsWith('.lproj')).sort();

/** `"キー" = "訳";` を読む。値に含まれる `\"` は素通しでよい（キーだけ使う）。 */
function keysOf(locale: string): string[] {
  const text = readFileSync(join(WIDGET_DIR, locale, 'Localizable.strings'), 'utf8');
  return [...text.matchAll(/^"((?:[^"\\]|\\.)*)"\s*=/gm)].map(m => m[1].replace(/\\"/g, '"'));
}

/** Swift 側で翻訳キーとして使っている日本語リテラルを拾う。 */
function swiftKeys(): string[] {
  const found = new Set<string>();
  const patterns = [
    /\.configurationDisplayName\("([^"]+)"\)/g,
    /\.description\("([^"]+)"\)/g,
    /IntentDescription\("([^"]+)"\)/g,
    /static var title: LocalizedStringResource = "([^"]+)"/g,
    /static var typeDisplayRepresentation: TypeDisplayRepresentation = "([^"]+)"/g,
    /@Parameter\(title: "([^"]+)"/g,
    // caseDisplayRepresentations の `.day: "今日",` 形式
    /^\s*\.\w+:\s*"([^"]+)",\s*$/gm,
  ];
  for (const re of patterns) {
    for (const m of SWIFT.matchAll(re)) found.add(m[1]);
  }
  return [...found].sort();
}

describe('ウィジェットのローカライズ', () => {
  it('11言語ぶんの .lproj がある', () => {
    expect(LPROJ).toHaveLength(11);
  });

  it('Swift のリテラルを実際に拾えている（検出そのものの確認）', () => {
    const keys = swiftKeys();
    expect(keys.length).toBeGreaterThanOrEqual(8);
    expect(keys).toContain('成績サマリー');
    expect(keys).toContain('期間を選ぶ');
  });

  it.each(LPROJ)('%s に Swift のキーが過不足なく揃っている', (locale) => {
    // 不足 → その項目だけ日本語のまま出る。
    // 余り → Swift から消したのに残っている（次に誰かが読んで混乱する）。
    const have = new Set(keysOf(locale));
    const want = swiftKeys();
    const missing = want.filter(k => !have.has(k));
    const extra = [...have].filter(k => !want.includes(k));
    expect({ locale, missing, extra }).toEqual({ locale, missing: [], extra: [] });
  });

  it.each(LPROJ.filter(l => l !== 'ja.lproj'))('%s の訳がキーと同一のまま放置されていない', (locale) => {
    // 日本語以外でキー＝値なら、翻訳を入れ忘れている。
    const text = readFileSync(join(WIDGET_DIR, locale, 'Localizable.strings'), 'utf8');
    const same = [...text.matchAll(/^"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)";/gm)]
      .filter(m => m[1] === m[2])
      .map(m => m[1]);
    expect({ locale, same }).toEqual({ locale, same: [] });
  });

  it('ウィジェットは WidgetBundle でまとめて登録されている', () => {
    // Widget 個別に @main を付けると、そちらしかギャラリーに出ない
    // （追加したウィジェットが「存在するのに見つからない」形になる）。
    expect(SWIFT).toMatch(/@main\s+struct \w+: WidgetBundle/);
    expect(SWIFT).not.toMatch(/@main\s+struct \w+: Widget\b/);
  });
});

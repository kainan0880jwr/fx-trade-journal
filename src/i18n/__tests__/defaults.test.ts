import { ja } from '../ja';
import { en } from '../en';
import { de } from '../de';
import { fr } from '../fr';
import { es } from '../es';
import { it as itIT } from '../it'; // Jest の it と衝突するため別名にする
import { id as idID } from '../id';
import { tr } from '../tr';
import { hi } from '../hi';
import { vi } from '../vi';
import { pt } from '../pt';

/**
 * 新規インストール時に投入される既定タグ・既定ルールが、全言語に揃っていることを固定する。
 *
 * 以前はロケールに関係なく日本語の固定文字列を投入していたため、11言語・16か国に
 * 配信しているのに、ドイツ人でもブラジル人でも初回に開く記録画面に日本語のタグが
 * 10個とルールが7項目並んでいた。1言語でも欠けると、その言語のユーザーだけ既定値が
 * 空のまま記録画面に入ることになる。
 */
const ALL = { ja, en, de, fr, es, it: itIT, id: idID, tr, hi, vi, pt } as const;

describe.each(Object.entries(ALL))('%s の既定値', (_lang, dict) => {
  const d = dict as unknown as Record<string, unknown>;

  it.each(['default_tags', 'default_rules'])('%s が空でない文字列の配列である', (key) => {
    const v = d[key];
    expect(Array.isArray(v)).toBe(true);
    const arr = v as unknown[];
    expect(arr.length).toBeGreaterThan(0);
    for (const item of arr) {
      expect(typeof item).toBe('string');
      expect((item as string).trim().length).toBeGreaterThan(0);
    }
  });
});

describe('言語間の項目数', () => {
  it('全言語で同じ数だけ用意されている', () => {
    const tagCounts = new Set(Object.values(ALL).map((d) => (d as any).default_tags.length));
    const ruleCounts = new Set(Object.values(ALL).map((d) => (d as any).default_rules.length));
    expect(tagCounts.size).toBe(1);
    expect(ruleCounts.size).toBe(1);
  });

  it('日本語以外に、日本語の既定値がそのまま残っていない', () => {
    // 翻訳漏れで日本語が混ざると、その言語のユーザーだけ読めない項目が出る。
    for (const [lang, d] of Object.entries(ALL)) {
      if (lang === 'ja') continue;
      const all = [...(d as any).default_tags, ...(d as any).default_rules].join(' ');
      expect(all).not.toMatch(/[ぁ-んァ-ヴ一-龥]/);
    }
  });
});

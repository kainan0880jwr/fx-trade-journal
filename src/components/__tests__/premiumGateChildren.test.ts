/**
 * PremiumGate に「空の children」を渡していないことを固定する。
 *
 * **なぜ要るか。** PremiumGate は children を薄く描いて「何が手に入るか」を
 * 見せる設計（`previewContent` + グラデーション）だが、2026-09-17 まで
 * 分析タブ（stats.tsx）と月次の週次/インサイト（monthly.tsx）だけが
 * `<PremiumGate ...><View /></PremiumGate>` と**空の View** を渡しており、
 * プレビューに何も映っていなかった。ロックに当たった人の大半が通る経路なのに、
 * 見えるのは情報ゼロの壁だけ、という状態が長期間気づかれなかった。
 *
 * 型では防げない（children: React.ReactNode は <View /> を受け入れる）ので、
 * ソースを走査して機械的に止める。
 *
 * 落ちたときの直し方: その画面の実コンテンツを children に渡すこと。
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

describe('PremiumGate の children', () => {
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))]
    .filter(f => !f.endsWith('PremiumGate.tsx'));
  const users = files.filter(f => readFileSync(f, 'utf8').includes('<PremiumGate'));

  it('検出そのものが機能している（利用箇所を見つけられる）', () => {
    expect(users.length).toBeGreaterThan(0);
  });

  it('空の children（<View /> だけ・children 無し）を渡していない', () => {
    const offenders: string[] = [];
    for (const file of users) {
      const text = readFileSync(file, 'utf8');
      const rel = file.replace(ROOT + '/', '');
      if (/<PremiumGate[^>]*>\s*<View\s*\/>\s*<\/PremiumGate>/.test(text)) {
        offenders.push(`${rel}: children が <View /> だけ`);
      }
      if (/<PremiumGate[^>]*\/>/.test(text)) {
        offenders.push(`${rel}: children が無い（自己終了タグ）`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

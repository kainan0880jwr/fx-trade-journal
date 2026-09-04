import { execSync } from 'child_process';
import { join } from 'path';

/**
 * アクセント色のベタ塗りの上に白を直書きしていないかを機械的に検出する。
 *
 * `contrast.test.ts` はパレット内の色同士しか見ないので、「どの画面でどの色を
 * どの背景に載せたか」は検証できない。実際、31箇所を `C.onAccent` に置き換えた際に
 * 小文字の `'#fff'` で書かれた2箇所（カレンダーの指標切替チップ）を取りこぼし、
 * ダークモードで 3.71:1 のまま残っていた。目視とgrepの大文字小文字だけが頼りの
 * 状態だったので、ここで固定する。
 *
 * 白のままでよいのは、テーマに連動しない固定の暗い面だけ（下の ALLOWED を参照）。
 */
const ROOT = join(__dirname, '..', '..', '..');

/**
 * 白の直書きを許容する箇所。**追加するときは理由を必ず書くこと。**
 * ここに足すのは「テーマが変わっても背景が暗いままだと保証できる」場合に限る。
 */
const ALLOWED: { file: string; why: string }[] = [
  { file: 'src/utils/shareUtils.ts', why: '共有カードのHTML。背景 #0D0D0D 固定でテーマに連動しない' },
  { file: 'app/trade/[id].tsx', why: '画像ビューアの閉じるボタン。全画面オーバーレイの上' },
  { file: 'app/_layout.tsx', why: '静的StyleSheetの既定値。描画側で C.onAccent を重ねている' },
  { file: 'src/components/ErrorBoundary.tsx', why: '同上' },
];

function grepWhiteLiterals(): string[] {
  // 背景・枠線・影の白は対象外（前景色だけを見る）
  const cmd =
    `grep -rniE "color: *['\\"]#(fff|ffffff)['\\"]|color=\\{?['\\"]#(fff|ffffff)['\\"]" app src ` +
    `|| true`;
  const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/backgroundColor|borderColor|shadowColor/i.test(l));
}

describe('アクセント塗りの上の前景色', () => {
  it('白の直書きは許可リストのファイルにしか無い', () => {
    const allowed = ALLOWED.map((a) => a.file);
    const violations = grepWhiteLiterals().filter(
      (line) => !allowed.some((f) => line.startsWith(`${f}:`))
    );
    // 落ちたら: その箇所の背景を確認し、アクセント色の塗りなら C.onAccent を使う。
    // テーマに連動しない暗い面なら ALLOWED に理由付きで追加する。
    expect(violations).toEqual([]);
  });
});

import { signedQuickPips } from '../pipsCalc';

describe('signedQuickPips', () => {
  it('「負け」を選んだら符号なし入力を負に変換する（本不具合の中核）', () => {
    // 入力欄は decimal-pad でマイナスキーが無く、ユーザーは 50 としか入力できない。
    // これが +50 として保存されていたため、合計pipsが負けでも増えていた。
    expect(signedQuickPips('50', 'loss')).toBe(-50);
    expect(signedQuickPips('20.5', 'loss')).toBe(-20.5);
  });

  it('「勝ち」は正のまま', () => {
    expect(signedQuickPips('50', 'win')).toBe(50);
    expect(signedQuickPips('20.5', 'win')).toBe(20.5);
  });

  it('既に符号付きの値を渡しても、結果に従って正規化する（編集時の二重反転を防ぐ）', () => {
    expect(signedQuickPips('-50', 'loss')).toBe(-50);
    expect(signedQuickPips('-50', 'win')).toBe(50);
  });

  it('「引き分け」は入力値をそのまま尊重する', () => {
    expect(signedQuickPips('0', 'even')).toBe(0);
    expect(signedQuickPips('3', 'even')).toBe(3);
    expect(signedQuickPips('-3', 'even')).toBe(-3);
  });

  it('未入力・空白のみは null', () => {
    expect(signedQuickPips('', 'win')).toBeNull();
    expect(signedQuickPips('   ', 'loss')).toBeNull();
  });

  it('数値でない入力は null（NaNを保存させない）', () => {
    expect(signedQuickPips('abc', 'win')).toBeNull();
    expect(signedQuickPips('-', 'loss')).toBeNull();
  });

  it('結果が未選択でも入力値をそのまま返す', () => {
    expect(signedQuickPips('12', null)).toBe(12);
  });

  it('負けを積み重ねても合計が増えないこと（症状そのものの回帰テスト）', () => {
    const entries: Array<[string, 'win' | 'loss']> = [
      ['100', 'win'], ['50', 'loss'], ['30', 'loss'], ['20', 'loss'],
    ];
    const total = entries.reduce((s, [raw, r]) => s + (signedQuickPips(raw, r) ?? 0), 0);
    expect(total).toBe(0); // 修正前は +200 になっていた
  });
});

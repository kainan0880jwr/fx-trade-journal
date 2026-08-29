import { calcBadges, nearlyUnlocked, BADGE_DEFS } from '../badges';
import type { Trade } from '../../types';

jest.mock('../../i18n', () => ({ t: (k: string) => k, tArr: () => [] }));

let seq = 0;
function trade(date: string, o: Partial<Trade> = {}): Trade {
  // 本番の trade.date は必ず時刻付き（'2026-08-30T14:30:00'）で保存される。
  // 日付のみを渡すテストは、日付処理の不具合を検出できない。
  const stamped = date.length === 10 ? `${date}T09:30:00` : date;
  return {
    id: `t${seq++}`, date: stamped, pair: 'USD/JPY', direction: 'buy',
    entryRate: null, exitRate: null, stopLoss: null, takeProfit: null, plannedRR: null,
    lotSize: 0.1, style: 'day', tags: [], imageUris: [], entryMethod: 'quick',
    pips: null, profitLoss: null, result: 'even',
    reflection: '', selfRating: 3, bookmarked: false,
    mentalFocus: null, mentalCalm: null, mentalFear: null, ruleChecks: [],
    tfWeekly: '', tfDaily: '', tf4h: '', tf1h: '', createdAt: stamped,
    ...o,
  } as Trade;
}

function get(badges: ReturnType<typeof calcBadges>, id: string) {
  const b = badges.find(x => x.id === id);
  if (!b) throw new Error(`バッジ ${id} が無い`);
  return b;
}

describe('バッジ定義', () => {
  it('idが重複していない', () => {
    const ids = BADGE_DEFS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('トレード0件でも全バッジが未解除で返る（クラッシュしない）', () => {
    const r = calcBadges([]);
    expect(r.length).toBe(BADGE_DEFS.length);
    expect(r.every(b => !b.unlocked)).toBe(true);
  });
});

describe('日単位バッジ', () => {
  it('その日の全トレードに損切りがある日だけ数える', () => {
    const b = calcBadges([
      // 3件すべてSLあり → 成立
      trade('2026-08-01', { stopLoss: 150 }), trade('2026-08-01', { stopLoss: 150 }), trade('2026-08-01', { stopLoss: 150 }),
      // 1件だけSLが無い → 不成立
      trade('2026-08-02', { stopLoss: 150 }), trade('2026-08-02', { stopLoss: 150 }), trade('2026-08-02'),
    ]);
    expect(get(b, 'day_sl').progress).toBe(1);
  });

  it('2件しかない日は成立しない（簡単すぎるため3件以上が条件）', () => {
    const b = calcBadges([
      trade('2026-08-01', { stopLoss: 150 }), trade('2026-08-01', { stopLoss: 150 }),
    ]);
    expect(get(b, 'day_sl').progress).toBe(0);
  });

  it('3日そろえば解除される', () => {
    const trades: Trade[] = [];
    for (const d of ['2026-08-01', '2026-08-02', '2026-08-03']) {
      for (let i = 0; i < 3; i++) trades.push(trade(d, { stopLoss: 150 }));
    }
    expect(get(calcBadges(trades), 'day_sl').unlocked).toBe(true);
  });

  it('合計pipsがプラスの日だけ「好調な1日」に数える', () => {
    const b = calcBadges([
      trade('2026-08-01', { pips: 10 }), trade('2026-08-01', { pips: -3 }),  // +7 → 成立
      trade('2026-08-02', { pips: 5 }),  trade('2026-08-02', { pips: -9 }),  // -4 → 不成立
      trade('2026-08-03', { pips: 0 }),                                       // 0 → 不成立
      trade('2026-08-04'),                                                    // pips未入力 → 不成立
    ]);
    expect(get(b, 'day_plus').progress).toBe(1);
  });
});

describe('週単位バッジ', () => {
  it('月曜始まりで週をまとめる（日曜は前の週に入る）', () => {
    // 2026-08-03(月)〜2026-08-09(日) が同じ週
    const b = calcBadges([
      trade('2026-08-03'), trade('2026-08-04'), trade('2026-08-05'),
      trade('2026-08-06'), trade('2026-08-09'),
    ]);
    expect(get(b, 'week_5days').progress).toBe(5);
    expect(get(b, 'week_5days').unlocked).toBe(true);
  });

  it('週をまたぐと5日に届かない', () => {
    // 2026-08-08(土),09(日) は前週 / 10(月)以降は翌週
    const b = calcBadges([
      trade('2026-08-08'), trade('2026-08-09'),
      trade('2026-08-10'), trade('2026-08-11'), trade('2026-08-12'),
    ]);
    expect(get(b, 'week_5days').progress).toBe(3);
  });

  it('同じ日に何件記録しても「週5日」は1日として数える', () => {
    const b = calcBadges([
      trade('2026-08-03'), trade('2026-08-03'), trade('2026-08-03'),
      trade('2026-08-03'), trade('2026-08-03'),
    ]);
    expect(get(b, 'week_5days').progress).toBe(1);
  });
});

describe('月次目標バッジ', () => {
  const goals = { monthlyPipsGoal: 50, monthlyWinRateGoal: 60, monthlyPLGoal: 10000 };

  it('目標が未設定なら needsGoal を立てて未解除のままにする', () => {
    const b = calcBadges([trade('2026-08-01', { pips: 999 })], {
      monthlyPipsGoal: 0, monthlyWinRateGoal: 0, monthlyPLGoal: 0,
    });
    expect(get(b, 'goal_pips').needsGoal).toBe(true);
    expect(get(b, 'goal_pips').unlocked).toBe(false);
  });

  it('目標を渡さなかった場合も needsGoal になる', () => {
    expect(get(calcBadges([trade('2026-08-01', { pips: 999 })]), 'goal_pips').needsGoal).toBe(true);
  });

  it('月間pipsが目標以上なら解除', () => {
    const b = calcBadges([trade('2026-08-01', { pips: 30 }), trade('2026-08-02', { pips: 25 })], goals);
    expect(get(b, 'goal_pips').unlocked).toBe(true);
  });

  it('月をまたいだ合計では達成にならない', () => {
    const b = calcBadges([trade('2026-08-01', { pips: 30 }), trade('2026-09-01', { pips: 30 })], goals);
    expect(get(b, 'goal_pips').unlocked).toBe(false);
  });

  it('勝敗が5件未満の月は勝率目標の判定に使わない（少数で100%になるのを防ぐ）', () => {
    const b = calcBadges([
      trade('2026-08-01', { result: 'win' }), trade('2026-08-02', { result: 'win' }),
      trade('2026-08-03', { result: 'win' }), trade('2026-08-04', { result: 'win' }),
    ], goals);
    expect(get(b, 'goal_winrate').unlocked).toBe(false);
  });

  it('勝敗5件以上で勝率が目標以上なら解除', () => {
    const b = calcBadges([
      trade('2026-08-01', { result: 'win' }), trade('2026-08-02', { result: 'win' }),
      trade('2026-08-03', { result: 'win' }), trade('2026-08-04', { result: 'win' }),
      trade('2026-08-05', { result: 'loss' }),
    ], goals);  // 4/5 = 80% >= 60%
    expect(get(b, 'goal_winrate').unlocked).toBe(true);
  });

  it('引き分けも勝率の母数に入れる（calcStats と同じ定義）', () => {
    const b = calcBadges([
      trade('2026-08-01', { result: 'win' }), trade('2026-08-02', { result: 'win' }),
      trade('2026-08-03', { result: 'win' }), trade('2026-08-04', { result: 'loss' }),
      trade('2026-08-05', { result: 'loss' }), trade('2026-08-06', { result: 'even' }),
    ], goals);  // 3/6 = 50% < 60% なので未達
    expect(get(b, 'goal_winrate').unlocked).toBe(false);
  });

  it('3つ同時に達成した月があれば「完全達成」', () => {
    const ts = [
      trade('2026-08-01', { result: 'win', pips: 30, profitLoss: 6000 }),
      trade('2026-08-02', { result: 'win', pips: 30, profitLoss: 6000 }),
      trade('2026-08-03', { result: 'win', pips: 10, profitLoss: 2000 }),
      trade('2026-08-04', { result: 'win', pips: 10, profitLoss: 2000 }),
      trade('2026-08-05', { result: 'loss', pips: -10, profitLoss: -2000 }),
    ];
    expect(get(calcBadges(ts, goals), 'goal_slam').unlocked).toBe(true);
  });

  it('別々の月に1つずつ達成しても「完全達成」にはならない', () => {
    const ts = [
      trade('2026-08-01', { pips: 60 }),                    // 8月はpipsのみ
      trade('2026-09-01', { pips: 1, profitLoss: 20000 }),  // 9月は金額のみ
    ];
    expect(get(calcBadges(ts, goals), 'goal_slam').unlocked).toBe(false);
  });
});

describe('年単位バッジ', () => {
  it('12か月すべてに記録があれば皆勤賞', () => {
    const ts = Array.from({ length: 12 }, (_, i) =>
      trade(`2026-${String(i + 1).padStart(2, '0')}-05`));
    expect(get(calcBadges(ts), 'year_full').unlocked).toBe(true);
  });

  it('年をまたいで12か月あっても皆勤賞にはならない', () => {
    const ts = [
      ...Array.from({ length: 6 }, (_, i) => trade(`2025-${String(i + 7).padStart(2, '0')}-05`)),
      ...Array.from({ length: 6 }, (_, i) => trade(`2026-${String(i + 1).padStart(2, '0')}-05`)),
    ];
    const b = get(calcBadges(ts), 'year_full');
    expect(b.progress).toBe(6);
    expect(b.unlocked).toBe(false);
  });
});

describe('規律の積み重ね', () => {
  it('損切り連続は途中で1件でも抜けると切れる', () => {
    const ts = [
      ...Array.from({ length: 15 }, (_, i) => trade(`2026-08-${String(i + 1).padStart(2, '0')}`, { stopLoss: 1 })),
      trade('2026-08-16'),
      ...Array.from({ length: 10 }, (_, i) => trade(`2026-08-${String(i + 17).padStart(2, '0')}`, { stopLoss: 1 })),
    ];
    expect(get(calcBadges(ts), 'sl_streak_20').progress).toBe(15);
  });

  it('入力順に関係なく日付順で連続を数える', () => {
    const ts = [
      trade('2026-08-03', { stopLoss: 1 }),
      trade('2026-08-01', { stopLoss: 1 }),
      trade('2026-08-02', { stopLoss: 1 }),
    ];
    expect(get(calcBadges(ts), 'sl_streak_20').progress).toBe(3);
  });

  it('RRは2.0以上だけ数える', () => {
    const b = calcBadges([
      trade('2026-08-01', { plannedRR: 2 }), trade('2026-08-02', { plannedRR: 3 }),
      trade('2026-08-03', { plannedRR: 1.9 }),
    ]);
    expect(get(b, 'rr2_10').progress).toBe(2);
  });
});

describe('連続記録日数', () => {
  it('連続した日付の最長を返す', () => {
    const ts = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-05', '2026-08-06'].map(d => trade(d));
    expect(get(calcBadges(ts), 'streak_7').progress).toBe(3);
  });

  it('同じ日に複数件あっても1日として数える', () => {
    const ts = [trade('2026-08-01'), trade('2026-08-01'), trade('2026-08-02')];
    expect(get(calcBadges(ts), 'streak_7').progress).toBe(2);
  });

  it('月をまたいでも途切れない', () => {
    const ts = ['2026-08-30', '2026-08-31', '2026-09-01'].map(d => trade(d));
    expect(get(calcBadges(ts), 'streak_7').progress).toBe(3);
  });

  it('一度達成した記録は、その後途切れても剥奪されない', () => {
    // 7日連続したあと1か月空けても、過去最長で判定するので解除のまま
    const ts = [
      ...Array.from({ length: 7 }, (_, i) => trade(`2026-08-${String(i + 1).padStart(2, '0')}`)),
      trade('2026-10-15'),
    ];
    expect(get(calcBadges(ts), 'streak_7').unlocked).toBe(true);
  });
});

describe('nearlyUnlocked', () => {
  it('進捗0のものは「あと少し」に出さない', () => {
    const b = calcBadges([trade('2026-08-01')]);
    expect(nearlyUnlocked(b).every(x => x.progress > 0)).toBe(true);
  });

  it('目標未設定のバッジは出さない（まず目標設定を促すべきなので）', () => {
    const b = calcBadges([trade('2026-08-01', { pips: 10 })]);
    expect(nearlyUnlocked(b, 99).some(x => x.needsGoal)).toBe(false);
  });

  it('解除済みは出さない', () => {
    const b = calcBadges([trade('2026-08-01')]);
    expect(nearlyUnlocked(b, 99).some(x => x.unlocked)).toBe(false);
  });

  it('達成率が高い順に並ぶ', () => {
    const b = calcBadges(Array.from({ length: 40 }, (_, i) =>
      trade(`2026-08-${String((i % 28) + 1).padStart(2, '0')}`)));
    const n = nearlyUnlocked(b, 3);
    const rates = n.map(x => x.progress / x.target);
    expect([...rates].sort((a, c) => c - a)).toEqual(rates);
  });

  it('既定では3件までしか返さない', () => {
    const b = calcBadges(Array.from({ length: 40 }, (_, i) =>
      trade(`2026-08-${String((i % 28) + 1).padStart(2, '0')}`)));
    expect(nearlyUnlocked(b).length).toBeLessThanOrEqual(3);
  });
});

describe('回帰: 本番の日付形式（時刻付き）で壊れないこと', () => {
  // trade.date は '2026-08-30T14:30:00' 形式。切り詰めずに T00:00:00 を足すと
  // Invalid Date になり、日単位・週単位の集計が全て件数集計に化けていた。
  it('同じ日に7件記録しても「7日連続」は解除されない', () => {
    const ts = Array.from({ length: 7 }, (_, i) =>
      trade(`2026-08-10T0${i}:00:00`));
    const b = calcBadges(ts);
    expect(get(b, 'streak_7').progress).toBe(1);
    expect(get(b, 'streak_7').unlocked).toBe(false);
  });

  it('同じ日に5件記録しても「週5日」は解除されない', () => {
    const ts = Array.from({ length: 5 }, (_, i) =>
      trade(`2026-08-10T0${i}:00:00`));
    expect(get(calcBadges(ts), 'week_5days').progress).toBe(1);
  });

  it('日をまたげば正しく連続日数になる', () => {
    const ts = ['2026-08-10T09:00:00', '2026-08-11T23:59:00', '2026-08-12T00:01:00']
      .map(d => trade(d));
    expect(get(calcBadges(ts), 'streak_7').progress).toBe(3);
  });

  it('同じ日の3件が全て損切りありなら「規律の1日」に数える（時刻が違っても1日）', () => {
    const ts = ['2026-08-10T09:00:00', '2026-08-10T12:00:00', '2026-08-10T15:00:00']
      .map(d => trade(d, { stopLoss: 150 }));
    expect(get(calcBadges(ts), 'day_sl').progress).toBe(1);
  });

  it('週グループが1つに潰れない（別々の週として数える）', () => {
    const ts = [
      trade('2026-08-03T09:00:00', { pips: 10 }),  // 第1週
      trade('2026-08-10T09:00:00', { pips: 10 }),  // 第2週
      trade('2026-08-17T09:00:00', { pips: 10 }),  // 第3週
      trade('2026-08-24T09:00:00', { pips: 10 }),  // 第4週
    ];
    expect(get(calcBadges(ts), 'week_plus').progress).toBe(4);
  });
});

describe('回帰: 勝率の定義がアプリ全体と揃っていること', () => {
  // 月次タブのゲージは calcStats（wins / 全件）を使う。バッジだけ引き分けを
  // 分母から外していたため、画面が「未達」の月にバッジが「達成」と付いていた。
  it('引き分けを分母に含める（6勝4敗5分けは40%であって60%ではない）', () => {
    const ts = [
      ...Array.from({ length: 6 }, () => trade('2026-08-01', { result: 'win' })),
      ...Array.from({ length: 4 }, () => trade('2026-08-02', { result: 'loss' })),
      ...Array.from({ length: 5 }, () => trade('2026-08-03', { result: 'even' })),
    ];
    const b = calcBadges(ts, {
      monthlyPipsGoal: 0, monthlyWinRateGoal: 60, monthlyPLGoal: 0,
    });
    // 6/15 = 40% なので未達。引き分けを外すと 6/10 = 60% で誤って解除されていた
    expect(get(b, 'goal_winrate').unlocked).toBe(false);
  });

  it('引き分けが無ければ従来どおり解除される', () => {
    const ts = [
      ...Array.from({ length: 6 }, () => trade('2026-08-01', { result: 'win' })),
      ...Array.from({ length: 4 }, () => trade('2026-08-02', { result: 'loss' })),
    ];
    const b = calcBadges(ts, {
      monthlyPipsGoal: 0, monthlyWinRateGoal: 60, monthlyPLGoal: 0,
    });
    expect(get(b, 'goal_winrate').unlocked).toBe(true);
  });
});

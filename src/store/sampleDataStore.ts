import * as Sentry from '@sentry/react-native';
import { create } from 'zustand';
import { hasSampleData, insertSampleTrades, removeSampleData } from '../utils/sampleData';
import { syncWidgetData } from '../utils/widgetSync';

/**
 * 見本データが入っているかどうかを、画面をまたいで1か所で持つ。
 *
 * ホーム・月次・分析の3画面に同じバナーを出すので、消したときに3画面とも
 * 同時に消える必要がある。各画面が個別に DB を見にいく作りだと、
 * 「消したのに別のタブではまだバナーが出ている」という状態になる。
 */
interface SampleDataStore {
  /** 見本データが入っているか。未確認のあいだは false（バナーを出さない側に倒す）。 */
  present: boolean;
  /** 起動時に DB のフラグから読み直す。 */
  refresh: () => Promise<void>;
  /** オンボーディングの「サンプルで見てみる」から呼ぶ。入れた件数を返す。 */
  insert: () => Promise<number>;
  /** バナーの「消して自分の記録を始める」から呼ぶ。消した件数を返す。 */
  remove: () => Promise<number>;
}

export const useSampleDataStore = create<SampleDataStore>((set) => ({
  present: false,

  refresh: async () => {
    try {
      set({ present: await hasSampleData() });
    } catch {
      // 判定できないときはバナーを出さない。出し損ねても実害は無いが、
      // 実データしか無い人に「これはサンプルです」と出すのは実害がある。
    }
  },

  insert: async () => {
    try {
      const n = await insertSampleTrades();
      if (n > 0) {
        set({ present: true });
        syncWidgetData();
      }
      return n;
    } catch (e) {
      // 見本が入らなくても空のホームに着くだけで、先へは進める。
      try { Sentry.captureException(e, { tags: { area: 'sample_data_insert' } }); } catch { /* 無視 */ }
      return 0;
    }
  },

  remove: async () => {
    // ここは失敗を握り潰さない。「消えたと思ったのに残っている」状態のまま
    // 自分の記録を足されると、どれが見本か分からなくなる。呼び出し側で伝える。
    const n = await removeSampleData();
    set({ present: false });
    syncWidgetData();
    return n;
  },
}));

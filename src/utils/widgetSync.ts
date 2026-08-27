import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import { getTradesByMonth } from '../db/queries';
import { calcStats } from './statsCalc';
import { t } from '../i18n';

// app.jsonのios.entitlementsおよびtargets/widget/expo-target.config.jsと
// 同じ値を使う必要がある(App Group経由でデータを共有するため)。
const APP_GROUP = 'group.com.fxtradejournal.ios';

function todayYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// トレードの追加/編集/削除のたびに呼び出し、ホーム画面ウィジェットに反映する。
// ユーザーがアプリ内で別の月を閲覧中でも、ウィジェットには常に実際の「今月」の
// 成績を出したいため、閲覧中の月(tradeStoreのcurrentMonth)とは独立に
// DBから直接取得し直す。
export async function syncWidgetData(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const trades = await getTradesByMonth(todayYearMonth());
    const stats = calcStats(trades);
    const hasTrades = stats.totalTrades > 0;
    const storage = new ExtensionStorage(APP_GROUP);
    storage.set('monthlyStats', {
      title: t('this_month'),
      winRate: hasTrades ? `${stats.winRate}%` : '-',
      winRateLabel: t('win_rate'),
      totalPips: hasTrades ? `${stats.totalPips > 0 ? '+' : ''}${stats.totalPips}` : '-',
      pipsLabel: 'pips',
      isPositive: stats.totalPips >= 0 ? 1 : 0,
    });
    ExtensionStorage.reloadWidget();
  } catch {
    // ウィジェット同期の失敗はアプリ本体の動作に影響させない
  }
}

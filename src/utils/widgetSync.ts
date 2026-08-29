import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import { getTradesByMonth, getRecordStreak } from '../db/queries';
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
    const streak = await getRecordStreak();

    // プロフィットファクターは grossLoss が 0 のとき Infinity になる。
    // JSONに載せられないうえウィジェット側で"∞"を出す必要があるため文字列化する
    // （アプリ本体の表示ルールと揃える）。
    const pf = !hasTrades ? '-'
      : stats.profitFactor === Infinity ? '∞'
      : stats.profitFactor.toFixed(2);

    const storage = new ExtensionStorage(APP_GROUP);
    storage.set('monthlyStats', {
      // ── 小サイズ/既存キー（互換のため名前を変えない）──
      title: t('this_month'),
      winRate: hasTrades ? `${stats.winRate}%` : '-',
      winRateLabel: t('win_rate'),
      totalPips: hasTrades ? `${stats.totalPips > 0 ? '+' : ''}${stats.totalPips}` : '-',
      pipsLabel: 'pips',
      isPositive: stats.totalPips >= 0 ? 1 : 0,

      // ── 中サイズ / ロック画面で追加表示する項目 ──
      profitFactor: pf,
      profitFactorLabel: t('pf'),
      tradeCount: hasTrades ? String(stats.totalTrades) : '-',
      tradeCountLabel: t('trade_count'),
      // 連続「記録」日数。t('streak_label')は勝敗のストリーク用で別物なので使わない。
      // home_streak_days は「日連続」のような接尾辞のため、数値の後ろに置く前提。
      streak: String(streak),
      streakSuffix: t('home_streak_days'),
      // 勝率リング(accessoryCircular)用。0〜1に正規化した数値を別に渡す。
      // 表示用文字列(winRate)から数値を復元するとロケール差で壊れるため分離する。
      winRateValue: hasTrades ? stats.winRate / 100 : 0,
      hasData: hasTrades ? 1 : 0,
    });
    ExtensionStorage.reloadWidget();
  } catch {
    // ウィジェット同期の失敗はアプリ本体の動作に影響させない
  }
}

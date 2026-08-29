import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
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
/**
 * ExtensionStorageのネイティブモジュールが実際にリンクされているか。
 *
 * @bacons/apple-targets は、ネイティブモジュールが見つからないと**例外を投げずに
 * 何もしないダミー関数**へ差し替える。そのため set() も reloadWidget() も
 * 「成功したふり」をして、App Groupには何も書かれず、ウィジェットは永久に
 * プレースホルダー（--%）のままになる。しかもcatchにも入らないので
 * Sentryにも痕跡が残らない。
 *
 * 実際にv1.3.0で発生した。原因は @bacons/apple-targets が devDependencies に
 * 入っていたことで、設定プラグイン（prebuild時に動く）はウィジェットの
 * Xcodeターゲットを生成する一方、autolinkingがネイティブモジュールを拾わず、
 * 生成されたExpoModulesProvider.swiftに登録されていなかった。
 * 「ウィジェットは存在するのにデータだけ来ない」という切り分けにくい形になる。
 *
 * 二度と無言で壊れないよう、モジュールの有無を起動時に検出して報告する。
 */
function isNativeModuleLinked(): boolean {
  // expo.modules は Expo Modules のネイティブ登録テーブル
  const modules = (globalThis as any)?.expo?.modules;
  return !!modules?.ExtensionStorage;
}

let linkageReported = false;

export async function syncWidgetData(): Promise<void> {
  if (Platform.OS !== 'ios') return;

  if (!isNativeModuleLinked()) {
    // 毎回の保存で送ると量が増えるため、1セッションにつき1回だけ報告する
    if (!linkageReported) {
      linkageReported = true;
      try {
        Sentry.captureMessage(
          'widget:extension_storage_not_linked',
          { level: 'error', tags: { area: 'widget_sync' } },
        );
      } catch {
        // 計装の失敗まで面倒は見ない
      }
    }
    return;
  }

  try {
    const trades = await getTradesByMonth(todayYearMonth());
    const stats = calcStats(trades);
    const hasTrades = stats.totalTrades > 0;

    // 連続記録日数は「あると嬉しい」程度の付加情報にすぎない。ここで throw させて
    // 勝率やpipsの同期ごと巻き添えにするのは割に合わないため、単独で握り潰す。
    let streak = 0;
    try {
      streak = await getRecordStreak();
    } catch {
      // 取得できなければ0扱い（中サイズで非表示になるだけ）
    }

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
  } catch (e) {
    // アプリ本体の動作は止めない。ただし黙って握り潰すと
    // 「ウィジェットが更新されない」が原因不明のまま残るため、Sentryには残す。
    // （実際にv1.3.0で、同期が失敗しているのか反映が遅れているだけなのかを
    //   切り分ける手段が無く、調査が止まった）
    try {
      Sentry.captureException(e, { tags: { area: 'widget_sync' } });
    } catch {
      // 計装の失敗まで面倒は見ない
    }
  }
}

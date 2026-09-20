/**
 * App Store 用スクリーンショットを撮るための、デモデータ投入モード。
 *
 * なぜ要るか: 空のカレンダーや0件の分析画面を撮っても何も伝わらない。
 * かといって手で20件入力するのは11ロケールぶん繰り返せない。前回（2026-09-01）も
 * 同じ仕組みを一時的に入れて撮ったが、**コミットしていなかったので失われた。**
 * 今度は残す。
 *
 * ■ 有効になる条件（本番に混ざらないための二重の歯止め）
 *
 *   __DEV__ が true  かつ  EXPO_PUBLIC_SCREENSHOT_MODE === '1'
 *
 * production プロファイルのビルドでは `__DEV__` が false なので、環境変数を
 * 取り違えても実データは消えない。加えて `scripts/check-prod-keys.js` が
 * production ビルド時にこの環境変数が立っていたら中断する。
 *
 * ■ データ本体は `sampleData.ts` にある
 *
 * オンボーディングの「サンプルで見てみる」と**同じ1組**を使う。ストアのスクショと
 * 新規ユーザーが最初に見る画面が一致するので、期待と実物がずれない。
 * **入れ方と消し方はあちらと完全に別。** こちらは全消ししてから入れ、`isPremium`
 * まで立てる。本番経路から呼んでよいものではない。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { router } from 'expo-router';
import { documentDirectory, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { getDatabase } from '../db/database';
import {
  insertTrade, setSetting, saveTradeRules, saveEntryTags,
  updateRecordStreak, GOAL_SETTING_KEYS,
} from '../db/queries';
import { buildSampleTrades, SCREENSHOT_ID_PREFIX } from './sampleData';
import { ruleFollowedDays } from './goals';
import { usePurchaseStore } from '../store/purchaseStore';
import { tArr } from '../i18n';

// データ本体は sampleData.ts が持つ。テストが従来どおり `screenshotMode` から
// 取れるよう、ここで再輸出しておく。
export { DEMO_TRADES, assignDays } from './sampleData';

export function isScreenshotMode(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_SCREENSHOT_MODE === '1';
}

/**
 * デモデータを投入する。**既存の記録は消える。**
 * 撮影モードでないときは何もしないので、誤って本番経路から呼んでも実害はない。
 */
export async function seedScreenshotData(): Promise<void> {
  if (!isScreenshotMode()) return;

  const db = await getDatabase();
  await db.execAsync('DELETE FROM trades;');

  const tags = tArr('default_tags');
  const rules = tArr('default_rules').slice(0, 3);
  const inserted = buildSampleTrades({ idPrefix: SCREENSHOT_ID_PREFIX, tags, rules });
  for (const trade of inserted) await insertTrade(trade);

  await saveTradeRules(rules);
  await saveEntryTags(tags);

  // 目標は「達成済み」に見える値にする。pips・勝率・損益は上のデータが固定なので
  // 定数でよいが、ルールを守った日数だけは撮影日（＝当月の経過日数）で変わるため、
  // 実際に並んだ日数から引いて必ず達成状態になるようにする。
  // 表示側と同じ関数で数える。ここを自前で数え直すと、判定が変わったときに
  // 目標だけ達成不能な値のまま残る。
  const ruleDays = ruleFollowedDays(inserted, rules);
  await setSetting(GOAL_SETTING_KEYS.monthlyPipsGoal, '100');
  await setSetting(GOAL_SETTING_KEYS.monthlyWinRateGoal, '55');
  await setSetting(GOAL_SETTING_KEYS.monthlyPLGoal, '30000');
  await setSetting(GOAL_SETTING_KEYS.monthlyRuleDaysGoal, String(Math.max(1, ruleDays - 1)));
  await setSetting(GOAL_SETTING_KEYS.weeklyRuleDaysGoal, '4');
  await setSetting(GOAL_SETTING_KEYS.weeklyPipsGoal, '30');
  await setSetting(GOAL_SETTING_KEYS.dailyRuleGoal, '1');

  await setSetting('onboarding_done', '1');
  await updateRecordStreak();

  // 課金画面と設定画面を PRO の状態で撮るため。RevenueCat のキーは開発ビルドでは
  // プレースホルダのままで initialize() が何もしないので、ここで直接立てる。
  usePurchaseStore.setState({ isPremium: true, isInitialized: true });
}


/**
 * 撮影スクリプトから画面遷移を受け取る口。
 *
 * **なぜディープリンクではなくファイルなのか。** Xcode 27 / iOS 26 では
 * `xcrun simctl openurl` が**毎回**「"アプリ名" で開きますか?」の確認ダイアログを出す
 * （アプリが既に前面にあっても出る）。押さない限り URL は配送されない。しかも
 * **Xcode 27 は Simulator.app を廃止して DeviceHub に置き換えており、DeviceHub は
 * コマンドラインからデバイスのウィンドウを開けない**ため、そのダイアログを押す手段が
 * 無い（`simctl` にタップは無い）。つまりディープリンクでの巡回は、この環境では
 * 原理的に成立しない。2026-09-16 に一通り試して確認した。
 *
 * 代わりに、ホスト側はアプリのコンテナへ行き先を書き、アプリがそれを読んで自分で遷移する。
 * コンテナのパスは `xcrun simctl get_app_container <udid> <bundle> data` で取れるので、
 * ホストからは普通のファイル書き込みで済む。通信も権限もタップも要らない。
 *
 * 往復を確認できるよう、遷移したら同じ合図を HERE_FILE に書き戻す。スクリプトは
 * それが一致するまで待ってから撮る（時間で待つとアニメーション途中で写る）。
 */
const GOTO_FILE = 'screenshot-goto.txt';
const HERE_FILE = 'screenshot-here.txt';

/** ファイルの中身（`<連番>:<ルート>`）を解釈する。連番は同じ画面を撮り直せるようにするため。 */
function parseGoto(raw: string): { token: string; route: string } | null {
  const text = raw.trim();
  if (!text) return null;
  const sep = text.indexOf(':');
  if (sep < 0) return null;
  return { token: text, route: text.slice(sep + 1) };
}

/**
 * 撮影スクリプトが指定した「画面の中の状態」（`stats?tab=time` の `tab` など）。
 *
 * **ルートのクエリをそのまま `useLocalSearchParams` で読む方式にしない。**
 * `(tabs)` の画面は一度開くとマウントされたままなので、`useState` の初期値は
 * 2回目以降の指定を受け取れない（4枚目で `tab=time`、5枚目で `tab=equity` を
 * 撮りたいのに、5枚目が反映されない）。マウント済みの画面に同じルートで
 * パラメータだけ変えて遷移したときにルータが params を更新するかどうかも、
 * 実機で確かめるまで保証が無い。ここに写して購読させれば、その依存が消える。
 */
export const useScreenshotParams = create<{ params: Record<string, string> }>(() => ({ params: {} }));

/** `stats?tab=time` を `{ route: 'stats', params: { tab: 'time' } }` に分ける。 */
export function splitRoute(route: string): { route: string; params: Record<string, string> } {
  const q = route.indexOf('?');
  if (q < 0) return { route, params: {} };
  const params: Record<string, string> = {};
  for (const pair of route.slice(q + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const k = eq < 0 ? pair : pair.slice(0, eq);
    params[decodeURIComponent(k)] = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
  }
  return { route: route.slice(0, q), params };
}

export function useScreenshotNavigator(): void {
  useEffect(() => {
    // 撮影モード以外では何もしない。isScreenshotMode() は __DEV__ も見ているので、
    // 本番ビルドではこのポーリング自体が始まらない。
    if (!isScreenshotMode()) return;

    let stopped = false;
    let lastToken = '';

    const tick = async () => {
      if (stopped || !documentDirectory) return;
      try {
        const raw = await readAsStringAsync(documentDirectory + GOTO_FILE);
        const goto = parseGoto(raw);
        if (!goto || goto.token === lastToken) return;
        lastToken = goto.token;
        // クエリは画面内の状態としてストアへ渡し、ルータにはパスだけを渡す。
        const { route, params } = splitRoute(goto.route);
        useScreenshotParams.setState({ params });
        // 空文字はホーム。expo-router の (tabs) はグループなので URL には出ない。
        router.replace(('/' + route) as never);
        await writeAsStringAsync(documentDirectory + HERE_FILE, goto.token);
      } catch {
        // まだファイルが無いだけ。撮影スクリプトが最初の1件を書くまでは毎回ここに来る。
      }
    };

    const id = setInterval(tick, 400);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);
}

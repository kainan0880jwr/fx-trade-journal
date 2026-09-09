/**
 * useReviewPrompt
 *
 * トレード件数がマイルストーンに達したタイミングでレビューを依頼する。
 *
 * 原則として **OSが提供するレビューシート**（`expo-store-review`）を使う。
 * Apple は独自のレビュー促進ダイアログではなく提供APIの使用を求めており、
 * ネイティブのシートはアプリを離れずに★を付けられるため完了率も高い。
 * 表示回数の上限（iOSは年3回）はOS側が持つので、こちらで数える必要はない。
 *
 * `isAvailableAsync()` が false になる環境（TestFlight配布のiOS、Android 5未満、Web）
 * だけ、従来の Alert + ストアURLを開くフォールバックを使う。
 *
 * 使い方:
 *   const promptReviewIfNeeded = useReviewPrompt();
 *   // トレード保存後に呼ぶ
 *   await promptReviewIfNeeded();
 */

import { useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { getTotalTradeCount, getSetting, setSetting } from '../db/queries';
import { t } from '../i18n';

// App Store Connect で発行された数値 ID に書き換えてください
// 例: '6738520123'
const APP_STORE_ID = '6786188634';

// 何件目に促進するか（10件・30件・100件）
export const MILESTONES = [10, 30, 100];

// 「どのマイルストーンまで出したか」を覚えるキー。
// review_asked（= もう出さない）とは別で、「あとで」を選んだ場合に
// 次のマイルストーンまで待つために要る。
const PROMPTED_MILESTONE_KEY = 'review_prompt_milestone';

/**
 * 到達済みで、まだ促進していない最大のマイルストーンを返す。無ければ null。
 *
 * 以前は `MILESTONES.find(m => count === m)` と**完全一致**で見ていた。
 * このアプリの目玉は MT4/MT5 のCSV一括インポートで、取り込んだユーザーは
 * 件数が 0 → 47 のように飛ぶ。10・30・100 のどれも踏まないので、
 * **最もアクティブな層にレビュー依頼が一度も出ない**状態だった。
 * レビュー件数はASOのランキング要因なので、これは集客の問題でもある。
 */
export function nextMilestone(count: number, lastPrompted: number): number | null {
  const reached = MILESTONES.filter((m) => count >= m).pop();
  if (reached === undefined || reached <= lastPrompted) return null;
  return reached;
}

// 第1候補（ストアアプリを直接起動するカスタムスキーム）と、
// それが開けなかった場合のhttpsフォールバックを返す。
// iOSではカスタムスキームに対する canOpenURL() が Info.plist の
// LSApplicationQueriesSchemes に宣言されていないと常に false を返すため、
// 宣言前のビルドではフォールバック側が使われる。
function buildReviewURLs(): string[] {
  if (Platform.OS === 'ios') {
    return [
      `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`,
      `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
    ];
  }
  // Android（将来対応）
  return [
    `market://details?id=com.fxtradejournal.app`,
    `https://play.google.com/store/apps/details?id=com.fxtradejournal.app`,
  ];
}

/**
 * OSのレビューシートを出せたら true。
 *
 * `expo-store-review` を**トップレベルで import しない**のが肝。
 * `requireNativeModule('ExpoStoreReview')` はモジュール読み込み時に評価され、
 * ネイティブモジュールを持たないビルドでは即座に例外になる。このフックは
 * 記録画面（app/trade/new.tsx）が読み込むため、トップレベルで import すると
 * **OTAでこのJSだけが先に届いた既存インストールで記録画面が開けなくなる**。
 * 動的 import なら、実際に呼ばれるまで評価されず、失敗してもここで止まる。
 */
async function tryNativeReview(): Promise<boolean> {
  try {
    const StoreReview = await import('expo-store-review');
    if (!(await StoreReview.isAvailableAsync())) return false;
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

export function useReviewPrompt() {
  const promptReviewIfNeeded = useCallback(async () => {
    try {
      // すでに促進済みなら何もしない
      const asked = await getSetting('review_asked');
      if (asked === '1') return;

      const count = await getTotalTradeCount();
      const lastPrompted = Number(await getSetting(PROMPTED_MILESTONE_KEY)) || 0;

      const hit = nextMilestone(count, lastPrompted);
      if (hit === null) return;

      // 表示する前に記録する。「あとで」を選んでもダイアログは閉じるだけなので、
      // ここで記録しておかないと保存のたびに出続けることになる。
      await setSetting(PROMPTED_MILESTONE_KEY, String(hit));

      // OSのレビューシート。実際に表示されたかは取得できない（iOSが年3回に
      // 間引く）ので、結果は見ずに呼ぶだけでよい。
      if (await tryNativeReview()) return;

      // フォールバック（TestFlight / Android 5未満 / Web / ネイティブモジュール未搭載）
      Alert.alert(
        t('review_prompt_title'),
        t('review_prompt_message'),
        [
          {
            text: t('review_prompt_later'),
            style: 'cancel',
            // 「あとで」は review_asked を立てない。次のマイルストーンで再度出る。
          },
          {
            text: t('review_prompt_yes'),
            onPress: async () => {
              await setSetting('review_asked', '1');
              // 順に試し、最初に開けたものを採用する。
              // openURL() は失敗時に reject するので必ず catch する
              // （未処理のPromise rejectionはSentryにエラーとして記録される）。
              for (const url of buildReviewURLs()) {
                try {
                  await Linking.openURL(url);
                  break;
                } catch {
                  // 次の候補へ
                }
              }
            },
          },
        ]
      );
    } catch {
      // レビュー促進はノンクリティカル — エラーは握り潰す
    }
  }, []);

  return promptReviewIfNeeded;
}

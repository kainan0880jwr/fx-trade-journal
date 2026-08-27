/**
 * useReviewPrompt
 *
 * トレード件数が MILESTONE に達したタイミングで1度だけレビュー促進ダイアログを表示する。
 * - 実績済み（review_asked = "1"）の場合はスキップ
 * - "はい" を選んだら App Store のレビューページを開く
 *   ※ App Store ID が確定したら APP_STORE_ID を更新してください
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
const MILESTONES = [10, 30, 100];

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

export function useReviewPrompt() {
  const promptReviewIfNeeded = useCallback(async () => {
    try {
      // すでに促進済みなら何もしない
      const asked = await getSetting('review_asked');
      if (asked === '1') return;

      const count = await getTotalTradeCount();

      // マイルストーンに達しているか確認
      const hit = MILESTONES.find(m => count === m);
      if (!hit) return;

      // ダイアログを表示
      Alert.alert(
        t('review_prompt_title'),
        t('review_prompt_message'),
        [
          {
            text: t('review_prompt_later'),
            style: 'cancel',
            // 「あとで」の場合は促進済みフラグを立てない（次のマイルストーンで再確認）
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

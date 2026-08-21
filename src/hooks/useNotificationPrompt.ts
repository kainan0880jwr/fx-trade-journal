/**
 * useNotificationPrompt
 *
 * iOSアナリティクスで「初回DL78に対し再ダウンロード6」という定着の弱さが確認された
 * （output/release_monitoring_20260815.md参照）。毎日/週次のリマインダー通知機能自体は
 * 既に実装済みだが、設定タブの奥に置かれているだけでオンボーディング時に一切案内されて
 * おらず、多くのユーザーが存在に気づかないまま離脱していると見られる。
 *
 * D1（翌日以降の再起動）のタイミングで1度だけ、毎日のリマインダー通知の有効化を提案する。
 * 初回オンボーディング時ではなく実際に翌日も戻ってきたユーザーに絞ることで、
 * 定着し始めている人の習慣化を後押しする（オンボーディング直後は既にアプリロック提案が
 * あるため、通知の許諾を同時に求めて体験を圧迫しないようにする狙いもある）。
 *
 * 使い方: app/_layout.tsx の初期化フローで recordAppOpen() の後に呼ぶ。
 */

import { useCallback } from 'react';
import { Alert } from 'react-native';
import { getSetting, setSetting } from '../db/queries';
import { requestNotificationPermission, scheduleReminder } from '../utils/notifications';
import { t } from '../i18n';

const DEFAULT_HOUR = 21;
const DEFAULT_MINUTE = 0;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function useNotificationPrompt() {
  const promptNotificationIfNeeded = useCallback(async () => {
    try {
      const prompted = await getSetting('notif_prompted');
      if (prompted === '1') return;

      const alreadyEnabled = await getSetting('notif_enabled');
      if (alreadyEnabled === '1') {
        // 設定画面から既に自分で有効化済みなら、二重に聞かずフラグだけ立てる
        await setSetting('notif_prompted', '1');
        return;
      }

      const firstOpenRaw = await getSetting('retention_first_open_at');
      if (!firstOpenRaw) return;
      const firstOpen = Number(firstOpenRaw);
      if (!Number.isFinite(firstOpen)) return;
      const daysSince = Math.floor((Date.now() - firstOpen) / ONE_DAY_MS);
      if (daysSince < 1) return; // D1（翌日以降の再起動）まで待つ

      await setSetting('notif_prompted', '1');

      await new Promise<void>((resolve) => {
        Alert.alert(
          t('d1_notif_prompt_title'),
          t('d1_notif_prompt_msg'),
          [
            { text: t('onboarding_app_lock_skip'), style: 'cancel', onPress: () => resolve() },
            {
              text: t('onboarding_app_lock_enable'),
              onPress: async () => {
                const granted = await requestNotificationPermission();
                if (granted) {
                  await scheduleReminder(DEFAULT_HOUR, DEFAULT_MINUTE);
                  await setSetting('notif_enabled', '1');
                  await setSetting('notif_hour', String(DEFAULT_HOUR));
                  await setSetting('notif_minute', String(DEFAULT_MINUTE));
                }
                resolve();
              },
            },
          ]
        );
      });
    } catch {
      // 通知提案はノンクリティカル — エラーは握り潰す
    }
  }, []);

  return promptNotificationIfNeeded;
}

/**
 * useAppLockPrompt
 *
 * 初回のトレード記録を保存した直後に1度だけアプリロック有効化を提案する。
 * オンボーディング直後（アプリロック許諾 → 強制的にトレード入力画面へ遷移）だと
 * 2つの割り込みが立て続けに発生し体験を損なうため、初回トレード保存という
 * ユーザー自身のアクション後に切り出している。
 * - 生体認証ハードウェア/登録がない端末では何もしない
 * - 実績済み（app_lock_prompted = "1"）の場合はスキップ
 *
 * 使い方:
 *   const promptAppLockIfNeeded = useAppLockPrompt();
 *   // 初回トレード保存後、ユーザーがOKを閉じた後に呼ぶ
 *   await promptAppLockIfNeeded();
 */

import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { getSetting, setSetting, getTotalTradeCount } from '../db/queries';
import { useSettingsStore } from '../store/settingsStore';
import { t } from '../i18n';

export function useAppLockPrompt() {
  const updateAppLockEnabled = useSettingsStore(s => s.updateAppLockEnabled);

  const promptAppLockIfNeeded = useCallback(async () => {
    try {
      const prompted = await getSetting('app_lock_prompted');
      if (prompted === '1') return;

      const count = await getTotalTradeCount();
      if (count !== 1) return;

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return;

      await setSetting('app_lock_prompted', '1');

      await new Promise<void>((resolve) => {
        Alert.alert(
          t('onboarding_app_lock_title'),
          t('onboarding_app_lock_msg'),
          [
            { text: t('onboarding_app_lock_skip'), style: 'cancel', onPress: () => resolve() },
            {
              text: t('onboarding_app_lock_enable'),
              onPress: async () => {
                await updateAppLockEnabled(true);
                resolve();
              },
            },
          ]
        );
      });
    } catch {
      // アプリロック提案はノンクリティカル — エラーは握り潰す
    }
  }, [updateAppLockEnabled]);

  return promptAppLockIfNeeded;
}

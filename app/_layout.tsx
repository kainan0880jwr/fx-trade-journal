import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { getDatabase, resetDatabase, EncryptionKeyLostError } from '../src/db/database';
import { useSettingsStore } from '../src/store/settingsStore';
import { usePurchaseStore } from '../src/store/purchaseStore';
import { getSetting } from '../src/db/queries';
import { syncScheduledNotifications } from '../src/utils/notifications';
import { recordAppOpen } from '../src/utils/retentionEvents';
import { useNotificationPrompt } from '../src/hooks/useNotificationPrompt';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useTheme, useIsDark } from '../src/theme/useTheme';
import AppLockGate from '../src/components/AppLockGate';
import ErrorBoundary from '../src/components/ErrorBoundary';
import { t } from '../src/i18n';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
// プレースホルダー（未設定）のDSNでinit()を呼ぶと通信エラーが出続けるため弾く。
// purchaseStore.tsのisPlaceholderKeyと同じ考え方。
const isPlaceholderDsn = (dsn: string) => !dsn || /xxxx/i.test(dsn);

if (!isPlaceholderDsn(SENTRY_DSN)) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // extra は現状どこからも送っていない（唯一の送信元はErrorBoundaryのcontexts.react.componentStack）。
    // 将来誰かが catch節で captureException(error, { extra: { trade } }) のようにオブジェクトを
    // まるごと渡してしまっても、トレード内容等のPIIが飛ばないよう一律で除去する（許可リスト方式）。
    beforeSend(event) {
      if (event.extra) delete event.extra;
      return event;
    },
  });
}

export default function RootLayout() {
  const C = useTheme();
  return (
    <ErrorBoundary colors={C}>
      <RootLayoutContent />
    </ErrorBoundary>
  );
}

function RootLayoutContent() {
  const C = useTheme();
  const isDark = useIsDark();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [keyLost, setKeyLost] = useState(false);
  const loadAll = useSettingsStore(s => s.loadAll);
  const initializePurchases = usePurchaseStore(s => s.initialize);
  const promptNotificationIfNeeded = useNotificationPrompt();

  const initDb = async () => {
    setDbError(false);
    setKeyLost(false);
    try {
      await getDatabase();
      await loadAll();
      syncScheduledNotifications(); // OS側の通知予約が消えていた場合に備えて再同期（結果は待たない）
      recordAppOpen(); // リテンション自前計測（D1/D7）、結果は待たない
      const onboardingDone = await getSetting('onboarding_done');
      if (onboardingDone !== '1') {
        // DB 準備完了後にオンボーディングへ誘導
        setTimeout(() => router.replace('/onboarding'), 100);
      } else {
        promptNotificationIfNeeded(); // D1再起動時のみ通知の有効化を提案、結果は待たない
      }
    } catch (e) {
      console.error('DB init error:', e);
      if (e instanceof EncryptionKeyLostError) {
        setKeyLost(true);
      } else {
        setDbError(true);
      }
    } finally {
      setDbReady(true);
    }
  };

  useEffect(() => {
    initDb();
    initializePurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResetData = () => {
    Alert.alert(
      t('db_reset_confirm_title'),
      t('db_reset_confirm_msg'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('db_reset_confirm_button'),
          style: 'destructive',
          onPress: async () => {
            await resetDatabase();
            setDbReady(false);
            initDb();
          },
        },
      ]
    );
  };

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (keyLost) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: C.bg }]}>
        <Text style={[styles.errorTitle, { color: C.text }]}>{t('db_key_lost_title')}</Text>
        <Text style={[styles.errorMsg, { color: C.text2 }]}>{t('db_key_lost_msg')}</Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: C.primary }]}
          onPress={handleResetData}
        >
          <Text style={styles.retryBtnText}>{t('db_reset_confirm_button')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (dbError) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: C.bg }]}>
        <Text style={[styles.errorTitle, { color: C.text }]}>{t('db_init_error_title')}</Text>
        <Text style={[styles.errorMsg, { color: C.text2 }]}>{t('db_init_error_msg')}</Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: C.primary }]}
          onPress={() => { setDbReady(false); initDb(); }}
        >
          <Text style={styles.retryBtnText}>{t('retry')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetLink} onPress={handleResetData}>
          <Text style={[styles.resetLinkText, { color: C.text3 }]}>{t('db_reset_link')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <AppLockGate>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, headerTitleStyle: { color: C.text } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="trade/new"
          options={{ title: t('screen_title_new_trade'), presentation: 'modal', headerStyle: { backgroundColor: C.card }, headerTintColor: C.text }}
        />
        <Stack.Screen
          name="trade/[id]"
          options={{ title: t('screen_title_trade_detail'), presentation: 'modal', headerStyle: { backgroundColor: C.card }, headerTintColor: C.text }}
        />
        <Stack.Screen
          name="paywall"
          options={{ title: '', presentation: 'modal', headerShown: false }}
        />
      </Stack>
    </AppLockGate>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorMsg: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryBtn: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  resetLink: {
    marginTop: 20,
    padding: 8,
  },
  resetLinkText: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});

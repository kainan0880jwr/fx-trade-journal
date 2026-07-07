import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDatabase } from '../src/db/database';
import { useSettingsStore } from '../src/store/settingsStore';
import { usePurchaseStore } from '../src/store/purchaseStore';
import { getSetting } from '../src/db/queries';
import { syncScheduledNotifications } from '../src/utils/notifications';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme, useIsDark } from '../src/theme/useTheme';
import AppLockGate from '../src/components/AppLockGate';
import { t } from '../src/i18n';

export default function RootLayout() {
  const C = useTheme();
  const isDark = useIsDark();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(false);
  const loadAll = useSettingsStore(s => s.loadAll);
  const initializePurchases = usePurchaseStore(s => s.initialize);

  const initDb = async () => {
    setDbError(false);
    try {
      await getDatabase();
      await loadAll();
      syncScheduledNotifications(); // OS側の通知予約が消えていた場合に備えて再同期（結果は待たない）
      const onboardingDone = await getSetting('onboarding_done');
      if (onboardingDone !== '1') {
        // DB 準備完了後にオンボーディングへ誘導
        setTimeout(() => router.replace('/onboarding'), 100);
      }
    } catch (e) {
      console.error('DB init error:', e);
      setDbError(true);
    } finally {
      setDbReady(true);
    }
  };

  useEffect(() => {
    initDb();
    initializePurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.primary} />
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
          options={{ title: 'トレード記録', presentation: 'modal', headerStyle: { backgroundColor: C.card }, headerTintColor: C.text }}
        />
        <Stack.Screen
          name="trade/[id]"
          options={{ title: 'トレード詳細', presentation: 'modal', headerStyle: { backgroundColor: C.card }, headerTintColor: C.text }}
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
});

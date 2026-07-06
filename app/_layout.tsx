import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDatabase } from '../src/db/database';
import { useSettingsStore } from '../src/store/settingsStore';
import { usePurchaseStore } from '../src/store/purchaseStore';
import { getSetting } from '../src/db/queries';
import { View, ActivityIndicator } from 'react-native';
import { useTheme, useIsDark } from '../src/theme/useTheme';
import AppLockGate from '../src/components/AppLockGate';

export default function RootLayout() {
  const C = useTheme();
  const isDark = useIsDark();
  const [dbReady, setDbReady] = useState(false);
  const loadAll = useSettingsStore(s => s.loadAll);
  const initializePurchases = usePurchaseStore(s => s.initialize);

  useEffect(() => {
    (async () => {
      try {
        await getDatabase();
        await loadAll();
        const onboardingDone = await getSetting('onboarding_done');
        if (onboardingDone !== '1') {
          // DB 準備完了後にオンボーディングへ誘導
          setTimeout(() => router.replace('/onboarding'), 100);
        }
      } catch (e) {
        console.error('DB init error:', e);
      } finally {
        setDbReady(true);
      }
    })();

    initializePurchases();
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.primary} />
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

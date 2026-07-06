import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, AppState, type AppStateStatus, StyleSheet } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../store/settingsStore';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import { t } from '../i18n';

interface Props {
  children: React.ReactNode;
}

export default function AppLockGate({ children }: Props) {
  const C = useTheme();
  const s = makeStyles(C);
  const appLockEnabled = useSettingsStore((st) => st.settings.appLockEnabled);
  const [unlocked, setUnlocked] = useState(!appLockEnabled);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  // Face ID等のシステム認証UI自体がアプリを一瞬 'inactive' にするため、
  // 認証中はその遷移をバックグラウンド復帰と誤検知して再認証ループに陥らないようにするフラグ
  const isAuthenticatingRef = useRef(false);

  const tryAuthenticate = async () => {
    if (isAuthenticatingRef.current) return;
    isAuthenticatingRef.current = true;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        // 認証手段が端末にない場合、ロックしたままだとアプリが使えなくなるため通す
        setUnlocked(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('app_lock_prompt'),
        cancelLabel: t('cancel'),
      });
      if (result.success) setUnlocked(true);
    } catch {
      // 認証自体が失敗した場合はロックしたまま留める
    } finally {
      isAuthenticatingRef.current = false;
    }
  };

  useEffect(() => {
    if (appLockEnabled) {
      setUnlocked(false);
      tryAuthenticate();
    } else {
      setUnlocked(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLockEnabled]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      // 'background' からの復帰のみを対象にする。'inactive' は認証シート表示時にも
      // 一時的に経由するため、これを含めると認証→再検知→再認証の無限ループになる。
      if (appLockEnabled && appState.current === 'background' && next === 'active') {
        setUnlocked(false);
        tryAuthenticate();
      }
      appState.current = next;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLockEnabled]);

  if (unlocked) return <>{children}</>;

  return (
    <View style={s.container}>
      <View style={s.iconWrap}>
        <Ionicons name="lock-closed" size={32} color={C.primary} />
      </View>
      <Text style={s.message}>{t('app_lock_locked_message')}</Text>
      <TouchableOpacity style={s.button} onPress={tryAuthenticate} activeOpacity={0.85}>
        <Text style={s.buttonText}>{t('app_lock_unlock_button')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    message: {
      fontSize: 15,
      color: C.text2,
      textAlign: 'center',
      marginBottom: 24,
    },
    button: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingHorizontal: 32,
      paddingVertical: 14,
    },
    buttonText: {
      color: '#FFF',
      fontSize: 15,
      fontWeight: '800',
    },
  });
}

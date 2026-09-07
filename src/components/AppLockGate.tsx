import * as Sentry from '@sentry/react-native';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, AppState, type AppStateStatus, StyleSheet, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../store/settingsStore';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import { t } from '../i18n';
import { isAppLockSuppressed } from '../utils/appLockSuppress';

interface Props {
  children: React.ReactNode;
}

export default function AppLockGate({ children }: Props) {
  const C = useTheme();
  const s = makeStyles(C);
  const appLockEnabled = useSettingsStore((st) => st.settings.appLockEnabled);
  const [unlocked, setUnlocked] = useState(!appLockEnabled);
  // アプリスイッチャー用のスナップショットが撮られる間だけ画面を覆う
  const [covered, setCovered] = useState(false);
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
      else if (result.error && result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        // 生体認証のロックアウト等。何も表示しないと「ボタンを押しても無反応」に
        // 見え、設定画面にも行けないためアプリから締め出されたのと同じになる。
        Alert.alert(t('app_lock_failed_title'), t('app_lock_failed_msg'));
      }
    } catch (e) {
      // 例外時も同様に無言にしない
      try {
        Sentry.captureException(e, { tags: { area: 'app_lock' } });
      } catch { /* 計装の失敗は無視 */ }
      Alert.alert(t('app_lock_failed_title'), t('app_lock_failed_msg'));
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
      if (appLockEnabled) {
        // 目隠し: iOSがアプリスイッチャー用のスナップショットを撮るのは
        // active → inactive → background の**遷移中**で、その時点ではまだ
        // トレード一覧が表示されている。復帰時にロックしても、撮られた1枚には
        // 直前の画面が写っており、スイッチャーを開けば誰でも見られる。
        //
        // 認証シートの表示中も 'inactive' を経由するので、そこでは覆わない
        // （自分の認証UIの裏を隠してしまい、解除後のちらつきにもなる）。
        if (!isAuthenticatingRef.current && !isAppLockSuppressed()
            && (next === 'inactive' || next === 'background')) {
          setCovered(true);
        } else if (next === 'active') {
          setCovered(false);
        }

        // 再ロックは 'background' からの復帰のみを対象にする。'inactive' は
        // 認証シート表示時にも経由するため、含めると認証→再検知→再認証の
        // 無限ループになる。目隠しと再ロックで条件が違うのは意図的。
        // 写真ピッカー・ファイル選択・共有シートはOSの別画面なのでアプリが
        // background になるが、ユーザーはアプリを離れていない。ここで再ロックすると
        // 「写真を選んだ瞬間に認証を求められる」ことになるので、抑止中は掛けない。
        if (appState.current === 'background' && next === 'active' && !isAppLockSuppressed()) {
          setUnlocked(false);
          tryAuthenticate();
        }
      }
      appState.current = next;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLockEnabled]);

  // **children を常にマウントしたままにする。** 以前はロック中に別のツリーを
  // 返しており、再ロックのたびに画面が作り直されて**入力途中の記録が消えていた**。
  // 写真ピッカーから戻ったときに記録画面が巻き戻る、という形で表面化した。
  // 中身を見せないことは、上に載せる不透明なビューで達成する。
  const showCover = appLockEnabled && covered;
  const showLock = appLockEnabled && !unlocked && !covered;
  const hideChildren = showCover || showLock;

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        // 覆っている間は背後を触れず、読み上げ対象からも外す。
        pointerEvents={hideChildren ? 'none' : 'auto'}
        accessibilityElementsHidden={hideChildren}
        importantForAccessibility={hideChildren ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>

      {showCover && (
        // アプリスイッチャー用のスナップショットに中身を写さないための覆い。
        <View style={[s.container, StyleSheet.absoluteFill]}>
          <View style={s.iconWrap}>
            <Ionicons name="lock-closed" size={32} color={C.primary} />
          </View>
        </View>
      )}

      {showLock && (
        <View style={[s.container, StyleSheet.absoluteFill]} accessibilityViewIsModal>
          <View style={s.iconWrap}>
            <Ionicons name="lock-closed" size={32} color={C.primary} />
          </View>
          <Text style={s.message}>{t('app_lock_locked_message')}</Text>
          <TouchableOpacity style={s.button} onPress={tryAuthenticate} activeOpacity={0.85}>
            <Text style={s.buttonText}>{t('app_lock_unlock_button')}</Text>
          </TouchableOpacity>
        </View>
      )}
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
      color: C.onAccent,
      fontSize: 15,
      fontWeight: '800',
    },
  });
}

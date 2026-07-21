import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Dimensions, Animated, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { setSetting } from '../src/db/queries';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/useTheme';
import type { ThemeColors } from '../src/theme/colors';
import { t } from '../src/i18n';

const { width } = Dimensions.get('window');

const STEPS = [
  {
    icon: 'flash' as const,
    iconColor: '#F5A623',
    title: 'onboarding_step1_title' as const,
    desc: 'onboarding_step1_desc' as const,
  },
  {
    icon: 'analytics' as const,
    iconColor: '#4F7EF7',
    title: 'onboarding_step2_title' as const,
    desc: 'onboarding_step2_desc' as const,
  },
  {
    icon: 'flame' as const,
    iconColor: '#E74C3C',
    title: 'onboarding_step3_title' as const,
    desc: 'onboarding_step3_desc' as const,
  },
];

export default function OnboardingScreen() {
  const C = useTheme();
  const s = makeStyles(C);
  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const updateAppLockEnabled = useSettingsStore(s => s.updateAppLockEnabled);

  const goTo = (index: number) => {
    setStep(index);
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      goTo(step + 1);
    } else {
      finishOnboarding();
    }
  };

  const finishOnboarding = async () => {
    await setSetting('onboarding_done', '1');
    await maybePromptAppLock();
    router.replace('/(tabs)');
    // 少し遅らせてからクイック入力を開く
    setTimeout(() => {
      router.push('/trade/new');
    }, 300);
  };

  // 生体認証が利用可能な端末でのみ、アプリロックの有効化を一度だけ提案する
  const maybePromptAppLock = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return;

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
      // 認証状態の確認に失敗しても何もしない（ロックなしのまま続行）
    }
  };

  const handleSkip = async () => {
    await setSetting('onboarding_done', '1');
    router.replace('/(tabs)');
  };

  const isLast = step === STEPS.length - 1;

  return (
    <SafeAreaView style={s.container}>
      {/* スキップ */}
      <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
        <Text style={s.skipText}>{t('onboarding_skip')}</Text>
      </TouchableOpacity>

      {/* スライドコンテンツ */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setStep(idx);
        }}
      >
        {STEPS.map((item, i) => (
          <View key={i} style={[s.slide, { width }]}>
            <View style={[s.iconCircle, { backgroundColor: item.iconColor + '20' }]}>
              <Ionicons name={item.icon} size={64} color={item.iconColor} />
            </View>
            <Text style={s.title}>{t(item.title)}</Text>
            <Text style={s.desc}>{t(item.desc)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ドット */}
      <View style={s.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[s.dot, i === step && s.dotActive]} />
        ))}
      </View>

      {/* ボタン */}
      <View style={s.btnWrap}>
        <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={s.nextBtnText}>
            {isLast ? t('onboarding_start') : t('onboarding_next')}
          </Text>
          {!isLast && <Ionicons name="arrow-forward" size={18} color="#FFF" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    skipBtn: {
      alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 14,
    },
    skipText: { fontSize: 14, color: C.text3 },

    slide: {
      alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 40, gap: 20,
    },
    iconCircle: {
      width: 140, height: 140, borderRadius: 70,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 12,
    },
    title: {
      fontSize: 26, fontWeight: '800', color: C.text,
      textAlign: 'center', letterSpacing: -0.5,
    },
    desc: {
      fontSize: 16, color: C.text2, textAlign: 'center',
      lineHeight: 26,
    },

    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
    dotActive: { width: 24, backgroundColor: C.primary },

    btnWrap: { paddingHorizontal: 24, paddingBottom: 24 },
    nextBtn: {
      backgroundColor: C.primary, borderRadius: 16, paddingVertical: 18,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      shadowColor: C.primary, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
    },
    nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  });
}

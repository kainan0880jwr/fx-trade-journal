import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { setSetting } from '../src/db/queries';
import { recordOnboardingCompleted } from '../src/utils/retentionEvents';
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
  const [showChoice, setShowChoice] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const goTo = (index: number) => {
    setStep(index);
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      goTo(step + 1);
    } else {
      // 説明スライドの最後まで来たら、いきなり記録画面へ飛ばすのではなく
      // 「今すぐ記録する / CSVを取り込む / まず見る」の3択を提示する。
      setShowChoice(true);
    }
  };

  const completeOnboarding = async () => {
    // setSetting が失敗すると未処理のPromise rejectionになり、後続の
    // router.replace に到達せず**ボタンを押しても何も起きない**状態になっていた。
    // しかもフラグが立たないため再起動しても毎回オンボーディングに戻る。
    // フラグ保存は次回起動でやり直せるので、画面遷移だけは必ず通す。
    try {
      await setSetting('onboarding_done', '1');
    } catch { /* 次回起動で再試行される */ }
    recordOnboardingCompleted();
  };

  // アプリロックの提案はここではなく、初回トレード保存後（useAppLockPrompt）に
  // 分離している — オンボーディング直後に許諾ダイアログと強制遷移が重なる
  // 体験を避けるため
  const handleChooseRecord = async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
    setTimeout(() => { router.push('/trade/new'); }, 300);
  };

  const handleChooseImport = async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
    setTimeout(() => {
      router.push({ pathname: '/(tabs)/settings', params: { autoImport: '1' } });
    }, 300);
  };

  const handleChooseBrowse = async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
  };

  const handleSkip = async () => {
    await setSetting('onboarding_done', '1');
    router.replace('/(tabs)');
  };

  const isLast = step === STEPS.length - 1;

  if (showChoice) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.choiceWrap}>
          <Text style={s.choiceTitle}>{t('onboarding_choice_title')}</Text>

          <TouchableOpacity style={s.choiceCard} onPress={handleChooseRecord} activeOpacity={0.85}>
            <View style={[s.choiceIcon, { backgroundColor: '#F5A62320' }]}>
              <Ionicons name="flash" size={26} color="#F5A623" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.choiceCardTitle}>{t('onboarding_choice_record_title')}</Text>
              <Text style={s.choiceCardDesc}>{t('onboarding_choice_record_desc')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.text3} />
          </TouchableOpacity>

          <TouchableOpacity style={s.choiceCard} onPress={handleChooseImport} activeOpacity={0.85}>
            <View style={[s.choiceIcon, { backgroundColor: '#4F7EF720' }]}>
              <Ionicons name="cloud-upload" size={26} color="#4F7EF7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.choiceCardTitle}>{t('onboarding_choice_import_title')}</Text>
              <Text style={s.choiceCardDesc}>{t('onboarding_choice_import_desc')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.text3} />
          </TouchableOpacity>

          <TouchableOpacity style={s.choiceCard} onPress={handleChooseBrowse} activeOpacity={0.85}>
            <View style={[s.choiceIcon, { backgroundColor: C.text3 + '20' }]}>
              <Ionicons name="eye" size={26} color={C.text3} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.choiceCardTitle}>{t('onboarding_choice_browse_title')}</Text>
              <Text style={s.choiceCardDesc}>{t('onboarding_choice_browse_desc')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.text3} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
          {!isLast && <Ionicons name="arrow-forward" size={18} color={C.onAccent} />}
        </TouchableOpacity>
        {/* 初回起動で最も強い訴求が出る画面なのに、免責がどこにも無かった。
            既存の文言を流用するので新規翻訳は不要。 */}
        <Text style={s.disclaimer}>{t('paywall_disclaimer')}</Text>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    disclaimer: { fontSize: 10, lineHeight: 14, color: C.text3, textAlign: 'center', marginTop: 12, paddingHorizontal: 8 },
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
    nextBtnText: { color: C.onAccent, fontSize: 16, fontWeight: '800' },

    choiceWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
    choiceTitle: {
      fontSize: 24, fontWeight: '800', color: C.text,
      textAlign: 'center', marginBottom: 16, letterSpacing: -0.5,
    },
    choiceCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: C.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: C.border,
    },
    choiceIcon: {
      width: 48, height: 48, borderRadius: 24,
      alignItems: 'center', justifyContent: 'center',
    },
    choiceCardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    choiceCardDesc: { fontSize: 12.5, color: C.text2, marginTop: 3, lineHeight: 17 },
  });
}

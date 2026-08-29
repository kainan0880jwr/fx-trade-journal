import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { usePurchaseStore } from '../store/purchaseStore';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import { t } from '../i18n';
import { recordPremiumGateShown } from '../utils/paywallEvents';

interface Props {
  children: React.ReactNode;
  /** ロック画面に表示する機能名（翻訳済み文字列） */
  feature: string;
  /**
   * 計測用の安定キー。`feature`は翻訳文字列のため言語ごとに値が変わってしまい、
   * 集計に使えない（既存の「翻訳文字列を状態値にしない」方針と同じ理由）。
   * 未指定の場合は 'unknown' として計上される。
   */
  featureKey?: string;
}

export default function PremiumGate({ children, feature, featureKey }: Props) {
  const isPremium = usePurchaseStore(s => s.isPremium);
  const C = useTheme();
  const s = makeStyles(C);

  // ロック画面が実際に表示されたときだけ計上する（プレミアムユーザーでは発火しない）。
  // 機能ごとにセッション内1回へ間引く処理は recordPremiumGateShown 側が持つ。
  React.useEffect(() => {
    if (!isPremium) recordPremiumGateShown(featureKey);
  }, [isPremium, featureKey]);

  if (isPremium) return <>{children}</>;

  return (
    <View style={s.container}>
      {/* ── ぼかしプレビュー（childrenを薄く表示して価値を示す）── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={s.previewContent}>
          {children}
        </View>
        {/* 上から下へのフェードで下部のコンテンツを隠す */}
        <LinearGradient
          colors={['transparent', C.bg + 'CC', C.bg]}
          locations={[0, 0.45, 0.75]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      {/* ── ロックカード（中央オーバーレイ）── */}
      <View style={s.lockWrap}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name="lock-closed" size={28} color={C.primary} />
          </View>
          <Text style={s.badge}>{t('premium_badge')}</Text>
          <Text style={s.title}>{feature}</Text>
          <Text style={s.msg}>{t('premium_gate_msg')}</Text>
          <TouchableOpacity
            style={s.btn}
            onPress={() => router.push({
              pathname: '/paywall',
              params: { source: 'gate', feature: featureKey ?? 'unknown' },
            })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('premium_gate_btn')}
          >
            <Text style={s.btnText}>{t('premium_gate_btn')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.bg,
    },
    // preview: childrenを薄く表示（opacity でぼかし感を演出）
    previewContent: {
      flex: 1,
      opacity: 0.13,
    },
    // ロックカードを中央下寄りに配置
    lockWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 60,
      paddingHorizontal: 32,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      padding: 28,
      alignItems: 'center',
      width: '100%',
      maxWidth: 340,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 12,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: C.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    badge: {
      fontSize: 11,
      fontWeight: '800',
      color: C.primary,
      letterSpacing: 2,
      backgroundColor: C.primary + '18',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      marginBottom: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: C.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    msg: {
      fontSize: 13,
      color: C.text2,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
    },
    btn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingHorizontal: 32,
      paddingVertical: 14,
      width: '100%',
      alignItems: 'center',
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 6,
    },
    btnText: {
      color: '#FFF',
      fontSize: 15,
      fontWeight: '800',
    },
  });
}

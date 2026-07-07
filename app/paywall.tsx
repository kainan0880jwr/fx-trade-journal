import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { type PurchasesPackage, PACKAGE_TYPE } from 'react-native-purchases';
import { usePurchaseStore } from '../src/store/purchaseStore';
import { useTheme } from '../src/theme/useTheme';
import type { ThemeColors } from '../src/theme/colors';
import { t } from '../src/i18n';

// 機能リスト（5項目に圧縮・i18n化）
const FEATURES = () => [
  { icon: 'analytics-outline' as const, labelKey: 'paywall_feature_analytics' as const },
  { icon: 'calendar-outline' as const,  labelKey: 'paywall_feature_insights' as const },
  { icon: 'images-outline' as const,    labelKey: 'paywall_feature_images' as const },
  { icon: 'pulse-outline' as const,     labelKey: 'paywall_feature_mental' as const },
  { icon: 'star-outline' as const,      labelKey: 'paywall_feature_extras' as const },
];

/** 年額プランを月割り換算して文字列を返す（例: "¥417/月"）*/
function monthlyEquivalent(pkg: PurchasesPackage): string | null {
  try {
    const price = pkg.product.price;
    if (!price || price <= 0) return null;
    const perMonth = Math.round(price / 12);
    return `¥${perMonth.toLocaleString()}${t('paywall_per_month')}`;
  } catch {
    return null;
  }
}

export default function PaywallScreen() {
  const C = useTheme();
  const s = makeStyles(C);
  const { getOfferings, purchase, restore, isPremium } = usePurchaseStore();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPkgs, setLoadingPkgs] = useState(true);

  const loadOfferings = () => {
    setLoadingPkgs(true);
    getOfferings().then((offerings) => {
      const pkgs = offerings?.current?.availablePackages ?? [];
      setPackages(pkgs);
      const yearly = pkgs.find(p => p.packageType === PACKAGE_TYPE.ANNUAL);
      setSelected(yearly ?? pkgs[0] ?? null);
      setLoadingPkgs(false);
    });
  };

  useEffect(() => {
    if (isPremium) { router.back(); return; }
    loadOfferings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium]);

  const handlePurchase = async () => {
    if (!selected) return;
    setLoading(true);
    const ok = await purchase(selected);
    setLoading(false);
    if (ok === true) {
      Alert.alert(t('purchase_success_title'), t('purchase_success_msg'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else if (ok === false) {
      Alert.alert(t('error'), t('purchase_fail_msg'));
    }
    // ok === null はユーザーキャンセルのため何も表示しない
  };

  const handleRestore = async () => {
    setLoading(true);
    const ok = await restore();
    setLoading(false);
    if (ok) {
      Alert.alert(t('restore_success_title'), t('restore_success_msg'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      Alert.alert(t('restore_fail_title'), t('restore_fail_msg'));
    }
  };

  const features = FEATURES();

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => router.back()}
          accessibilityLabel={t('cancel')}
          accessibilityRole="button"
        >
          <Ionicons name="close" size={22} color={C.text2} />
        </TouchableOpacity>

        {/* ヒーロー */}
        <View style={s.heroWrap}>
          <View style={s.heroGlow}>
            <LinearGradient colors={[C.primaryGlow, 'transparent']} style={s.heroGlowGradient} />
          </View>
          <LinearGradient
            colors={[C.primaryLight + '30', C.primary + '20']}
            style={s.heroIcon}
          >
            <Ionicons name="analytics" size={36} color={C.primary} />
          </LinearGradient>
          <Text style={s.badge}>{t('app_name')} {t('premium_badge')}</Text>
          <Text style={s.heroTitle}>{t('premium_title')}</Text>
          <Text style={s.heroDesc}>{t('premium_desc')}</Text>
        </View>

        {/* ── プランカード（機能リストより先＝ファーストビューに価格を出す）── */}
        {loadingPkgs ? (
          <ActivityIndicator color={C.primary} style={{ marginVertical: 24 }} />
        ) : packages.length === 0 ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={s.noPkgs}>{t('paywall_no_packages')}</Text>
            <TouchableOpacity onPress={loadOfferings} style={s.retryBtn} accessibilityRole="button">
              <Text style={s.retryBtnText}>{t('paywall_retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.planWrap}>
            {packages.map((pkg) => {
              const isSelected = selected?.identifier === pkg.identifier;
              const isYearly = pkg.packageType === PACKAGE_TYPE.ANNUAL;
              const perMonth = isYearly ? monthlyEquivalent(pkg) : null;
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[s.planCard, isSelected && s.planCardSelected]}
                  onPress={() => setSelected(pkg)}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${pkg.product.title} ${pkg.product.priceString}`}
                >
                  {isYearly && (
                    <View style={s.bestBadge}>
                      <Text style={s.bestBadgeText}>おすすめ</Text>
                    </View>
                  )}
                  <View style={s.planRadio}>
                    {isSelected && <View style={s.planRadioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planTitle}>{pkg.product.title}</Text>
                    <View style={s.planPriceRow}>
                      <Text style={s.planPrice}>{pkg.product.priceString}</Text>
                      {perMonth != null && (
                        <Text style={s.planPerMonth}> = {perMonth}</Text>
                      )}
                    </View>
                    {pkg.product.introPrice && (
                      <Text style={s.planTrial}>
                        {pkg.product.introPrice.periodNumberOfUnits}
                        {{ DAY: '日間', WEEK: '週間', MONTH: 'ヶ月間', YEAR: '年間' }[pkg.product.introPrice.periodUnit] ?? ''}
                        無料トライアルあり
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── CTAボタン（ファーストビュー内）── プラン取得に失敗した場合は誤操作防止のため非表示 */}
        {packages.length > 0 && (
          <TouchableOpacity
            style={[s.ctaBtnWrap, (!selected || loading) && s.ctaBtnDisabled]}
            onPress={handlePurchase}
            disabled={!selected || loading}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[C.primaryLight, C.primary, C.primaryDark]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.ctaBtn}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={s.ctaBtnText}>
                  {selected?.product.introPrice ? t('premium_trial') : t('premium_cta')}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={s.restoreBtn}
          onPress={handleRestore}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t('premium_restore')}
        >
          <Text style={s.restoreBtnText}>{t('premium_restore')}</Text>
        </TouchableOpacity>

        {/* ── 機能リスト（CTAの後 = スクロール領域）── */}
        <View style={s.featureCard}>
          {features.map((f, i) => (
            <View key={i} style={[s.featureRow, i < features.length - 1 && s.featureBorder]}>
              <View style={s.featureIconWrap}>
                <Ionicons name={f.icon} size={18} color={C.primary} />
              </View>
              <Text style={s.featureLabel}>{t(f.labelKey)}</Text>
            </View>
          ))}
        </View>

        {/* 法的情報（i18n化） */}
        <Text style={s.legal}>
          {t('paywall_legal').replace('{store}', Platform.OS === 'ios' ? 'App Store' : 'Google Play')}
        </Text>
        <View style={s.legalLinks}>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://kainan0880jwr.github.io/fx-trade-journal/privacy-policy.html')}
            accessibilityRole="link"
          >
            <Text style={s.legalLink}>{t('settings_privacy')}</Text>
          </TouchableOpacity>
          <Text style={s.legalSep}>・</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://kainan0880jwr.github.io/fx-trade-journal/terms.html')}
            accessibilityRole="link"
          >
            <Text style={s.legalLink}>利用規約</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 20, paddingBottom: 40 },

    closeBtn: {
      alignSelf: 'flex-end', marginTop: 16,
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },

    heroWrap: { alignItems: 'center', paddingVertical: 20 },
    heroGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 160, alignItems: 'center' },
    heroGlowGradient: { width: 240, height: 160, borderRadius: 120 },
    heroIcon: {
      width: 72, height: 72, borderRadius: 36,
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      borderWidth: 1, borderColor: C.primary + '40',
    },
    badge: {
      fontSize: 11, fontWeight: '800', color: C.primary, letterSpacing: 2,
      backgroundColor: C.primary + '18', paddingHorizontal: 12, paddingVertical: 4,
      borderRadius: 8, marginBottom: 10,
    },
    heroTitle: { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 6 },
    heroDesc: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 22 },

    planWrap: { gap: 10, marginBottom: 16 },
    planCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.card, borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
      padding: 16, gap: 12,
    },
    planCardSelected: { borderColor: C.primary, backgroundColor: C.primary + '10' },
    bestBadge: {
      position: 'absolute', top: -10, right: 14,
      backgroundColor: C.yellow, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
    },
    bestBadgeText: { fontSize: 10, fontWeight: '800', color: '#000' },
    planRadio: {
      width: 20, height: 20, borderRadius: 10,
      borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
    },
    planRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
    planTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
    planPriceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
    planPrice: { fontSize: 16, fontWeight: '800', color: C.primary },
    planPerMonth: { fontSize: 12, color: C.text2, fontWeight: '600' },
    planTrial: { fontSize: 11, color: C.win, marginTop: 2 },

    ctaBtnWrap: {
      borderRadius: 16, marginBottom: 12,
      shadowColor: C.primary, shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.55, shadowRadius: 16, elevation: 10,
    },
    ctaBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    ctaBtnDisabled: { opacity: 0.5 },
    ctaBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

    restoreBtn: { alignItems: 'center', paddingVertical: 10, marginBottom: 20 },
    restoreBtnText: { fontSize: 13, color: C.text2 },

    featureCard: {
      backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border,
      marginBottom: 20, overflow: 'hidden',
    },
    featureRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
    featureBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    featureIconWrap: {
      width: 32, height: 32, borderRadius: 8,
      backgroundColor: C.primary + '18', alignItems: 'center', justifyContent: 'center',
    },
    featureLabel: { flex: 1, fontSize: 13, color: C.text, fontWeight: '500' },

    noPkgs: { fontSize: 13, color: C.text3, textAlign: 'center', marginTop: 24, marginBottom: 12, paddingHorizontal: 24 },
    retryBtn: {
      borderWidth: 1, borderColor: C.primary, borderRadius: 12,
      paddingHorizontal: 20, paddingVertical: 8, marginBottom: 12,
    },
    retryBtnText: { color: C.primary, fontSize: 13, fontWeight: '700' },

    legal: {
      fontSize: 11, color: C.text3, textAlign: 'center',
      lineHeight: 17, paddingHorizontal: 16, marginBottom: 8,
    },
    legalLinks: {
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingBottom: 8,
    },
    legalLink: { fontSize: 11, color: C.primary, textDecorationLine: 'underline' },
    legalSep: { fontSize: 11, color: C.text3, marginHorizontal: 4 },
  });
}

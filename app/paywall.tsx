import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Purchases, {
  type PurchasesPackage, PACKAGE_TYPE, INTRO_ELIGIBILITY_STATUS,
} from 'react-native-purchases';
import { usePurchaseStore } from '../src/store/purchaseStore';
import { useTheme } from '../src/theme/useTheme';
import type { ThemeColors } from '../src/theme/colors';
import { t } from '../src/i18n';
import { monthlyEquivalent, annualDiscountPct, trialLabel } from '../src/utils/paywallCalc';

// 機能リスト（5項目に圧縮・i18n化）。propsやstateに依存しないためモジュールレベルの定数にする
const FEATURES = [
  { icon: 'analytics-outline' as const, labelKey: 'paywall_feature_analytics' as const },
  { icon: 'calendar-outline' as const,  labelKey: 'paywall_feature_insights' as const },
  { icon: 'images-outline' as const,    labelKey: 'paywall_feature_images' as const },
  { icon: 'pulse-outline' as const,     labelKey: 'paywall_feature_mental' as const },
  { icon: 'star-outline' as const,      labelKey: 'paywall_feature_extras' as const },
];

// getOfferings()がネットワーク不良等で応答しない場合に、読み込みスピナーが
// 無限に表示され続けるのを防ぐタイムアウト（ミリ秒）
const OFFERINGS_TIMEOUT_MS = 10000;

// タイムアウト後もリクエスト自体はキャンセルされないため、後から本来のPromiseが
// 解決した場合はUIが正しい結果に更新される（呼び出し側のrequestId比較で古い結果は破棄）
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default function PaywallScreen() {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { getOfferings, purchase, restore, isPremium } = usePurchaseStore();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [eligibleTrialIds, setEligibleTrialIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const isMounted = useRef(true);
  const requestId = useRef(0);
  const purchasingRef = useRef(false);
  const restoringRef = useRef(false);
  const closingRef = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const loadOfferings = () => {
    const myRequestId = ++requestId.current;
    setLoadingPkgs(true);
    withTimeout(getOfferings(), OFFERINGS_TIMEOUT_MS, null).then(async (offerings) => {
      // 古い（後から呼ばれたリクエストより先に返ってきた）レスポンスは破棄
      if (!isMounted.current || myRequestId !== requestId.current) return;

      const pkgs = offerings?.current?.availablePackages ?? [];
      setPackages(pkgs);
      const yearly = pkgs.find(p => p.packageType === PACKAGE_TYPE.ANNUAL);
      setSelected(yearly ?? pkgs[0] ?? null);
      setLoadingPkgs(false);

      // トライアル資格は「不明」なら誤解を招くため非表示側に倒す（ELIGIBLEのみ表示）
      const trialProductIds = pkgs.filter(p => p.product.introPrice).map(p => p.product.identifier);
      if (trialProductIds.length > 0) {
        if (Platform.OS === 'android') {
          // checkTrialOrIntroductoryPriceEligibilityはiOS専用で、Androidでは常に
          // UNKNOWNを返す（RevenueCat SDK仕様）。Google Play側の購入フローが実際の
          // 資格を判定するため、ここではintroPriceの有無のみで楽観的に表示する。
          setEligibleTrialIds(new Set(trialProductIds));
        } else {
          try {
            const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(trialProductIds);
            if (!isMounted.current || myRequestId !== requestId.current) return;
            const eligibleIds = Object.entries(result)
              .filter(([, v]) => v.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE)
              .map(([id]) => id);
            setEligibleTrialIds(new Set(eligibleIds));
          } catch {
            // 取得失敗時は安全側に倒し、トライアル表示なしのまま
          }
        }
      }
    }).catch(() => {
      if (isMounted.current && myRequestId === requestId.current) setLoadingPkgs(false);
    });
  };

  useEffect(() => {
    if (isPremium) { router.back(); return; }
    loadOfferings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium]);

  const handlePurchase = async () => {
    if (!selected || purchasingRef.current) return;
    purchasingRef.current = true;
    setLoading(true);
    const result = await purchase(selected);
    purchasingRef.current = false;
    if (!isMounted.current) return;
    setLoading(false);
    switch (result) {
      case 'success':
        // isPremiumの変化はストアが検知し、上のuseEffectが自動でrouter.back()するため
        // ここでは戻らず、ユーザーへの完了通知のみ行う
        Alert.alert(t('purchase_success_title'), t('purchase_success_msg'));
        break;
      case 'pending':
        Alert.alert(t('purchase_pending_title'), t('purchase_pending_msg'));
        break;
      case 'no_entitlement':
        Alert.alert(t('purchase_no_entitlement_title'), t('purchase_no_entitlement_msg'));
        break;
      case 'error':
        Alert.alert(t('error'), t('purchase_fail_msg'));
        break;
      case 'cancelled':
        // ユーザーキャンセルのため何も表示しない
        break;
    }
  };

  const handleRestore = async () => {
    if (restoringRef.current) return;
    restoringRef.current = true;
    setRestoring(true);
    const result = await restore();
    restoringRef.current = false;
    if (!isMounted.current) return;
    setRestoring(false);
    if (result === 'success') {
      Alert.alert(t('restore_success_title'), t('restore_success_msg'));
    } else if (result === 'no_entitlement') {
      Alert.alert(t('restore_fail_title'), t('restore_fail_msg'));
    } else {
      Alert.alert(t('restore_error_title'), t('restore_error_msg'));
    }
  };

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    router.back();
  };

  const features = FEATURES;
  const hasTrialSelected = !!selected && eligibleTrialIds.has(selected.product.identifier);
  const monthlyPkg = packages.find(p => p.packageType === PACKAGE_TYPE.MONTHLY);
  const busy = loading || restoring;
  // LinearGradientの終端に'transparent'（無色透明の黒）を使うとAndroidで色が濁って
  // 見えることがあるため、開始色と同じ色相のalpha=0を明示的に使う
  const glowTransparent = C.primaryGlow.replace(/[\d.]+\)$/, '0)');

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <TouchableOpacity
        style={[s.closeBtn, { top: insets.top + 12 }]}
        onPress={handleClose}
        disabled={busy}
        accessibilityLabel={t('cancel')}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={22} color={C.text2} />
      </TouchableOpacity>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ヒーロー */}
        <View style={s.heroWrap}>
          <View style={s.heroGlow}>
            <LinearGradient colors={[C.primaryGlow, glowTransparent]} style={s.heroGlowGradient} />
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
              const discountPct = isYearly ? annualDiscountPct(pkg, monthlyPkg) : null;
              const showTrial = !!pkg.product.introPrice && eligibleTrialIds.has(pkg.product.identifier);
              const trialText = trialLabel(pkg);
              const planName = isYearly ? t('premium_yearly')
                : pkg.packageType === PACKAGE_TYPE.MONTHLY ? t('premium_monthly')
                : pkg.product.title;
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[s.planCard, isSelected && s.planCardSelected, busy && s.planCardDisabled]}
                  onPress={() => setSelected(pkg)}
                  disabled={busy}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, disabled: busy }}
                  accessibilityLabel={[
                    planName,
                    pkg.product.priceString,
                    discountPct != null ? t('paywall_discount_badge').replace('{pct}', String(discountPct)) : null,
                    showTrial ? trialText : null,
                  ].filter(Boolean).join('. ')}
                >
                  {isYearly && (
                    <View style={s.bestBadge}>
                      <Text style={s.bestBadgeText}>{t('paywall_best_badge')}</Text>
                    </View>
                  )}
                  <View style={s.planRadio}>
                    {isSelected && <View style={s.planRadioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planTitle}>{planName}</Text>
                    <View style={s.planPriceRow}>
                      <Text style={s.planPrice}>{pkg.product.priceString}</Text>
                      {perMonth != null && (
                        <Text style={s.planPerMonth}> = {perMonth}{t('paywall_per_month')}</Text>
                      )}
                    </View>
                    {discountPct != null && (
                      <View style={s.planDiscountBadge}>
                        <Text style={s.planDiscount}>
                          {t('paywall_discount_badge').replace('{pct}', String(discountPct))}
                        </Text>
                      </View>
                    )}
                    {showTrial && (
                      <Text style={s.planTrial}>{trialText}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── 機能リスト ── */}
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

        {/* 投資助言ではない旨の免責 */}
        <Text style={s.disclaimer}>{t('paywall_disclaimer')}</Text>

        {/* 法的情報（i18n化・ストア別の自動更新文言を出し分け）*/}
        <Text style={s.legal}>
          {t('paywall_legal_charge').replace('{store}', Platform.OS === 'ios' ? 'App Store' : 'Google Play')}
          {'\n'}
          {Platform.OS === 'ios' ? t('paywall_legal_renewal_ios') : t('paywall_legal_renewal_android')}
        </Text>
        <View style={s.legalLinks}>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://kainan0880jwr.github.io/fx-trade-journal/privacy-policy.html')}
            accessibilityRole="link"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={s.legalLink} maxFontSizeMultiplier={1.5}>{t('settings_privacy')}</Text>
          </TouchableOpacity>
          <Text style={s.legalSep}>・</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://kainan0880jwr.github.io/fx-trade-journal/terms.html')}
            accessibilityRole="link"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={s.legalLink} maxFontSizeMultiplier={1.5}>{t('settings_terms')}</Text>
          </TouchableOpacity>
          <Text style={s.legalSep}>・</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://kainan0880jwr.github.io/fx-trade-journal/tokushoho.html')}
            accessibilityRole="link"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={s.legalLink} maxFontSizeMultiplier={1.5}>{t('settings_tokushoho')}</Text>
          </TouchableOpacity>
        </View>

        {/* 解約導線: ストアの購読管理画面へ直接遷移できるようにする */}
        <TouchableOpacity
          onPress={() => Linking.openURL(
            Platform.OS === 'ios'
              ? 'https://apps.apple.com/account/subscriptions'
              : 'https://play.google.com/store/account/subscriptions'
          )}
          accessibilityRole="link"
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        >
          <Text style={s.manageLink} maxFontSizeMultiplier={1.5}>{t('paywall_manage_subscription')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── フッター（スクロール外に固定。小さい画面でも常に見える）── */}
      {packages.length > 0 && (
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.ctaBtnWrap, (!selected || busy) && s.ctaBtnDisabled]}
            onPress={handlePurchase}
            disabled={!selected || busy}
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
                  {hasTrialSelected ? t('premium_trial') : t('premium_cta')}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {hasTrialSelected && (
            <Text style={s.trialDisclaimer}>
              {t('paywall_trial_disclaimer')}
              {Platform.OS === 'android' && `\n${t('paywall_trial_disclaimer_android')}`}
            </Text>
          )}

          <TouchableOpacity
            style={s.restoreBtn}
            onPress={handleRestore}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('premium_restore')}
          >
            {restoring ? (
              <ActivityIndicator color={C.text2} size="small" />
            ) : (
              <Text style={s.restoreBtnText}>{t('premium_restore')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 20, paddingBottom: 24 },

    // ScrollView外に絶対配置し、スクロールしても消えないようにする。
    // topはuseSafeAreaInsets().topを加算してレンダー時に指定する
    closeBtn: {
      position: 'absolute', right: 20, zIndex: 10,
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },

    footer: {
      paddingHorizontal: 20, paddingTop: 12,
      borderTopWidth: 1, borderTopColor: C.border,
      backgroundColor: C.bg,
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
    planCardDisabled: { opacity: 0.5 },
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
    planPrice: { fontSize: 20, fontWeight: '800', color: C.primary },
    planPerMonth: { fontSize: 12, color: C.text2, fontWeight: '600' },
    planTrial: { fontSize: 11, color: C.win, marginTop: 4 },
    planDiscountBadge: {
      alignSelf: 'flex-start', backgroundColor: C.primary + '18',
      borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4,
    },
    planDiscount: { fontSize: 11, color: C.primary, fontWeight: '800' },

    ctaBtnWrap: {
      borderRadius: 16, marginBottom: 12,
      shadowColor: C.primary, shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.55, shadowRadius: 16, elevation: 10,
    },
    ctaBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    ctaBtnDisabled: { opacity: 0.5 },
    ctaBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

    trialDisclaimer: {
      // text3はライトモードでWCAG AAのコントラスト比(4.5:1)を満たさないため、
      // 本文相当のtext2を使う
      fontSize: 11, color: C.text2, textAlign: 'center',
      marginBottom: 12, paddingHorizontal: 16, lineHeight: 16,
    },

    restoreBtn: { alignItems: 'center', paddingVertical: 10, marginBottom: 20, minHeight: 34, justifyContent: 'center' },
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

    disclaimer: {
      fontSize: 11, color: C.text2, textAlign: 'center',
      lineHeight: 16, paddingHorizontal: 16, marginBottom: 8,
    },

    legal: {
      fontSize: 11, color: C.text2, textAlign: 'center',
      lineHeight: 17, paddingHorizontal: 16, marginBottom: 8,
    },
    legalLinks: {
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingBottom: 8,
    },
    legalLink: { fontSize: 11, color: C.primary, textDecorationLine: 'underline' },
    legalSep: { fontSize: 11, color: C.text3, marginHorizontal: 4 },

    manageLink: {
      fontSize: 12, color: C.primary, fontWeight: '600', textAlign: 'center',
      textDecorationLine: 'underline', paddingHorizontal: 16, marginBottom: 8,
    },
  });
}

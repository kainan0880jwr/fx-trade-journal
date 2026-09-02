import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTradeStore } from '../src/store/tradeStore';
import { calcBadges, nearlyUnlocked, type UnlockedBadge } from '../src/utils/badges';
import { useSettingsStore } from '../src/store/settingsStore';
import PremiumGate from '../src/components/PremiumGate';
import { useTheme } from '../src/theme/useTheme';
import type { ThemeColors } from '../src/theme/colors';
import { t } from '../src/i18n';
import * as Sentry from '@sentry/react-native';

const CATEGORIES = () => [
  { key: 'all',         label: t('all') },
  { key: 'record',      label: t('cat_record') },
  { key: 'performance', label: t('cat_performance') },
  { key: 'habit',       label: t('cat_habit') },
  { key: 'analysis',    label: t('cat_analysis') },
  { key: 'discipline',  label: t('cat_discipline') },
  { key: 'goal',        label: t('cat_goal') },
];

export default function BadgesScreen() {
  const C = useTheme();
  const s = makeStyles(C);
  const { loadAllTrades } = useTradeStore();
  const settings = useSettingsStore(st => st.settings);
  const [badges, setBadges] = useState<UnlockedBadge[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const goals = {
    monthlyPipsGoal: settings.monthlyPipsGoal,
    monthlyWinRateGoal: settings.monthlyWinRateGoal,
    monthlyPLGoal: settings.monthlyPLGoal,
  };

  useEffect(() => {
    // catch が無いと読み込み失敗時に未処理rejectionになり、画面は
    // 初期値のまま「0 / 0 解除」と表示される。有料機能なので、課金ユーザーが
    // 「金を払ったのに空」を見ることになる。失敗はSentryに残す。
    loadAllTrades()
      .then(trades => setBadges(calcBadges(trades, goals)))
      .catch(e => {
        try { Sentry.captureException(e, { tags: { area: 'badges_load' } }); } catch { /* 無視 */ }
      });
    // 目標を変えると達成判定が変わるので、目標の変更でも計算し直す
  }, [settings.monthlyPipsGoal, settings.monthlyWinRateGoal, settings.monthlyPLGoal]);

  const unlocked = badges.filter(b => b.unlocked).length;
  const nearly = nearlyUnlocked(badges);
  const filtered = filter === 'all' ? badges : badges.filter(b => b.category === filter);

  return (
    <PremiumGate feature={t('settings_badges')} featureKey="badges">
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Ionicons name="trophy-outline" size={28} color={C.yellow} />
        <View style={{ marginLeft: 12 }}>
          <Text style={s.headerTitle}>{t('achievement_badges')}</Text>
          <Text style={s.headerSub}>{unlocked} / {badges.length} {t('unlocked_of')}</Text>
        </View>
        <View style={s.headerProg}>
          <View style={s.headerProgBg}>
            <View style={[s.headerProgFill, { width: `${badges.length > 0 ? unlocked / badges.length * 100 : 0}%` }]} />
          </View>
        </View>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => router.back()}
          accessibilityLabel={t('cancel')}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={22} color={C.text2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterRow}
      >
        {CATEGORIES().map(cat => (
          <TouchableOpacity key={cat.key}
            style={[s.filterBtn, filter === cat.key && s.filterBtnActive]}
            onPress={() => setFilter(cat.key)}>
            <Text style={[s.filterLabel, filter === cat.key && s.filterLabelActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll}>
        {filter === 'all' && nearly.length > 0 && (
          <View style={s.nearlyBox}>
            <Text style={s.nearlyTitle}>{t('badge_nearly_title')}</Text>
            {nearly.map(b => (
              <View key={b.id} style={s.nearlyRow}>
                <Ionicons name={b.icon as any} size={18} color={b.color} />
                <Text style={s.nearlyLabel} numberOfLines={1}>{b.title}</Text>
                <Text style={s.nearlyRemain}>{b.progress} / {b.target}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={s.grid}>
          {filtered.map(badge => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
    </PremiumGate>
  );
}

function BadgeCard({ badge }: { badge: UnlockedBadge }) {
  const C = useTheme();
  const s = makeStyles(C);
  const pct = Math.min(badge.progress / badge.target * 100, 100);
  return (
    <View style={[s.card, !badge.unlocked && s.cardLocked]}>
      <View style={[s.iconCircle, { backgroundColor: badge.unlocked ? badge.color + '25' : C.cardAlt, borderColor: badge.unlocked ? badge.color : C.border }]}>
        <Ionicons
          name={badge.icon as any}
          size={28}
          color={badge.unlocked ? badge.color : C.text3}
        />
        {badge.unlocked && (
          <View style={s.checkBadge}>
            <Ionicons name="checkmark" size={10} color={C.onAccent} />
          </View>
        )}
      </View>
      <Text style={[s.cardTitle, !badge.unlocked && { color: C.text3 }]}>{badge.title}</Text>
      <Text style={s.cardDesc} numberOfLines={2}>{badge.description}</Text>
      {!badge.unlocked && badge.needsGoal && (
        <Text style={s.needsGoal}>{t('badge_needs_goal')}</Text>
      )}
      {!badge.unlocked && !badge.needsGoal && (
        <>
          <View style={s.progBg}>
            <View style={[s.progFill, { width: `${pct}%`, backgroundColor: badge.color }]} />
          </View>
          <Text style={s.progLabel}>{badge.progress} / {badge.target}</Text>
        </>
      )}
      {badge.unlocked && (
        <Text style={[s.unlockedLabel, { color: badge.color }]}>{t('achieved')}</Text>
      )}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    headerTitle: { fontSize: 18, fontWeight: '800', color: C.text },
    headerSub: { fontSize: 12, color: C.text2, marginTop: 2 },
    headerProg: { flex: 1, marginLeft: 16 },
    closeBtn: { padding: 4, marginLeft: 12 },
    headerProgBg: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
    headerProgFill: { height: '100%', backgroundColor: C.yellow, borderRadius: 3 },
    filterScroll: { flexGrow: 0, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    filterRow: { flexDirection: 'row', padding: 10, gap: 6 },
    filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border },
    filterBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
    filterLabel: { fontSize: 12, color: C.text2 },
    filterLabelActive: { color: C.onAccent, fontWeight: '700' },
    scroll: { padding: 12 },
    nearlyBox: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
    nearlyTitle: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 8 },
    nearlyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
    nearlyLabel: { flex: 1, fontSize: 12, color: C.text2 },
    nearlyRemain: { fontSize: 12, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
    needsGoal: { fontSize: 10, color: C.text3, textAlign: 'center', lineHeight: 13, marginBottom: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    card: { width: '47%', backgroundColor: C.card, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border },
    cardLocked: { opacity: 0.6 },
    iconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 10, position: 'relative' },
    checkBadge: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: C.win, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 13, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 4 },
    cardDesc: { fontSize: 11, color: C.text2, textAlign: 'center', lineHeight: 15, marginBottom: 8 },
    progBg: { width: '100%', height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 3 },
    progFill: { height: '100%', borderRadius: 2 },
    progLabel: { fontSize: 10, color: C.text3 },
    unlockedLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  });
}

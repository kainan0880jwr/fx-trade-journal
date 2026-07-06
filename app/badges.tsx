import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTradeStore } from '../src/store/tradeStore';
import { calcBadges, type UnlockedBadge } from '../src/utils/badges';
import PremiumGate from '../src/components/PremiumGate';
import { useTheme } from '../src/theme/useTheme';
import type { ThemeColors } from '../src/theme/colors';
import { t } from '../src/i18n';

const CATEGORIES = () => [
  { key: 'all',         label: t('all') },
  { key: 'record',      label: t('cat_record') },
  { key: 'performance', label: t('cat_performance') },
  { key: 'habit',       label: t('cat_habit') },
  { key: 'analysis',    label: t('cat_analysis') },
];

export default function BadgesScreen() {
  const C = useTheme();
  const s = makeStyles(C);
  const { loadAllTrades } = useTradeStore();
  const [badges, setBadges] = useState<UnlockedBadge[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadAllTrades().then(trades => setBadges(calcBadges(trades)));
  }, []);

  const unlocked = badges.filter(b => b.unlocked).length;
  const filtered = filter === 'all' ? badges : badges.filter(b => b.category === filter);

  return (
    <PremiumGate feature={t('settings_badges')}>
    <SafeAreaView style={s.container} edges={['bottom']}>
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
      </View>

      <View style={s.filterRow}>
        {CATEGORIES().map(cat => (
          <TouchableOpacity key={cat.key}
            style={[s.filterBtn, filter === cat.key && s.filterBtnActive]}
            onPress={() => setFilter(cat.key)}>
            <Text style={[s.filterLabel, filter === cat.key && s.filterLabelActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
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
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        )}
      </View>
      <Text style={[s.cardTitle, !badge.unlocked && { color: C.text3 }]}>{badge.title}</Text>
      <Text style={s.cardDesc} numberOfLines={2}>{badge.description}</Text>
      {!badge.unlocked && (
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
    headerProgBg: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
    headerProgFill: { height: '100%', backgroundColor: C.yellow, borderRadius: 3 },
    filterRow: { flexDirection: 'row', padding: 10, gap: 6, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border },
    filterBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
    filterLabel: { fontSize: 12, color: C.text2 },
    filterLabelActive: { color: '#FFF', fontWeight: '700' },
    scroll: { padding: 12 },
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

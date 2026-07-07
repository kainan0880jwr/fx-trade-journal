import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet
} from 'react-native';
import CountUp from '../../src/components/CountUp';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTradeStore } from '../../src/store/tradeStore';
import TradeCard from '../../src/components/TradeCard';
import MonthSelector from '../../src/components/MonthSelector';
import CalendarModal from '../../src/components/CalendarModal';
import { calcStats } from '../../src/utils/statsCalc';
import { useTheme } from '../../src/theme/useTheme';
import { useIsTablet } from '../../src/hooks/useIsTablet';
import type { ThemeColors } from '../../src/theme/colors';
import { t } from '../../src/i18n';
import type { Trade } from '../../src/types';

const STYLE_FILTERS = [
  { label: () => t('all'), value: '' },
  { label: () => t('style_scalp_short'), value: 'scalping' },
  { label: () => t('style_day_short'), value: 'day' },
  { label: () => t('style_swing'), value: 'swing' },
  { label: () => t('style_other'), value: 'other' },
];

export default function RecordScreen() {
  const C = useTheme();
  const isTablet = useIsTablet();
  const styles = useMemo(() => makeStyles(C, isTablet), [C, isTablet]);

  const { trades, currentMonth, setCurrentMonth, loadTradesByMonth } = useTradeStore();
  const [styleFilter, setStyleFilter] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);

  useEffect(() => {
    loadTradesByMonth(currentMonth);
  }, [currentMonth, loadTradesByMonth]);

  // toISOString()はUTC基準のため、JST等UTCより進んだタイムゾーンでは早朝時間帯に
  // 前日の日付になってしまう。ローカル日付から組み立てる。
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const filtered = useMemo<Trade[]>(() =>
    styleFilter ? trades.filter(t => t.style === styleFilter) : trades,
    [trades, styleFilter]
  );
  const stats = useMemo(() => calcStats(filtered), [filtered]);
  const todayTrades = useMemo(() => trades.filter(t => t.date.startsWith(todayStr)), [trades, todayStr]);
  const todayStats = useMemo(() => calcStats(todayTrades), [todayTrades]);
  const todayPipsColor = todayStats.totalPips > 0 ? C.win : todayStats.totalPips < 0 ? C.loss : C.text2;

  const numColumns = isTablet ? 2 : 1;

  const renderItem = useCallback(({ item, index }: { item: Trade; index: number }) => (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 40).springify().damping(16)}
      style={isTablet ? { flex: 1 } : undefined}
    >
      <TradeCard trade={item} />
    </Animated.View>
  ), [isTablet]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <MonthSelector month={currentMonth} onChange={setCurrentMonth} />

      <View style={styles.filterRow}>
        {STYLE_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterBtn, styleFilter === f.value && styles.filterBtnActive]}
            onPress={() => setStyleFilter(f.value)}
          >
            <Text style={[styles.filterLabel, styleFilter === f.value && styles.filterLabelActive]}>
              {f.label()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsBlock}>
        <View style={styles.todayCard}>
          <View style={styles.todayHeader}>
            <View style={styles.todayDot} />
            <Text style={styles.todayLabel}>TODAY</Text>
          </View>
          <View style={styles.todayRow}>
            <MiniStat label={t('trades')} numericValue={todayTrades.length > 0 ? todayTrades.length : undefined} suffix="件" isTablet={isTablet} />
            <View style={styles.miniSep} />
            <MiniStat label={t('win_rate')} numericValue={todayTrades.length > 0 ? todayStats.winRate : undefined} suffix="%" color={todayTrades.length > 0 ? C.primary : undefined} isTablet={isTablet} />
            <View style={styles.miniSep} />
            <MiniStat label="pips" numericValue={todayTrades.length > 0 ? todayStats.totalPips : undefined} showSign color={todayTrades.length > 0 ? todayPipsColor : undefined} isTablet={isTablet} />
            <View style={styles.miniSep} />
            <MiniStat label="PF" numericValue={todayTrades.length > 0 ? todayStats.profitFactor : undefined} decimals={2} isTablet={isTablet} />
          </View>
        </View>

        <View style={styles.monthBar}>
          <SummaryItem label={t('trade_count')} numericValue={stats.totalTrades} isTablet={isTablet} />
          <View style={styles.sep} />
          <SummaryItem label={t('win_rate')} numericValue={stats.winRate} suffix="%" color={C.primary} isTablet={isTablet} />
          <View style={styles.sep} />
          <SummaryItem label={t('total_pips')} numericValue={stats.totalPips} showSign color={stats.totalPips >= 0 ? C.win : C.loss} isTablet={isTablet} />
          <View style={styles.sep} />
          <SummaryItem label={t('pf')} numericValue={stats.profitFactor} decimals={2} isTablet={isTablet} />
          <View style={styles.sep} />
          <SummaryItem label={t('wins_losses')} numericValue={stats.wins} suffix={`/${stats.losses}`} isTablet={isTablet} />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="journal-outline" size={isTablet ? 52 : 40} color={C.text3} />
            </View>
            <Text style={styles.emptyText}>{t('empty_month')}</Text>
            <Text style={styles.emptySubText}>{t('empty_month_sub')}</Text>
          </View>
        }
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.list}
      />

      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={styles.calBtn}
          onPress={() => setCalendarVisible(true)}
          activeOpacity={0.8}
          accessibilityLabel={t('a11y_open_calendar')}
          accessibilityRole="button"
        >
          <Ionicons name="calendar-outline" size={18} color={C.primary} />
          <Text style={styles.calBtnText}>{t('calendar_btn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bookmarkBtn}
          onPress={() => router.push('/(tabs)/bookmarks')}
          activeOpacity={0.8}
          accessibilityLabel={t('tab_saved')}
          accessibilityRole="button"
        >
          <Ionicons name="bookmark-outline" size={18} color={C.text2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/trade/new')}
          activeOpacity={0.8}
          accessibilityLabel={t('add_trade')}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.fabText}>{t('add_trade')}</Text>
        </TouchableOpacity>
      </View>

      <CalendarModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        trades={trades}
      />
    </SafeAreaView>
  );
}

function MiniStat({ label, numericValue, decimals, suffix, showSign, color, isTablet }: {
  label: string; numericValue?: number; decimals?: number;
  suffix?: string; showSign?: boolean; color?: string; isTablet: boolean;
}) {
  const C = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: isTablet ? 12 : 10, color: C.text3, marginBottom: 2 }}>{label}</Text>
      {numericValue !== undefined ? (
        !isFinite(numericValue) ? (
          <Text style={{ fontSize: isTablet ? 17 : 14, fontWeight: '800', color: color ?? C.text, textAlign: 'center' }}>∞</Text>
        ) : (
          <CountUp
            value={numericValue} decimals={decimals} suffix={suffix} showSign={showSign}
            style={{ fontSize: isTablet ? 17 : 14, fontWeight: '800', color: color ?? C.text, textAlign: 'center' }}
          />
        )
      ) : (
        <Text style={{ fontSize: isTablet ? 17 : 14, fontWeight: '800', color: C.text2 }}>-</Text>
      )}
    </View>
  );
}

function SummaryItem({ label, numericValue, decimals, suffix, showSign, color, isTablet }: {
  label: string; numericValue?: number; decimals?: number;
  suffix?: string; showSign?: boolean; color?: string; isTablet: boolean;
}) {
  const C = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: isTablet ? 11 : 9, color: C.text3, marginBottom: 2, letterSpacing: 0.5, textAlign: 'center' }}>{label}</Text>
      {numericValue !== undefined ? (
        !isFinite(numericValue) ? (
          <Text style={{ fontSize: isTablet ? 15 : 13, fontWeight: '800', color: color ?? C.text, textAlign: 'center' }}>∞</Text>
        ) : (
          <CountUp
            value={numericValue} decimals={decimals} suffix={suffix} showSign={showSign}
            style={{ fontSize: isTablet ? 15 : 13, fontWeight: '800', color: color ?? C.text, textAlign: 'center' }}
          />
        )
      ) : (
        <Text style={{ fontSize: isTablet ? 15 : 13, fontWeight: '800', color: C.text2 }}>-</Text>
      )}
    </View>
  );
}

function makeStyles(C: ThemeColors, isTablet: boolean) {
  const ph = isTablet ? 20 : 14;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },

    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: ph, paddingVertical: 8, gap: 6,
      backgroundColor: C.bg,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    filterBtn: {
      paddingHorizontal: isTablet ? 16 : 12, paddingVertical: 8, borderRadius: 20,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
      minHeight: 44, justifyContent: 'center',
    },
    filterBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
    filterLabel: { fontSize: isTablet ? 14 : 12, color: C.text2 },
    filterLabelActive: { color: '#FFFFFF', fontWeight: '700' },

    statsBlock: { paddingHorizontal: ph, paddingTop: 10, paddingBottom: 4, gap: 8 },

    todayCard: {
      backgroundColor: C.card,
      borderRadius: 14, padding: isTablet ? 16 : 12,
      borderWidth: 1, borderColor: C.border,
    },
    todayHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    todayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.win },
    todayLabel: { fontSize: isTablet ? 12 : 10, fontWeight: '800', color: C.text3, letterSpacing: 1.5 },
    todayRow: { flexDirection: 'row', alignItems: 'center' },
    miniSep: { width: 1, height: 28, backgroundColor: C.border },

    monthBar: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.cardAlt,
      borderRadius: 14, paddingVertical: isTablet ? 14 : 11,
      borderWidth: 1, borderColor: C.border,
    },
    sep: { width: 1, height: 28, backgroundColor: C.border },

    columnWrapper: { paddingHorizontal: ph, gap: 0 },
    list: { paddingTop: 6, paddingBottom: 120 },
    emptyContainer: { flexGrow: 1, justifyContent: 'center' },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyIcon: {
      width: isTablet ? 96 : 80, height: isTablet ? 96 : 80,
      borderRadius: isTablet ? 48 : 40,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    },
    emptyText: { fontSize: isTablet ? 17 : 15, color: C.text2, fontWeight: '600' },
    emptySubText: { fontSize: isTablet ? 14 : 12, color: C.text3, marginTop: 6 },

    bottomRow: {
      position: 'absolute', bottom: 16, left: ph, right: ph,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    calBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: isTablet ? 20 : 16, paddingVertical: isTablet ? 13 : 11, borderRadius: 14,
    },
    calBtnText: { fontSize: isTablet ? 15 : 13, color: C.primary, fontWeight: '700' },
    bookmarkBtn: {
      width: isTablet ? 50 : 44, height: isTablet ? 50 : 44,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
      borderRadius: 14,
    },
    fab: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.primary,
      paddingHorizontal: isTablet ? 28 : 22, paddingVertical: isTablet ? 15 : 13,
      borderRadius: 16, marginLeft: 'auto',
      shadowColor: C.primary, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45, shadowRadius: 12, elevation: 8,
    },
    fabText: { fontSize: isTablet ? 16 : 14, fontWeight: '800', color: '#FFFFFF' },
  });
}

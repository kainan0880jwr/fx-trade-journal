import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTradeStore } from '../../src/store/tradeStore';
import { calcStats, calcMonthlyBreakdown } from '../../src/utils/statsCalc';
import PremiumGate from '../../src/components/PremiumGate';
import { useTheme } from '../../src/theme/useTheme';
import { useIsTablet } from '../../src/hooks/useIsTablet';
import type { ThemeColors } from '../../src/theme/colors';
import { t, tArr } from '../../src/i18n';
import type { Trade } from '../../src/types';
import { formatPF } from '../../src/utils/calendarMetrics';

export default function YearlyScreen() {
  const C = useTheme();
  const isTablet = useIsTablet();
  const styles = useMemo(() => makeStyles(C, isTablet), [C, isTablet]);
  const { loadTradesForYear } = useTradeStore();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadYear(year);
  }, [year]);

  const loadYear = async (y: number) => {
    setLoading(true);
    try {
      const ts = await loadTradesForYear(String(y));
      setTrades(ts);
    } finally {
      setLoading(false);
    }
  };

  const monthlyData = calcMonthlyBreakdown(trades, String(year));
  const yearStats = calcStats(trades);

  const maxPips = Math.max(...monthlyData.map(m => Math.abs(m.totalPips)), 1);

  return (
    <PremiumGate feature={t('tab_yearly')}>
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.yearSelector}>
        <TouchableOpacity onPress={() => setYear(y => y - 1)} style={styles.yearBtn}>
          <Ionicons name="chevron-back" size={22} color={C.primary} />
        </TouchableOpacity>
        <Text style={styles.yearLabel}>{year}{t('year_unit')}</Text>
        <TouchableOpacity onPress={() => setYear(y => y + 1)} style={styles.yearBtn}>
          <Ionicons name="chevron-forward" size={22} color={C.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{year}{t('year_unit')} {t('yearly_summary')}</Text>
            <View style={styles.row4}>
              <SumItem label={t('total_trades')} value={`${yearStats.totalTrades}${t('times_unit')}`} />
              <SumItem label={t('win_rate')} value={`${yearStats.winRate}%`} color={C.primary} />
              <SumItem label={t('total_pips')} value={`${yearStats.totalPips > 0 ? '+' : ''}${yearStats.totalPips}`} color={yearStats.totalPips >= 0 ? C.win : C.loss} />
              <SumItem label={t('pf')} value={formatPF(yearStats.profitFactor)} color={yearStats.profitFactor >= 1 ? C.win : C.loss} />
            </View>
          </View>

          <Text style={styles.sectionTitle}>{t('monthly_pips_chart')}</Text>
          <View style={styles.barChart}>
            {monthlyData.map((m, i) => {
              const h = maxPips > 0 ? Math.abs(m.totalPips) / maxPips * 100 : 0;
              const isPos = m.totalPips >= 0;
              return (
                <View key={m.month} style={styles.barCol}>
                  <Text style={[styles.barValue, { color: isPos ? C.win : C.loss }]}>
                    {m.totalPips !== 0 ? `${m.totalPips > 0 ? '+' : ''}${m.totalPips}` : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${h}%`, backgroundColor: isPos ? C.win : C.loss }]} />
                  </View>
                  <Text style={styles.barLabel}>{i + 1}</Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>{t('monthly_details')}</Text>
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.colH, { flex: 1.2 }]}>{t('col_month')}</Text>
              <Text style={styles.colH}>{t('col_trades')}</Text>
              <Text style={styles.colH}>{t('win_rate')}</Text>
              <Text style={styles.colH}>pips</Text>
              <Text style={styles.colH}>{t('pf')}</Text>
            </View>
            {monthlyData.map((m, i) => (
              <View key={m.month} style={[styles.tableRow, i < 11 && styles.rowBorder]}>
                <Text style={[styles.cell, { flex: 1.2 }]}>{tArr('month_labels')[i]}</Text>
                <Text style={[styles.cell, m.totalTrades === 0 && { color: C.text3 }]}>{m.totalTrades > 0 ? m.totalTrades : '-'}</Text>
                <Text style={[styles.cell, { color: m.totalTrades > 0 ? (m.winRate >= 50 ? C.win : C.loss) : C.text3 }]}>
                  {m.totalTrades > 0 ? `${m.winRate}%` : '-'}
                </Text>
                <Text style={[styles.cell, { color: m.totalTrades > 0 ? (m.totalPips >= 0 ? C.win : C.loss) : C.text3 }]}>
                  {m.totalTrades > 0 ? `${m.totalPips > 0 ? '+' : ''}${m.totalPips}` : '-'}
                </Text>
                <Text style={[styles.cell, { color: m.totalTrades > 0 ? (m.profitFactor >= 1 ? C.win : C.loss) : C.text3 }]}>
                  {m.totalTrades > 0 ? formatPF(m.profitFactor) : '-'}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
    </PremiumGate>
  );
}

function SumItem({ label, value, color }: { label: string; value: string; color?: string }) {
  const C = useTheme();
  const isTablet = useIsTablet();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: isTablet ? 12 : 10, color: C.text2, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: isTablet ? 18 : 15, fontWeight: '800', color: color ?? C.text }}>{value}</Text>
    </View>
  );
}

function makeStyles(C: ThemeColors, isTablet = false) {
  const ph = isTablet ? 20 : 16;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    yearSelector: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: isTablet ? 16 : 12, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    yearBtn: { padding: 10 },
    yearLabel: { fontSize: isTablet ? 22 : 18, fontWeight: '700', color: C.text, minWidth: 120, textAlign: 'center' },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: ph, paddingBottom: 40 },
    summaryCard: { backgroundColor: C.card, borderRadius: 14, padding: isTablet ? 20 : 16, marginBottom: 20, borderWidth: 1, borderColor: C.border },
    summaryTitle: { fontSize: isTablet ? 15 : 13, fontWeight: '600', color: C.text2, marginBottom: 14 },
    row4: { flexDirection: 'row', alignItems: 'center' },
    sectionTitle: { fontSize: isTablet ? 15 : 13, fontWeight: '700', color: C.text2, marginBottom: 12, marginTop: 4 },
    barChart: {
      flexDirection: 'row', backgroundColor: C.card, borderRadius: 14,
      padding: isTablet ? 20 : 16, marginBottom: 20, borderWidth: 1, borderColor: C.border,
      height: isTablet ? 220 : 160, alignItems: 'flex-end',
    },
    barCol: { flex: 1, alignItems: 'center', height: '100%' },
    barValue: { fontSize: isTablet ? 12 : 10, marginBottom: 2 },
    barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
    barFill: { width: '100%', borderRadius: 3, minHeight: 2 },
    barLabel: { fontSize: isTablet ? 12 : 10, color: C.text2, marginTop: 4 },
    tableCard: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    tableHeader: { flexDirection: 'row', paddingHorizontal: isTablet ? 16 : 12, paddingVertical: isTablet ? 14 : 10, borderBottomWidth: 1, borderBottomColor: C.border },
    colH: { flex: 1, fontSize: isTablet ? 13 : 11, fontWeight: '600', color: C.text3, textAlign: 'center' },
    tableRow: { flexDirection: 'row', paddingHorizontal: isTablet ? 16 : 12, paddingVertical: isTablet ? 14 : 11, alignItems: 'center' },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    cell: { flex: 1, fontSize: isTablet ? 14 : 12, fontWeight: '600', color: C.text2, textAlign: 'center' },
  });
}

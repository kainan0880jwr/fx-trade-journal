import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { useTradeStore } from '../../src/store/tradeStore';
import MonthSelector from '../../src/components/MonthSelector';
import { calcStats, calcDailyCumulativePips, calcRatingDistribution, calcMonthlyBreakdown } from '../../src/utils/statsCalc';
import { getRecordStreak } from '../../src/db/queries';
import { useSettingsStore } from '../../src/store/settingsStore';
import { generateInsights, type Insight } from '../../src/utils/insights';
import PremiumGate from '../../src/components/PremiumGate';
import ShareModal from '../../src/components/ShareModal';
import { usePurchaseStore } from '../../src/store/purchaseStore';
import { useTheme } from '../../src/theme/useTheme';
import { useIsTablet, useContentWidth } from '../../src/hooks/useIsTablet';
import type { ThemeColors } from '../../src/theme/colors';
import type { Trade } from '../../src/types';
import { t, tArr } from '../../src/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatPF } from '../../src/utils/calendarMetrics';

type Period = 'monthly' | 'yearly';

const SUB_TABS = () => [
  t('monthly_wl'), t('monthly_pips_tab'), t('monthly_stats'),
  t('monthly_reflection'), t('monthly_rating'), t('monthly_weekly'), t('monthly_insights'),
];
type SubTab = string;

export default function MonthlyScreen() {
  const C = useTheme();
  const isTablet = useIsTablet();
  const contentWidth = useContentWidth();
  const styles = useMemo(() => makeStyles(C, isTablet), [C, isTablet]);
  const { trades, currentMonth, setCurrentMonth, loadTradesByMonth } = useTradeStore();
  const { settings } = useSettingsStore();
  const isPremium = usePurchaseStore(s => s.isPremium);
  const [period, setPeriod] = useState<Period>('monthly');
  const [activeTab, setActiveTab] = useState<SubTab>(t('monthly_wl'));
  const [shareVisible, setShareVisible] = useState(false);
  const [recordStreak, setRecordStreak] = useState(0);
  const navigation = useNavigation();

  useEffect(() => {
    getRecordStreak().then(setRecordStreak).catch(() => setRecordStreak(0));
  }, []);

  useEffect(() => {
    if (period === 'yearly') { navigation.setOptions({ headerRight: undefined }); return; }
    navigation.setOptions({
      headerRight: trades.length > 0
        ? () => (
          <TouchableOpacity
            onPress={() => setShareVisible(true)}
            style={{ marginRight: 12, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}
          >
            <Ionicons name="share-social-outline" size={19} color={C.primary} />
          </TouchableOpacity>
        )
        : undefined,
    });
  }, [trades.length, period, C, navigation]);
  const { width: SW } = useWindowDimensions();
  const chartWidth = contentWidth - 32;

  useEffect(() => { loadTradesByMonth(currentMonth); }, [currentMonth, loadTradesByMonth]);

  const stats = useMemo(() => calcStats(trades), [trades]);
  const cumData = useMemo(() => calcDailyCumulativePips(trades, currentMonth), [trades, currentMonth]);
  const ratingDist = useMemo(() => calcRatingDistribution(trades), [trades]);
  const avgRating = useMemo(() =>
    trades.length > 0
      ? Math.round(trades.reduce((s, tr) => s + tr.selfRating, 0) / trades.length * 10) / 10
      : 0,
    [trades]
  );

  const pieData = useMemo(() => [
    { name: t('win_short'), population: stats.wins, color: C.win, legendFontColor: C.text, legendFontSize: 13 },
    { name: t('loss_short'), population: stats.losses, color: C.loss, legendFontColor: C.text, legendFontSize: 13 },
    { name: t('even_short'), population: stats.evens, color: C.even, legendFontColor: C.text, legendFontSize: 13 },
  ].filter(d => d.population > 0), [stats, C]);

  const lineLabels = useMemo(() => cumData.map(d => String(d.day)), [cumData]);
  const lineValues = useMemo(() => cumData.length > 0 ? cumData.map(d => d.cumPips) : [0], [cumData]);
  const lastPips = lineValues[lineValues.length - 1] ?? 0;

  const reflections = useMemo(() => trades.filter(tr => tr.reflection.trim().length > 0), [trades]);

  const chartCfg = {
    backgroundColor: C.card,
    backgroundGradientFrom: C.card,
    backgroundGradientTo: C.card,
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(79, 126, 247, ${opacity})`,
    labelColor: () => C.text2,
    propsForDots: { r: '4', strokeWidth: '2', stroke: C.primary },
  };

  if (period === 'yearly') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <PeriodToggle period={period} onChange={setPeriod} styles={styles} C={C} />
        <YearlyView />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <PeriodToggle period={period} onChange={setPeriod} styles={styles} C={C} />
      <MonthSelector month={currentMonth} onChange={setCurrentMonth} />
      <ShareModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        stats={stats}
        yearMonth={currentMonth}
        streak={recordStreak}
        isPremium={isPremium}
      />

      {(settings.monthlyPipsGoal > 0 || settings.monthlyWinRateGoal > 0) && (
        <View style={styles.goalBar}>
          {settings.monthlyPipsGoal > 0 && (
            <GoalGauge
              label={t('pips_goal')}
              current={stats.totalPips}
              goal={settings.monthlyPipsGoal}
              unit="pips"
            />
          )}
          {settings.monthlyWinRateGoal > 0 && (
            <GoalGauge
              label={t('win_rate_goal')}
              current={stats.winRate}
              goal={settings.monthlyWinRateGoal}
              unit="%"
            />
          )}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.subTabBar}
        contentContainerStyle={styles.subTabBarContent}
      >
        {SUB_TABS().map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.subTab, activeTab === tab && styles.subTabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.subTabLabel, activeTab === tab && styles.subTabLabelActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!isPremium && (activeTab === t('monthly_weekly') || activeTab === t('monthly_insights')) ? (
        <PremiumGate feature={activeTab}><View /></PremiumGate>
      ) : (
      <ScrollView contentContainerStyle={styles.scroll}>
        {trades.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={52} color={C.text3} />
            <Text style={styles.emptyText}>{t('empty_monthly')}</Text>
          </View>
        ) : (
          <>
            {activeTab === t('monthly_wl') && (
              <>
                <View style={styles.row3}>
                  <BigStat label={t('wins')} value={String(stats.wins)} color={C.win} />
                  <BigStat label={t('losses')} value={String(stats.losses)} color={C.loss} />
                  <BigStat label={t('draw')} value={String(stats.evens)} color={C.even} />
                </View>
                <View style={styles.winRateBox}>
                  <Text style={styles.winRateLabel}>{t('win_rate')}</Text>
                  <Text style={styles.winRateValue}>{stats.winRate}%</Text>
                  <ProgressBar value={stats.winRate} color={C.primary} />
                </View>
                {pieData.length > 0 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>{t('win_loss_dist')}</Text>
                    <PieChart
                      data={pieData}
                      width={chartWidth}
                      height={160}
                      chartConfig={chartCfg}
                      accessor="population"
                      backgroundColor="transparent"
                      paddingLeft="16"
                      absolute
                    />
                  </View>
                )}
              </>
            )}

            {activeTab === t('monthly_pips_tab') && (
              <>
                <View style={styles.bigNumCard}>
                  <Text style={styles.bigNumLabel}>{t('total_pips')}</Text>
                  <Text style={[styles.bigNum, { color: stats.totalPips >= 0 ? C.win : C.loss }]}>
                    {stats.totalPips > 0 ? '+' : ''}{stats.totalPips}
                  </Text>
                  {stats.totalProfitLoss !== 0 && (
                    <Text style={[styles.bigNumSub, { color: stats.totalProfitLoss >= 0 ? C.win : C.loss }]}>
                      {stats.totalProfitLoss > 0 ? '+' : ''}{stats.totalProfitLoss.toLocaleString()}円
                    </Text>
                  )}
                </View>
                {cumData.length > 1 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>{t('cum_pips_chart')}</Text>
                    <LineChart
                      data={{ labels: lineLabels, datasets: [{ data: lineValues }] }}
                      width={chartWidth}
                      height={200}
                      chartConfig={{
                        ...chartCfg,
                        color: (opacity = 1) =>
                          lastPips >= 0
                            ? `rgba(52, 211, 153, ${opacity})`
                            : `rgba(248, 113, 113, ${opacity})`,
                      }}
                      bezier
                      style={{ borderRadius: 12 }}
                      withDots={lineValues.length <= 10}
                      withInnerLines={false}
                    />
                  </View>
                )}
              </>
            )}

            {activeTab === t('monthly_stats') && (
              <View style={styles.statsTable}>
                <TableRow label={t('trade_count_times')} value={`${stats.totalTrades}${t('times_unit')}`} />
                <TableRow label={t('wins')} value={`${stats.wins}${t('times_unit')}`} color={C.win} />
                <TableRow label={t('losses')} value={`${stats.losses}${t('times_unit')}`} color={C.loss} />
                <TableRow label={t('evens')} value={`${stats.evens}${t('times_unit')}`} color={C.even} />
                <TableRow label={t('win_rate')} value={`${stats.winRate}%`} color={C.primary} />
                <TableRow label={t('profit_factor_long')} value={formatPF(stats.profitFactor)} />
                <TableRow label={t('total_pips')} value={`${stats.totalPips > 0 ? '+' : ''}${stats.totalPips}`} color={stats.totalPips >= 0 ? C.win : C.loss} />
                {stats.totalProfitLoss !== 0 && (
                  <TableRow label={t('total_pl_yen')} value={`${stats.totalProfitLoss > 0 ? '+' : ''}${stats.totalProfitLoss.toLocaleString()}¥`} color={stats.totalProfitLoss >= 0 ? C.win : C.loss} last />
                )}
              </View>
            )}

            {activeTab === t('monthly_reflection') && (
              <>
                <Text style={styles.sectionNote}>{t('reflection_with_count')}（{reflections.length}{t('count_unit')}）</Text>
                {reflections.length === 0 ? (
                  <Text style={styles.emptyText}>{t('no_reflection')}</Text>
                ) : (
                  reflections.map((tr) => (
                    <View key={tr.id} style={styles.reflectCard}>
                      <View style={styles.reflectHeader}>
                        <Text style={styles.reflectPair}>{tr.pair} {tr.direction === 'buy' ? 'BUY' : 'SELL'}</Text>
                        <Text style={[styles.reflectPips, { color: tr.result === 'win' ? C.win : tr.result === 'loss' ? C.loss : C.even }]}>
                          {tr.pips != null ? `${tr.pips > 0 ? '+' : ''}${tr.pips} pips` : '-'}
                        </Text>
                      </View>
                      <Text style={styles.reflectText}>{tr.reflection}</Text>
                      <Text style={styles.reflectDate}>{tr.date.slice(0, 16).replace('T', ' ')}</Text>
                    </View>
                  ))
                )}
              </>
            )}

            {activeTab === t('monthly_weekly') && (
              <WeeklyTab trades={trades} yearMonth={currentMonth} />
            )}

            {activeTab === t('monthly_insights') && (
              <InsightsTab trades={trades} pipsGoal={settings.monthlyPipsGoal} winRateGoal={settings.monthlyWinRateGoal} />
            )}

            {activeTab === t('monthly_rating') && (
              <>
                <View style={styles.bigNumCard}>
                  <Text style={styles.bigNumLabel}>{t('avg_rating')}</Text>
                  <View style={styles.starsRow}>
                    {[1,2,3,4,5].map(n => (
                      <Ionicons key={n} name="star" size={28} color={n <= Math.round(avgRating) ? C.yellow : C.text3} />
                    ))}
                  </View>
                  <Text style={styles.bigNum}>{avgRating} / 5</Text>
                </View>
                <View style={styles.statsTable}>
                  {[5,4,3,2,1].map(n => {
                    const cnt = ratingDist[n] ?? 0;
                    const pct = stats.totalTrades > 0 ? (cnt / stats.totalTrades) * 100 : 0;
                    return (
                      <View key={n} style={styles.ratingRow}>
                        <View style={styles.ratingStars}>
                          {[1,2,3,4,5].map(s => (
                            <Ionicons key={s} name="star" size={12} color={s <= n ? C.yellow : C.text3} />
                          ))}
                        </View>
                        <View style={styles.ratingBar}>
                          <View style={[styles.ratingFill, { width: `${pct}%`, backgroundColor: C.primary }]} />
                        </View>
                        <Text style={styles.ratingCount}>{cnt}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

function BigStat({ label, value, color }: { label: string; value: string; color: string }) {
  const C = useTheme();
  return (
    <View style={{
      flex: 1,
      backgroundColor: C.card, borderRadius: 14, padding: 16,
      alignItems: 'center', borderWidth: 1, borderColor: C.border,
    }}>
      <Text style={{ fontSize: 28, fontWeight: '900', color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  const C = useTheme();
  return (
    <View style={{ height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.min(value, 100)}%`, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

function GoalGauge({ label, current, goal, unit }: { label: string; current: number; goal: number; unit: string }) {
  const C = useTheme();
  const pct = goal > 0 ? Math.min(Math.max(current / goal * 100, 0), 100) : 0;
  const achieved = current >= goal;
  const color = achieved ? C.win : pct >= 60 ? C.yellow : C.primary;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Text style={{ fontSize: 11, color: C.text2 }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', flex: 1, color }}>
          {current > 0 ? '+' : ''}{current}{unit} / {goal}{unit}
        </Text>
        {achieved && <Ionicons name="checkmark-circle" size={16} color={C.win} />}
      </View>
      <View style={{ height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={{ fontSize: 10, color: C.text3, textAlign: 'right', marginTop: 2 }}>{Math.round(pct)}%</Text>
    </View>
  );
}

function WeeklyTab({ trades, yearMonth }: { trades: import('../../src/types').Trade[]; yearMonth: string }) {
  const C = useTheme();
  const styles = makeStyles(C);

  const WEEKS = [
    { label: 'Week 1', range: [1, 7] as [number, number] },
    { label: 'Week 2', range: [8, 14] as [number, number] },
    { label: 'Week 3', range: [15, 21] as [number, number] },
    { label: 'Week 4', range: [22, 31] as [number, number] },
  ];

  const weekStats = WEEKS.map(w => {
    const weekTrades = trades.filter(tr => {
      const d = new Date(tr.date).getDate();
      return d >= w.range[0] && d <= w.range[1];
    });
    const wins = weekTrades.filter(tr => tr.result === 'win').length;
    const losses = weekTrades.filter(tr => tr.result === 'loss').length;
    const totalPips = Math.round(weekTrades.reduce((s, tr) => s + (tr.pips ?? 0), 0) * 10) / 10;
    const winRate = weekTrades.length > 0 ? Math.round(wins / weekTrades.length * 1000) / 10 : 0;
    return { ...w, weekTrades: weekTrades.length, wins, losses, totalPips, winRate };
  }).filter(w => w.weekTrades > 0);

  if (weekStats.length === 0) return <Text style={styles.emptyText}>{t('empty_month')}</Text>;

  return (
    <>
      {weekStats.map((w, i) => (
        <View key={i} style={styles.weekCard}>
          <View style={styles.weekHeader}>
            <Text style={styles.weekLabel}>{w.label}</Text>
            <Text style={[styles.weekPips, { color: w.totalPips >= 0 ? C.win : C.loss }]}>
              {w.totalPips > 0 ? '+' : ''}{w.totalPips} pips
            </Text>
          </View>
          <View style={styles.weekGrid}>
            <WeekStat label={t('trade_count_times')} value={String(w.weekTrades)} />
            <WeekStat label={t('wins')}   value={String(w.wins)}  color={C.win} />
            <WeekStat label={t('losses')} value={String(w.losses)} color={C.loss} />
            <WeekStat label={t('win_rate')} value={`${w.winRate}%`}  color={C.primary} />
          </View>
          <View style={styles.weekProgBg}>
            <View style={[styles.weekProgFill, { width: `${w.winRate}%` }]} />
          </View>
        </View>
      ))}
    </>
  );
}

function WeekStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const C = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 10, color: C.text3, marginBottom: 2 }}>{label}</Text>
      <Text style={[{ fontSize: 15, fontWeight: '700', color: C.text }, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

function InsightsTab({ trades, pipsGoal, winRateGoal }: {
  trades: import('../../src/types').Trade[];
  pipsGoal: number;
  winRateGoal: number;
}) {
  const C = useTheme();
  const styles = makeStyles(C);
  const insights = generateInsights(trades, pipsGoal, winRateGoal);

  const INSIGHT_COLORS = {
    positive: C.win,
    negative: C.loss,
    neutral:  C.primary,
    tip:      C.yellow,
  } as const;

  if (insights.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="bulb-outline" size={52} color={C.text3} />
        <Text style={styles.emptyText}>{t('insights_min_trades')}</Text>
      </View>
    );
  }
  return (
    <>
      <Text style={styles.insightDisclaimer}>※ 以下はご自身のトレード記録に基づく統計情報です。投資助言ではありません。</Text>
      {insights.map(insight => (
        <View key={insight.id} style={[styles.insightCard, { borderLeftColor: INSIGHT_COLORS[insight.type] }]}>
          <View style={styles.insightHeader}>
            <Ionicons name={insight.icon as any} size={20} color={INSIGHT_COLORS[insight.type]} />
            <Text style={[styles.insightTitle, { color: INSIGHT_COLORS[insight.type] }]}>{insight.title}</Text>
          </View>
          <Text style={styles.insightBody}>{insight.body}</Text>
        </View>
      ))}
    </>
  );
}

function TableRow({ label, value, color, last }: { label: string; value: string; color?: string; last?: boolean }) {
  const C = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={[styles.tableRow, !last && styles.tableRowBorder]}>
      <Text style={styles.tableLabel}>{label}</Text>
      <Text style={[styles.tableValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

function PeriodToggle({ period, onChange, styles, C }: {
  period: Period;
  onChange: (p: Period) => void;
  styles: ReturnType<typeof makeStyles>;
  C: ThemeColors;
}) {
  return (
    <View style={styles.periodBar}>
      {(['monthly', 'yearly'] as Period[]).map(p => (
        <TouchableOpacity
          key={p}
          style={[styles.periodBtn, period === p && styles.periodBtnActive]}
          onPress={() => onChange(p)}
        >
          <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
            {p === 'monthly' ? t('period_monthly') : t('period_yearly')}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function YearlyView() {
  const C = useTheme();
  const isTablet = useIsTablet();
  const styles = useMemo(() => makeStyles(C, isTablet), [C, isTablet]);
  const { loadTradesForYear } = useTradeStore();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadYear(year); }, [year]);

  const loadYear = async (y: number) => {
    setLoading(true);
    try { setTrades(await loadTradesForYear(String(y))); }
    finally { setLoading(false); }
  };

  const monthlyData = calcMonthlyBreakdown(trades, String(year));
  const yearStats = calcStats(trades);
  const maxPips = Math.max(...monthlyData.map(m => Math.abs(m.totalPips)), 1);

  return (
    <PremiumGate feature={t('tab_yearly')}>
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
              <YearStat label={t('total_trades')} value={`${yearStats.totalTrades}${t('times_unit')}`} />
              <YearStat label={t('win_rate')} value={`${yearStats.winRate}%`} color={C.primary} />
              <YearStat label={t('total_pips')} value={`${yearStats.totalPips > 0 ? '+' : ''}${yearStats.totalPips}`} color={yearStats.totalPips >= 0 ? C.win : C.loss} />
              <YearStat label={t('pf')} value={formatPF(yearStats.profitFactor)} color={yearStats.profitFactor >= 1 ? C.win : C.loss} />
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
          <View style={styles.tableCardY}>
            <View style={styles.tableHeaderY}>
              <Text style={[styles.colH, { flex: 1.2 }]}>{t('col_month')}</Text>
              <Text style={styles.colH}>{t('col_trades')}</Text>
              <Text style={styles.colH}>{t('win_rate')}</Text>
              <Text style={styles.colH}>pips</Text>
              <Text style={styles.colH}>{t('pf')}</Text>
            </View>
            {monthlyData.map((m, i) => (
              <View key={m.month} style={[styles.tableRowY, i < 11 && styles.rowBorderY]}>
                <Text style={[styles.cellY, { flex: 1.2 }]}>{tArr('month_labels')[i]}</Text>
                <Text style={[styles.cellY, m.totalTrades === 0 && { color: C.text3 }]}>{m.totalTrades > 0 ? m.totalTrades : '-'}</Text>
                <Text style={[styles.cellY, { color: m.totalTrades > 0 ? (m.winRate >= 50 ? C.win : C.loss) : C.text3 }]}>
                  {m.totalTrades > 0 ? `${m.winRate}%` : '-'}
                </Text>
                <Text style={[styles.cellY, { color: m.totalTrades > 0 ? (m.totalPips >= 0 ? C.win : C.loss) : C.text3 }]}>
                  {m.totalTrades > 0 ? `${m.totalPips > 0 ? '+' : ''}${m.totalPips}` : '-'}
                </Text>
                <Text style={[styles.cellY, { color: m.totalTrades > 0 ? (m.profitFactor >= 1 ? C.win : C.loss) : C.text3 }]}>
                  {m.totalTrades > 0 ? formatPF(m.profitFactor) : '-'}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </PremiumGate>
  );
}

function YearStat({ label, value, color }: { label: string; value: string; color?: string }) {
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
    subTabBar: {
      backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    subTabBarContent: { flexDirection: 'row', alignItems: 'center' },
    subTab: { paddingHorizontal: isTablet ? 18 : 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    subTabActive: { borderBottomWidth: 2, borderBottomColor: C.primary },
    subTabLabel: { fontSize: isTablet ? 15 : 13, color: C.text, fontWeight: '500' },
    // fontWeight:'700'（太字）だと画数の多い漢字（「勝敗」等）が小さいサイズで潰れて見えるため、
    // 選択状態は色と下線のみで示し、太さは変えない
    subTabLabelActive: { color: C.primary },

    weekCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    weekLabel: { fontSize: 15, fontWeight: '800', color: C.text },
    weekPips: { fontSize: 18, fontWeight: '800' },
    weekGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    weekProgBg: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
    weekProgFill: { height: '100%', backgroundColor: C.primary, borderRadius: 2 },

    insightDisclaimer: { fontSize: 11, color: C.text3, marginBottom: 10, lineHeight: 16 },
    insightCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4 },
    insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    insightTitle: { fontSize: 14, fontWeight: '800' },
    insightBody: { fontSize: 13, color: C.text, lineHeight: 19 },

    scroll: { padding: ph, paddingBottom: 40 },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyText: { fontSize: 14, color: C.text2, marginTop: 14, textAlign: 'center' },

    row3: { flexDirection: 'row', gap: 12, marginBottom: 16 },

    winRateBox: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
    winRateLabel: { fontSize: 12, color: C.text2, marginBottom: 4 },
    winRateValue: { fontSize: isTablet ? 40 : 32, fontWeight: '900', color: C.primary, marginBottom: 8 },

    bigNumCard: { backgroundColor: C.card, borderRadius: 14, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border },
    bigNumLabel: { fontSize: 12, color: C.text2, marginBottom: 8 },
    bigNum: { fontSize: isTablet ? 52 : 40, fontWeight: '900', color: C.text },
    bigNumSub: { fontSize: isTablet ? 22 : 18, fontWeight: '600', marginTop: 4 },

    chartCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
    chartTitle: { fontSize: 13, fontWeight: '600', color: C.text2, marginBottom: 12 },

    statsTable: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 16 },
    tableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    tableRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    tableLabel: { fontSize: 14, color: C.text2 },
    tableValue: { fontSize: 15, fontWeight: '700', color: C.text },

    sectionNote: { fontSize: 12, color: C.text2, marginBottom: 12 },
    reflectCard: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
    reflectHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    reflectPair: { fontSize: 13, fontWeight: '600', color: C.text },
    reflectPips: { fontSize: 13, fontWeight: '700' },
    reflectText: { fontSize: 14, color: C.text, lineHeight: 20 },
    reflectDate: { fontSize: 11, color: C.text3, marginTop: 6 },

    starsRow: { flexDirection: 'row', gap: 4, marginBottom: 8 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    ratingStars: { flexDirection: 'row', width: 72, gap: 2 },
    ratingBar: { flex: 1, height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden', marginHorizontal: 12 },
    ratingFill: { height: '100%', borderRadius: 4 },
    ratingCount: { fontSize: 13, color: C.text2, width: 28, textAlign: 'right' },

    goalBar: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },

    // 期間トグル
    periodBar: {
      flexDirection: 'row', margin: 12, marginBottom: 0,
      backgroundColor: C.card, borderRadius: 12,
      borderWidth: 1, borderColor: C.border, padding: 4, gap: 4,
    },
    periodBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
    periodBtnActive: { backgroundColor: C.primary },
    periodBtnText: { fontSize: 13, fontWeight: '700', color: C.text2 },
    periodBtnTextActive: { color: '#FFF' },

    // 年間ビュー
    yearSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: isTablet ? 16 : 12, borderBottomWidth: 1, borderBottomColor: C.border },
    yearBtn: { padding: 10 },
    yearLabel: { fontSize: isTablet ? 22 : 18, fontWeight: '700', color: C.text, minWidth: 120, textAlign: 'center' },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    summaryCard: { backgroundColor: C.card, borderRadius: 14, padding: isTablet ? 20 : 16, marginBottom: 20, borderWidth: 1, borderColor: C.border },
    summaryTitle: { fontSize: isTablet ? 15 : 13, fontWeight: '600', color: C.text2, marginBottom: 14 },
    row4: { flexDirection: 'row', alignItems: 'center' },
    sectionTitle: { fontSize: isTablet ? 15 : 13, fontWeight: '700', color: C.text2, marginBottom: 12, marginTop: 4 },
    barChart: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: isTablet ? 20 : 16, marginBottom: 20, borderWidth: 1, borderColor: C.border, height: isTablet ? 220 : 160, alignItems: 'flex-end' },
    barCol: { flex: 1, alignItems: 'center', height: '100%' },
    barValue: { fontSize: isTablet ? 12 : 10, marginBottom: 2 },
    barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
    barFill: { width: '100%', borderRadius: 3, minHeight: 2 },
    barLabel: { fontSize: isTablet ? 12 : 10, color: C.text2, marginTop: 4 },
    tableCardY: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    tableHeaderY: { flexDirection: 'row', paddingHorizontal: isTablet ? 16 : 12, paddingVertical: isTablet ? 14 : 10, borderBottomWidth: 1, borderBottomColor: C.border },
    colH: { flex: 1, fontSize: isTablet ? 13 : 11, fontWeight: '600', color: C.text3, textAlign: 'center' },
    tableRowY: { flexDirection: 'row', paddingHorizontal: isTablet ? 16 : 12, paddingVertical: isTablet ? 14 : 11, alignItems: 'center' },
    rowBorderY: { borderBottomWidth: 1, borderBottomColor: C.border },
    cellY: { flex: 1, fontSize: isTablet ? 14 : 12, fontWeight: '600', color: C.text2, textAlign: 'center' },
  });
}

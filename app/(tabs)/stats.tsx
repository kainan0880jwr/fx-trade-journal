import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import Svg, { Circle } from 'react-native-svg';
import { useTradeStore } from '../../src/store/tradeStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import MonthSelector from '../../src/components/MonthSelector';
import {
  calcStats, calcStatsByPair, calcStatsByStyle,
  getBestTrade, getWorstTrade, calcCurrentStreak,
  calcTimeAnalysis, calcDayAnalysis, calcRRStats, calcTagStats,
  calcEquityCurve, calcMentalStats, calcRuleStats,
} from '../../src/utils/statsCalc';
import PremiumGate from '../../src/components/PremiumGate';
import { usePurchaseStore } from '../../src/store/purchaseStore';
import { useTheme } from '../../src/theme/useTheme';
import { useIsTablet, useContentWidth } from '../../src/hooks/useIsTablet';
import type { ThemeColors } from '../../src/theme/colors';
import { t } from '../../src/i18n';
import { formatPF } from '../../src/utils/calendarMetrics';

const STYLE_LABELS = () => ({
  scalping: t('card_style_scalp'), day: t('card_style_day'), swing: t('card_style_swing'), other: t('card_style_other'),
} as Record<string, string>);

const ANALYSIS_TABS = () => [
  t('analysis_performance'), t('analysis_time'), t('analysis_tags'),
  t('analysis_rr'), t('analysis_equity'), t('analysis_mental'),
];
type ATab = string;

export default function AnalysisScreen() {
  const C = useTheme();
  const isTablet = useIsTablet();
  const contentWidth = useContentWidth();
  const styles = useMemo(() => makeStyles(C, isTablet), [C, isTablet]);
  const { trades, currentMonth, setCurrentMonth, loadTradesByMonth, loadAllTrades } = useTradeStore();
  const { settings, tradeRules } = useSettingsStore();
  const isPremium = usePurchaseStore(s => s.isPremium);
  const [activeTab, setActiveTab] = useState<ATab>(t('analysis_performance'));
  const [allTrades, setAllTrades] = useState<typeof trades>([]);
  const [equityMode, setEquityMode] = useState<'month' | 'all'>('month');
  const { width: SW } = useWindowDimensions();
  const chartWidth = contentWidth - 56;

  useEffect(() => { loadTradesByMonth(currentMonth); }, [currentMonth, loadTradesByMonth]);
  useEffect(() => {
    if (activeTab === t('analysis_equity') && equityMode === 'all') {
      loadAllTrades().then(setAllTrades);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, equityMode]);

  const chartCfg = {
    backgroundColor: C.card, backgroundGradientFrom: C.card, backgroundGradientTo: C.card,
    decimalPlaces: 1, color: (op = 1) => `rgba(79,126,247,${op})`,
    labelColor: () => C.text2, propsForDots: { r: '3', strokeWidth: '1', stroke: C.primary },
  };

  const stats = useMemo(() => calcStats(trades), [trades]);
  const byPair = useMemo(() => calcStatsByPair(trades), [trades]);
  const byStyle = useMemo(() => calcStatsByStyle(trades), [trades]);
  const best = useMemo(() => getBestTrade(trades), [trades]);
  const worst = useMemo(() => getWorstTrade(trades), [trades]);
  const streak = useMemo(() => calcCurrentStreak(trades), [trades]);
  const timeData = useMemo(() => calcTimeAnalysis(trades), [trades]);
  const dayData = useMemo(() => calcDayAnalysis(trades), [trades]);
  const rrStats = useMemo(() => calcRRStats(trades), [trades]);
  const tagStats = useMemo(() => calcTagStats(trades), [trades]);
  const maxTimeCount = useMemo(() => Math.max(...timeData.map(d => d.total), 1), [timeData]);
  const maxDayCount = useMemo(() => Math.max(...dayData.map(d => d.total), 1), [dayData]);
  const maxTagCount = useMemo(() => Math.max(...tagStats.map(d => d.total), 1), [tagStats]);

  const equitySource = useMemo(() =>
    equityMode === 'all' ? allTrades : [...trades].sort((a, b) => a.date.localeCompare(b.date)),
    [equityMode, allTrades, trades]
  );
  const equityPoints = useMemo(() => calcEquityCurve(equitySource, settings.accountBalance), [equitySource, settings.accountBalance]);
  const equityHasPL = useMemo(() => equityPoints.some(p => p.balance !== settings.accountBalance), [equityPoints, settings.accountBalance]);

  const mentalStats = useMemo(() => calcMentalStats(trades), [trades]);
  const ruleStats = useMemo(() => calcRuleStats(trades, tradeRules), [trades, tradeRules]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <MonthSelector month={currentMonth} onChange={setCurrentMonth} />
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.subTabBar}
        contentContainerStyle={styles.subTabBarContent}
      >
        {ANALYSIS_TABS().map(tab => (
          <TouchableOpacity key={tab}
            style={[styles.subTab, activeTab === tab && styles.subTabActive]}
            onPress={() => setActiveTab(tab)}>
            <Text style={[styles.subTabLabel, activeTab === tab && styles.subTabLabelActive]} numberOfLines={1}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!isPremium && activeTab !== t('analysis_performance') ? (
        <PremiumGate feature={activeTab}><View /></PremiumGate>
      ) : (
      <ScrollView contentContainerStyle={styles.scroll}>
        {trades.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="analytics-outline" size={52} color={C.text3} />
            <Text style={styles.emptyText}>{t('empty_monthly')}</Text>
          </View>
        ) : (
          <>
            {activeTab === t('analysis_performance') && (
              <>
                <View style={styles.streakCard}>
                  <Ionicons name={streak.type === 'win' ? 'trending-up' : streak.type === 'loss' ? 'trending-down' : 'remove'} size={28}
                    color={streak.type === 'win' ? C.win : streak.type === 'loss' ? C.loss : C.text3} />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.streakLabel}>{t('streak_label')}</Text>
                    <Text style={[styles.streakValue, { color: streak.type === 'win' ? C.win : streak.type === 'loss' ? C.loss : C.text2 }]}>
                      {streak.type === 'none' ? '-' : streak.type === 'win' ? `${streak.count}${t('streak_win_sfx')}` : `${streak.count}${t('streak_loss_sfx')}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.donutRow}>
                  <WinRateDonut winRate={stats.winRate} wins={stats.wins} losses={stats.losses} />
                  <View style={styles.donutStats}>
                    <DonutStat label={t('pf')} value={formatPF(stats.profitFactor)} color={C.primary} />
                    <DonutStat label={t('total_pips')} value={`${stats.totalPips > 0 ? '+' : ''}${stats.totalPips}`} color={stats.totalPips >= 0 ? C.win : C.loss} />
                    <DonutStat label={t('trade_count')} value={`${stats.totalTrades}`} />
                  </View>
                </View>

                <Text style={styles.sectionTitle}>{t('best_worst')}</Text>
                <View style={styles.row2}>
                  <View style={[styles.extremeCard, { borderColor: C.win }]}>
                    <Text style={styles.extremeLabel}>{t('best_label')}</Text>
                    <Text style={[styles.extremePips, { color: C.win }]}>
                      {best?.pips != null ? `${best.pips > 0 ? '+' : ''}${best.pips} pips` : '-'}
                    </Text>
                    {best && <Text style={styles.extremePair}>{best.pair}</Text>}
                  </View>
                  {/* ワーストがプラス値（全勝時など）の場合は赤にしない */}
                  <View style={[styles.extremeCard, { borderColor: (worst?.pips ?? 0) < 0 ? C.loss : C.border }]}>
                    <Text style={styles.extremeLabel}>{t('worst_label')}</Text>
                    <Text style={[styles.extremePips, { color: (worst?.pips ?? 0) < 0 ? C.loss : C.text2 }]}>
                      {worst?.pips != null ? `${worst.pips > 0 ? '+' : ''}${worst.pips} pips` : '-'}
                    </Text>
                    {worst && <Text style={styles.extremePair}>{worst.pair}</Text>}
                  </View>
                </View>

                {byPair.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>{t('by_pair')}</Text>
                    <View style={styles.tableCard}>
                      <TableHeader cols={[t('col_pair'), t('col_count_h'), t('win_rate'), t('col_avg_pips')]} widths={[2,1,1,1]} />
                      {byPair.map((item, i) => (
                        <View key={item.pair} style={[styles.tableRow, i < byPair.length - 1 && styles.rowBorder]}>
                          <Text style={[styles.cell, { flex: 2, color: C.text }]}>{item.pair}</Text>
                          <Text style={styles.cell}>{item.totalTrades}</Text>
                          <Text style={[styles.cell, { color: item.winRate >= 50 ? C.win : C.loss }]}>{item.winRate}%</Text>
                          <Text style={[styles.cell, { color: item.avgPips >= 0 ? C.win : C.loss }]}>{item.avgPips > 0 ? '+' : ''}{item.avgPips}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {byStyle.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>{t('by_style')}</Text>
                    <View style={styles.tableCard}>
                      <TableHeader cols={[t('col_style'), t('col_count_h'), t('win_rate'), t('col_avg_pips')]} widths={[2,1,1,1]} />
                      {byStyle.map((item, i) => (
                        <View key={item.style} style={[styles.tableRow, i < byStyle.length - 1 && styles.rowBorder]}>
                          <Text style={[styles.cell, { flex: 2, color: C.text }]}>{STYLE_LABELS()[item.style] ?? item.style}</Text>
                          <Text style={styles.cell}>{item.totalTrades}</Text>
                          <Text style={[styles.cell, { color: item.winRate >= 50 ? C.win : C.loss }]}>{item.winRate}%</Text>
                          <Text style={[styles.cell, { color: item.avgPips >= 0 ? C.win : C.loss }]}>{item.avgPips > 0 ? '+' : ''}{item.avgPips}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {activeTab === t('analysis_time') && (
              <>
                {timeData.length === 0 ? (
                  <Text style={styles.emptyText}>{t('no_time_trades')}</Text>
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>{t('time_analysis_title')}</Text>
                    <View style={styles.tableCard}>
                      <TableHeader cols={[t('col_time'), t('col_count_h'), t('win_rate'), t('col_avg_pips')]} widths={[1.5,1,1,1]} />
                      {timeData.map((item, i) => (
                        <View key={item.hour} style={[styles.tableRow, i < timeData.length - 1 && styles.rowBorder]}>
                          <View style={[styles.cell, { flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                            <View style={[styles.heatBar, { width: Math.max(4, item.total / maxTimeCount * 48), backgroundColor: C.primary + 'AA' }]} />
                            <Text style={{ fontSize: 13, color: C.text }}>{item.label}</Text>
                          </View>
                          <Text style={styles.cell}>{item.total}</Text>
                          <Text style={[styles.cell, { color: item.winRate >= 50 ? C.win : C.loss }]}>{item.winRate}%</Text>
                          <Text style={[styles.cell, { color: item.avgPips >= 0 ? C.win : C.loss }]}>{item.avgPips > 0 ? '+' : ''}{item.avgPips}</Text>
                        </View>
                      ))}
                    </View>

                    <Text style={styles.sectionTitle}>{t('day_analysis_title')}</Text>
                    <View style={styles.tableCard}>
                      <TableHeader cols={[t('col_day'), t('col_count_h'), t('win_rate'), t('col_avg_pips')]} widths={[1.5,1,1,1]} />
                      {dayData.map((item, i) => (
                        <View key={item.day} style={[styles.tableRow, i < dayData.length - 1 && styles.rowBorder]}>
                          <View style={[styles.cell, { flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                            <View style={[styles.heatBar, { width: Math.max(4, item.total / maxDayCount * 48), backgroundColor: C.purple + 'AA' }]} />
                            <Text style={{ fontSize: 13, color: C.text }}>{item.label}</Text>
                          </View>
                          <Text style={styles.cell}>{item.total}</Text>
                          <Text style={[styles.cell, { color: item.winRate >= 50 ? C.win : C.loss }]}>{item.winRate}%</Text>
                          <Text style={[styles.cell, { color: item.avgPips >= 0 ? C.win : C.loss }]}>{item.avgPips > 0 ? '+' : ''}{item.avgPips}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {activeTab === t('analysis_tags') && (
              <>
                {tagStats.length === 0 ? (
                  <Text style={styles.emptyText}>{t('no_tag_trades')}</Text>
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>{t('tag_analysis_perf')}</Text>
                    <View style={styles.tableCard}>
                      <TableHeader cols={[t('col_tag'), t('col_count_h'), t('win_rate'), t('col_avg_pips')]} widths={[2,1,1,1]} />
                      {tagStats.map((item, i) => (
                        <View key={item.tag} style={[styles.tableRow, i < tagStats.length - 1 && styles.rowBorder]}>
                          <View style={[styles.cell, { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                            <View style={[styles.heatBar, { width: Math.max(4, item.total / maxTagCount * 40), backgroundColor: C.purple + 'AA' }]} />
                            <Text style={{ fontSize: 12, color: C.text }} numberOfLines={1}>{item.tag}</Text>
                          </View>
                          <Text style={styles.cell}>{item.total}</Text>
                          <Text style={[styles.cell, { color: item.winRate >= 50 ? C.win : C.loss }]}>{item.winRate}%</Text>
                          <Text style={[styles.cell, { color: item.avgPips >= 0 ? C.win : C.loss }]}>{item.avgPips > 0 ? '+' : ''}{item.avgPips}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {activeTab === t('analysis_rr') && (
              <>
                <View style={styles.rrSummary}>
                  <View style={styles.rrItem}>
                    <Text style={styles.rrLabel}>{t('rr_recorded')}</Text>
                    <Text style={styles.rrValue}>{rrStats.tradesWithRR}{t('count_unit')}</Text>
                  </View>
                  <View style={[styles.rrItem, { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <Text style={styles.rrLabel}>{t('rr_plan_avg')}</Text>
                    <Text style={[styles.rrValue, { color: C.primary }]}>
                      {rrStats.tradesWithRR > 0 ? `1:${rrStats.avgPlannedRR}` : '-'}
                    </Text>
                  </View>
                  <View style={[styles.rrItem, { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <Text style={styles.rrLabel}>{t('rr_actual_avg')}</Text>
                    <Text style={[styles.rrValue, { color: rrStats.avgActualRR >= 1 ? C.win : C.loss }]}>
                      {rrStats.avgActualRR !== 0 ? `1:${Math.abs(rrStats.avgActualRR)}` : '-'}
                    </Text>
                  </View>
                </View>

                {rrStats.tradesWithRR > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>{t('rr_list_title')}</Text>
                    <View style={styles.tableCard}>
                      <TableHeader cols={[t('col_pair'), t('col_rr'), 'pips', t('col_result')]} widths={[1.5,1,1,1]} />
                      {trades.filter(tr => tr.plannedRR != null).map((tr, i, arr) => (
                        <View key={tr.id} style={[styles.tableRow, i < arr.length - 1 && styles.rowBorder]}>
                          <Text style={[styles.cell, { flex: 1.5, color: C.text }]}>{tr.pair}</Text>
                          <Text style={[styles.cell, { color: C.primary }]}>1:{tr.plannedRR}</Text>
                          <Text style={[styles.cell, { color: (tr.pips ?? 0) >= 0 ? C.win : C.loss }]}>
                            {tr.pips != null ? `${tr.pips > 0 ? '+' : ''}${tr.pips}` : '-'}
                          </Text>
                          <Text style={[styles.cell, { color: tr.result === 'win' ? C.win : tr.result === 'loss' ? C.loss : C.even }]}>
                            {tr.result === 'win' ? t('win_short') : tr.result === 'loss' ? t('loss_short') : t('even_short')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {rrStats.tradesWithRR === 0 && (
                  <View style={styles.emptyHint}>
                    <Ionicons name="information-circle-outline" size={36} color={C.text3} />
                    <Text style={styles.emptyText}>{t('no_rr_hint')}</Text>
                  </View>
                )}
              </>
            )}

            {activeTab === t('analysis_equity') && (
              <>
                <View style={styles.segRow}>
                  {(['month', 'all'] as const).map(m => (
                    <TouchableOpacity key={m}
                      style={[styles.seg, equityMode === m && styles.segActive]}
                      onPress={() => setEquityMode(m)}>
                      <Text style={[styles.segLabel, equityMode === m && styles.segLabelActive]}>
                        {m === 'month' ? t('equity_month') : t('equity_all')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {equityPoints.length === 0 ? (
                  <View style={styles.emptyHint}>
                    <Ionicons name="trending-up-outline" size={36} color={C.text3} />
                    <Text style={styles.emptyText}>{t('no_data_trades')}</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>{t('cum_pips_chart')}</Text>
                    <View style={styles.chartCard}>
                      <LineChart
                        data={{
                          labels: equityPoints.length <= 10
                            ? equityPoints.map(p => p.label)
                            : equityPoints.filter((_, i) => i % Math.ceil(equityPoints.length / 8) === 0).map(p => p.label),
                          datasets: [{ data: equityPoints.map(p => p.cumPips) }],
                        }}
                        width={chartWidth}
                        height={180}
                        chartConfig={chartCfg}
                        bezier
                        style={{ borderRadius: 10 }}
                        withInnerLines={false}
                      />
                    </View>

                    {equityHasPL && settings.accountBalance > 0 && (
                      <>
                        <Text style={styles.sectionTitle}>{t('account_balance_chart')}</Text>
                        <View style={styles.chartCard}>
                          <LineChart
                            data={{
                              labels: equityPoints.length <= 10
                                ? equityPoints.map(p => p.label)
                                : equityPoints.filter((_, i) => i % Math.ceil(equityPoints.length / 8) === 0).map(p => p.label),
                              datasets: [{ data: equityPoints.map(p => p.balance) }],
                            }}
                            width={chartWidth}
                            height={180}
                            chartConfig={{ ...chartCfg, color: (op = 1) => `rgba(52,211,153,${op})` }}
                            bezier
                            style={{ borderRadius: 10 }}
                            withInnerLines={false}
                            formatYLabel={v => `${Math.round(Number(v) / 1000)}k`}
                          />
                        </View>
                      </>
                    )}

                    <View style={styles.equitySummary}>
                      <EqItem label={t('worst_label')}
                        value={`${Math.min(...equityPoints.map(p => p.cumPips)) > 0 ? '+' : ''}${Math.min(...equityPoints.map(p => p.cumPips))} pips`}
                        color={C.loss}
                      />
                      <EqItem
                        label={t('current_label')}
                        value={`${(equityPoints.at(-1)?.cumPips ?? 0) > 0 ? '+' : ''}${equityPoints.at(-1)?.cumPips ?? 0} pips`}
                        color={(equityPoints.at(-1)?.cumPips ?? 0) >= 0 ? C.win : C.loss}
                      />
                      <EqItem label={t('trade_count')} value={`${equityPoints.length}${t('count_unit')}`} />
                    </View>
                  </>
                )}
              </>
            )}

            {activeTab === t('analysis_mental') && (
              <>
                {mentalStats === null ? (
                  <View style={styles.emptyHint}>
                    <Ionicons name="heart-outline" size={36} color={C.text3} />
                    <Text style={styles.emptyText}>{t('no_mental_hint')}</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>{t('mental_vs_winrate')}（{mentalStats.count}{t('count_unit')}）</Text>
                    <View style={styles.tableCard}>
                      <View style={[styles.tableRow, { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                        <Text style={[styles.colH, { flex: 1.2, textAlign: 'left' }]}>{t('mental_header_metric')}</Text>
                        <Text style={[styles.colH, { flex: 0.8 }]}>{t('mental_header_avg')}</Text>
                        <Text style={[styles.colH, { flex: 1 }]}>{t('mental_header_high_wr')}</Text>
                        <Text style={[styles.colH, { flex: 1 }]}>{t('mental_header_low_wr')}</Text>
                      </View>
                      <MentalRow label={t('mental_focus')} avg={mentalStats.focus.avg} high={mentalStats.focus.high} low={mentalStats.focus.low} positiveHigh />
                      <MentalRow label={t('mental_calm')} avg={mentalStats.calm.avg} high={mentalStats.calm.high} low={mentalStats.calm.low} positiveHigh />
                      <MentalRow label={t('mental_fear')} avg={mentalStats.fear.avg} high={mentalStats.fear.high} low={mentalStats.fear.low} positiveHigh={false} last />
                    </View>
                    <Text style={styles.sectionNote}>{t('mental_note_text')}</Text>
                  </>
                )}

                {ruleStats.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>{t('rule_vs_winrate')}</Text>
                    <View style={styles.tableCard}>
                      {ruleStats.map((r, i) => (
                        <View key={r.rule} style={[styles.tableRow, i < ruleStats.length - 1 && styles.rowBorder]}>
                          <Text style={[styles.cell, { flex: 2.5, color: C.text, fontSize: 11, textAlign: 'left' }]} numberOfLines={1}>{r.rule}</Text>
                          <View style={[styles.cell, { flex: 1, alignItems: 'center' }]}>
                            <Text style={{ fontSize: 10, color: C.text3 }}>{t('rule_followed')}{r.followedCount}{t('count_unit')}</Text>
                            <Text style={[{ fontSize: 12, fontWeight: '700' }, { color: (r.followedWinRate ?? 0) >= 50 ? C.win : C.loss }]}>
                              {r.followedWinRate != null ? `${r.followedWinRate}%` : '-'}
                            </Text>
                          </View>
                          <View style={[styles.cell, { flex: 1, alignItems: 'center' }]}>
                            <Text style={{ fontSize: 10, color: C.text3 }}>{t('rule_not_followed')}</Text>
                            <Text style={[{ fontSize: 12, fontWeight: '700' }, { color: (r.notFollowedWinRate ?? 0) >= 50 ? C.win : C.loss }]}>
                              {r.notFollowedWinRate != null ? `${r.notFollowedWinRate}%` : '-'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

function WinRateDonut({ winRate, wins, losses }: { winRate: number; wins: number; losses: number }) {
  const C = useTheme();
  const SIZE = 136;
  const CX = SIZE / 2;
  const R = 50;
  const STROKE = 13;
  const circumference = 2 * Math.PI * R;
  const filled = (winRate / 100) * circumference;
  const total = wins + losses;
  const trackColor = total === 0 ? C.border : C.lossBg;
  const fillColor = total === 0 ? C.border : C.win;

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
        {/* トラック（背景リング） */}
        <Circle cx={CX} cy={CX} r={R} fill="none" stroke={trackColor} strokeWidth={STROKE} opacity={0.3} />
        {/* 勝率の塗り */}
        {winRate > 0 && (
          winRate >= 100 ? (
            <Circle cx={CX} cy={CX} r={R} fill="none" stroke={fillColor} strokeWidth={STROKE} />
          ) : (
            <Circle
              cx={CX} cy={CX} r={R}
              fill="none"
              stroke={fillColor}
              strokeWidth={STROKE}
              strokeDasharray={`${filled} ${circumference}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${CX} ${CX})`}
            />
          )
        )}
      </Svg>
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: C.text }}>{winRate}%</Text>
        <Text style={{ fontSize: 10, color: C.text2 }}>{t('win_rate')}</Text>
      </View>
    </View>
  );
}

function DonutStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const C = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 10, color: C.text3, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: color ?? C.text }}>{value}</Text>
    </View>
  );
}

function EqItem({ label, value, color }: { label: string; value: string; color?: string }) {
  const C = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, color: C.text2, marginBottom: 4 }}>{label}</Text>
      <Text style={[{ fontSize: 15, fontWeight: '800', color: C.text }, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

function MentalRow({ label, avg, high, low, positiveHigh, last }: {
  label: string; avg: number; high: number | null; low: number | null; positiveHigh: boolean; last?: boolean;
}) {
  const C = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={[styles.tableRow, !last && styles.rowBorder]}>
      <Text style={[styles.cell, { flex: 1.2, color: C.text, textAlign: 'left' }]}>{label}</Text>
      <Text style={[styles.cell, { flex: 0.8 }]}>{avg}</Text>
      <Text style={[styles.cell, { flex: 1, color: high == null ? C.text2 : (positiveHigh ? (high >= 50 ? C.win : C.loss) : (high >= 50 ? C.loss : C.win)) }]}>
        {high != null ? `${high}%` : '-'}
      </Text>
      <Text style={[styles.cell, { flex: 1, color: low == null ? C.text2 : (positiveHigh ? (low >= 50 ? C.win : C.loss) : (low >= 50 ? C.loss : C.win)) }]}>
        {low != null ? `${low}%` : '-'}
      </Text>
    </View>
  );
}

function TableHeader({ cols, widths }: { cols: string[]; widths: number[] }) {
  const C = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={[styles.tableRow, { borderBottomWidth: 1, borderBottomColor: C.border }]}>
      {cols.map((c, i) => (
        <Text key={c} style={[styles.colH, { flex: widths[i] ?? 1 }]}>{c}</Text>
      ))}
    </View>
  );
}

function makeStyles(C: ThemeColors, isTablet = false) {
  const ph = isTablet ? 20 : 16;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    subTabBar: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: isTablet ? 52 : 44 },
    subTabBarContent: { flexDirection: 'row', alignItems: 'center' },
    subTab: { paddingHorizontal: isTablet ? 20 : 16, paddingVertical: 12, alignItems: 'center' },
    subTabActive: { borderBottomWidth: 2, borderBottomColor: C.primary },
    subTabLabel: { fontSize: isTablet ? 14 : 12, color: C.text2 },
    subTabLabelActive: { color: C.primary, fontWeight: '700' },
    scroll: { padding: ph, paddingBottom: 40 },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyHint: { alignItems: 'center', paddingTop: 40, gap: 12 },
    emptyText: { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 22 },
    donutRow: {
      flexDirection: 'row', alignItems: 'center', gap: 20,
      backgroundColor: C.card, borderRadius: 14, padding: 16,
      marginBottom: 16, borderWidth: 1, borderColor: C.border,
    },
    donutStats: { flex: 1, justifyContent: 'center' },
    streakCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
    streakLabel: { fontSize: 12, color: C.text2 },
    streakValue: { fontSize: isTablet ? 28 : 22, fontWeight: '800', marginTop: 2 },
    sectionTitle: { fontSize: isTablet ? 15 : 13, fontWeight: '700', color: C.text2, marginBottom: 10, marginTop: 4 },
    row2: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    extremeCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: isTablet ? 20 : 16, alignItems: 'center', borderWidth: 1.5 },
    extremeLabel: { fontSize: isTablet ? 13 : 12, color: C.text2, marginBottom: 6 },
    extremePips: { fontSize: isTablet ? 26 : 20, fontWeight: '800' },
    extremePair: { fontSize: isTablet ? 13 : 12, color: C.text2, marginTop: 4 },
    tableCard: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 16 },
    tableRow: { flexDirection: 'row', paddingHorizontal: isTablet ? 18 : 14, paddingVertical: isTablet ? 14 : 12, alignItems: 'center' },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    colH: { flex: 1, fontSize: isTablet ? 13 : 11, fontWeight: '600', color: C.text3, textAlign: 'center' },
    cell: { flex: 1, fontSize: isTablet ? 13 : 12, fontWeight: '600', color: C.text2, textAlign: 'center' },
    heatBar: { height: 8, borderRadius: 4 },
    rrSummary: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 16 },
    rrItem: { paddingHorizontal: 16, paddingVertical: 16 },
    rrLabel: { fontSize: 12, color: C.text2, marginBottom: 4 },
    rrValue: { fontSize: isTablet ? 32 : 26, fontWeight: '900', color: C.text },
    segRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    seg: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', backgroundColor: C.card },
    segActive: { borderColor: C.primary, backgroundColor: C.cardAlt },
    segLabel: { fontSize: 13, color: C.text2 },
    segLabelActive: { color: C.primary, fontWeight: '700' },
    chartCard: { backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
    equitySummary: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
    sectionNote: { fontSize: 11, color: C.text3, marginBottom: 12, lineHeight: 16 },
  });
}

import React, { useMemo, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import type { Trade } from '../types';
import { t, tArr, lang } from '../i18n';
import {
  METRICS, CalMetric, buildDayMap, getDayValue, getDayBg, getDayValueColor,
  calcMonthPF, formatPF,
} from '../utils/calendarMetrics';

const { Calendar: RNCalendar, LocaleConfig } = require('react-native-calendars');

LocaleConfig.locales[lang] = {
  monthNames: tArr('month_names'),
  monthNamesShort: tArr('month_names'),
  dayNames: tArr('day_labels'),
  dayNamesShort: tArr('day_labels'),
};
LocaleConfig.defaultLocale = lang;

interface Props {
  visible: boolean;
  onClose: () => void;
  trades: Trade[];
  onSelectDate?: (date: string) => void;
}

export default function CalendarModal({ visible, onClose, trades, onSelectDate }: Props) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [selectedDate, setSelectedDate] = useState('');
  const [metric, setMetric] = useState<CalMetric>('pips');

  if (Platform.OS !== 'ios') return null;

  const dayMap = useMemo(() => buildDayMap(trades), [trades]);

  const totalPips = Math.round(trades.reduce((sum, tr) => sum + (tr.pips ?? 0), 0) * 10) / 10;
  const totalPL = Math.round(trades.reduce((sum, tr) => sum + (tr.profitLoss ?? 0), 0));
  const wins = trades.filter(tr => tr.result === 'win').length;
  const losses = trades.filter(tr => tr.result === 'loss').length;
  const winRate = trades.length > 0 ? Math.round(wins / trades.length * 100) : 0;
  const hasPL = trades.some(tr => tr.profitLoss != null);
  const profitFactor = useMemo(() => calcMonthPF(trades), [trades]);

  const dayTrades = selectedDate
    ? trades.filter(tr => tr.date.slice(0, 10) === selectedDate)
    : [];

  const handleDayPress = (date: string) => {
    setSelectedDate(prev => prev === date ? '' : date);
    onSelectDate?.(date);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>{t('calendar_btn')}</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* サマリーグリッド */}
          <View style={s.summaryGrid}>
            <SCard label={t('cal_trades')} value={`${trades.length}${t('count_unit')}`} C={C} />
            <SCard label={t('cal_wl')} value={`${wins}${t('win_short')} ${losses}${t('loss_short')}`} C={C} />
            <SCard
              label={t('win_rate')} value={`${winRate}%`} C={C}
              color={trades.length === 0 ? C.text : winRate >= 50 ? C.win : C.loss}
            />
            <SCard
              label={t('cal_profit_factor')} value={formatPF(profitFactor)} C={C}
              color={profitFactor === 0 ? C.text2 : profitFactor >= 1 ? C.win : C.loss}
            />
            <SCard
              label={t('total_pips')} C={C}
              value={totalPips === 0 && trades.length === 0 ? '-' : `${totalPips >= 0 ? '+' : ''}${totalPips}`}
              color={totalPips >= 0 ? C.win : C.loss}
            />
            {hasPL && (
              <SCard
                label={t('cal_total_pl')} C={C}
                value={`${totalPL >= 0 ? '+' : ''}${totalPL.toLocaleString()}¥`}
                color={totalPL >= 0 ? C.win : C.loss}
              />
            )}
          </View>

          {/* メトリクス切り替えバー */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.metricBar}
            contentContainerStyle={s.metricBarContent}
          >
            {METRICS.map(m => (
              <TouchableOpacity
                key={m.key}
                onPress={() => setMetric(m.key)}
                style={[
                  s.metricChip,
                  metric === m.key && { backgroundColor: C.primary, borderColor: C.primary },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[s.metricChipLabel, { color: metric === m.key ? '#fff' : C.text2 }]}>
                  {t(m.labelKey as any)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* カレンダー */}
          <View style={s.calWrap}>
            <RNCalendar
              onDayPress={(day: { dateString: string }) => handleDayPress(day.dateString)}
              dayComponent={({ date, state }: { date: any; state: string }) => {
                if (!date) return null;
                const ds = dayMap[date.dateString];
                const isSelected = selectedDate === date.dateString;
                const isDisabled = state === 'disabled';

                let bg = 'transparent';
                if (ds) bg = getDayBg(ds, metric, C);
                if (isSelected) bg = C.primary + '45';

                return (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleDayPress(date.dateString)}
                    style={[
                      s.dayCell,
                      { backgroundColor: bg, borderColor: isSelected ? C.primary : 'transparent' },
                    ]}
                  >
                    <Text style={[s.dayNum, { color: isDisabled ? C.text3 : C.text }]}>
                      {date.day}
                    </Text>
                    {ds ? (
                      <Text
                        style={[s.dayValue, { color: getDayValueColor(ds, metric, C) }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {getDayValue(ds, metric)}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              theme={{
                calendarBackground: C.card,
                backgroundColor: C.card,
                textSectionTitleColor: C.text2,
                dayTextColor: C.text,
                todayTextColor: C.primary,
                monthTextColor: C.text,
                arrowColor: C.primary,
                textDayHeaderFontSize: 11,
                textDayFontSize: 13,
                textMonthFontSize: 15,
                textMonthFontWeight: '700' as const,
              }}
            />
          </View>

          {/* 凡例 */}
          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: C.win + '50', borderColor: C.win }]} />
              <Text style={s.legendLabel}>{t('cal_plus_day')}</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: C.loss + '50', borderColor: C.loss }]} />
              <Text style={s.legendLabel}>{t('cal_minus_day')}</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: C.border + '80', borderColor: C.border }]} />
              <Text style={s.legendLabel}>{t('cal_zero_day')}</Text>
            </View>
          </View>

          {/* 日別詳細 */}
          {selectedDate && (
            <View style={s.dayDetail}>
              <Text style={s.detailTitle}>{selectedDate.replace(/-/g, '/')}</Text>
              {dayTrades.length === 0 ? (
                <Text style={s.detailEmpty}>{t('cal_no_trades')}</Text>
              ) : (
                <>
                  {dayTrades.map(tr => (
                    <View key={tr.id} style={s.tradeRow}>
                      <View style={[s.dirDot, { backgroundColor: tr.direction === 'buy' ? C.buy : C.sell }]} />
                      <Text style={s.tradePair}>{tr.pair}</Text>
                      <Text style={s.tradeDir}>{tr.direction === 'buy' ? t('buy') : t('sell')}</Text>
                      <Text style={[s.tradePips, { color: (tr.pips ?? 0) >= 0 ? C.win : C.loss }]}>
                        {tr.pips != null ? `${tr.pips > 0 ? '+' : ''}${tr.pips} pips` : '-'}
                      </Text>
                      {tr.profitLoss != null && (
                        <Text style={[s.tradePL, { color: tr.profitLoss >= 0 ? C.win : C.loss }]}>
                          {tr.profitLoss >= 0 ? '+' : ''}{Math.round(tr.profitLoss).toLocaleString()}{lang === 'ja' ? '円' : '¥'}
                        </Text>
                      )}
                    </View>
                  ))}
                  {(() => {
                    const ds = dayMap[selectedDate];
                    if (!ds) return null;
                    return (
                      <View style={s.daySum}>
                        <Text style={s.daySumLabel}>{t('cal_daily_total')}</Text>
                        <Text style={[s.daySumPips, { color: ds.pips >= 0 ? C.win : C.loss }]}>
                          {ds.pips > 0 ? '+' : ''}{ds.pips} pips
                        </Text>
                        {ds.pl !== 0 && (
                          <Text style={[s.daySumPL, { color: ds.pl >= 0 ? C.win : C.loss }]}>
                            {ds.pl >= 0 ? '+' : ''}{Math.round(ds.pl).toLocaleString()}¥
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                </>
              )}
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SCard({ label, value, color, C }: { label: string; value: string; color?: string; C: ThemeColors }) {
  return (
    <View style={{ flex: 1, minWidth: '46%', backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border }}>
      <Text style={{ fontSize: 10, color: C.text2, marginBottom: 4 }} numberOfLines={1}>{label}</Text>
      <Text style={[{ fontSize: 17, fontWeight: '800', color: C.text }, color ? { color } : {}]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
    title: { fontSize: 18, fontWeight: '700', color: C.text },
    closeBtn: { padding: 4 },

    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },

    metricBar: { marginHorizontal: 12, marginBottom: 10 },
    metricBarContent: { gap: 6 },
    metricChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
    metricChipLabel: { fontSize: 12, fontWeight: '600' },

    calWrap: { marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 10 },

    dayCell: { width: 46, height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4, borderWidth: 1.5, margin: 1 },
    dayNum: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
    dayValue: { fontSize: 9, fontWeight: '800', lineHeight: 13, width: '100%', textAlign: 'center', paddingHorizontal: 2 },

    legend: { flexDirection: 'row', gap: 14, justifyContent: 'center', marginBottom: 12, paddingVertical: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
    legendLabel: { fontSize: 11, color: C.text2 },

    dayDetail: { marginHorizontal: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
    detailTitle: { fontSize: 14, fontWeight: '700', color: C.text2, marginBottom: 10 },
    detailEmpty: { fontSize: 13, color: C.text3, textAlign: 'center', paddingVertical: 8 },
    tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    dirDot: { width: 8, height: 8, borderRadius: 4 },
    tradePair: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
    tradeDir: { fontSize: 12, color: C.text2, width: 36 },
    tradePips: { fontSize: 13, fontWeight: '700', minWidth: 72, textAlign: 'right' },
    tradePL: { fontSize: 12, color: C.text2, minWidth: 80, textAlign: 'right' },
    daySum: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, justifyContent: 'flex-end' },
    daySumLabel: { fontSize: 12, color: C.text2 },
    daySumPips: { fontSize: 15, fontWeight: '800' },
    daySumPL: { fontSize: 13, fontWeight: '600' },
  });
}

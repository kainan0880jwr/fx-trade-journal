import type { CalMetric } from '../utils/calendarMetrics';
import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import { t } from '../i18n';

export function SCard({ label, value, color, isTablet = false, note }: {
  label: string; value: string; color?: string; isTablet?: boolean;
  /**
   * 値の下に添える小さな注記。損益のように**全トレードを網羅していない**
   * 指標で「8件中1件」のようなカバー率を出すために使う。
   * 母数の異なる数値を注記なしで並べると、合計pipsがマイナスなのに
   * 損益合計がプラス、といった矛盾に見える（実際に発生していた）。
   */
  note?: string;
}) {
  const C = useTheme();
  return (
    <View style={{
      flex: 1, minWidth: isTablet ? '30%' : '46%',
      backgroundColor: C.card, borderRadius: 12,
      padding: isTablet ? 16 : 12, borderWidth: 1, borderColor: C.border,
    }}>
      <Text style={{ fontSize: isTablet ? 12 : 10, color: C.text2, marginBottom: 4 }} numberOfLines={1}>{label}</Text>
      <Text style={[{ fontSize: isTablet ? 20 : 17, fontWeight: '800', color: C.text }, color ? { color } : {}]} numberOfLines={1}>{value}</Text>
      {note ? (
        <Text style={{ fontSize: isTablet ? 11 : 9, color: C.text3, marginTop: 2 }} numberOfLines={1}>{note}</Text>
      ) : null}
    </View>
  );
}

/**
 * 選択中の指標に合わせた凡例を出す。
 *
 * 以前は指標に関係なく「プラス日／マイナス日／ゼロ」を出していたが、色の意味は
 * 指標ごとに違う（getDayBg 参照）。勝率は50%超/未満、勝敗数は勝ち越し/負け越し、
 * PFは1超/1未満、件数に至っては緑赤ではなく青1色。**6指標中4つで凡例が
 * 間違っていた。**
 */
export function CalendarLegend({ isTablet = false, metric = 'pips' }: { isTablet?: boolean; metric?: CalMetric }) {
  const C = useTheme();
  if (metric === 'count') {
    // 件数は記録の有無だけを青で示す。プラス/マイナスの概念が無い。
    return (
      <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginBottom: 12, paddingVertical: 4 }}>
        <LegendItem C={C} isTablet={isTablet} color={C.primary} label={t('cal_has_record')} />
      </View>
    );
  }
  // pips / pl は金額や pips の符号そのものなので従来の文言が正しい。
  // winRate / wl / pf は「良い・悪い・互角」でまとめる。
  const signed = metric === 'pips' || metric === 'pl';
  return (
    <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginBottom: 12, paddingVertical: 4 }}>
      <LegendItem C={C} isTablet={isTablet} color={C.win} label={t(signed ? 'cal_plus_day' : 'cal_good_day')} />
      <LegendItem C={C} isTablet={isTablet} color={C.loss} label={t(signed ? 'cal_minus_day' : 'cal_bad_day')} />
      <LegendItem C={C} isTablet={isTablet} color={C.border} label={t(signed ? 'cal_zero_day' : 'cal_even_day')} />
    </View>
  );
}

function LegendItem({ C, isTablet, color, label }: { C: ThemeColors; isTablet: boolean; color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 1, backgroundColor: color + '50', borderColor: color }} />
      <Text style={{ fontSize: isTablet ? 13 : 11, color: C.text2 }}>{label}</Text>
    </View>
  );
}

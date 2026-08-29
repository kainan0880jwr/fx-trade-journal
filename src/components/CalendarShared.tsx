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

export function CalendarLegend({ isTablet = false }: { isTablet?: boolean }) {
  const C = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginBottom: 12, paddingVertical: 4 }}>
      <LegendItem C={C} isTablet={isTablet} color={C.win} label={t('cal_plus_day')} />
      <LegendItem C={C} isTablet={isTablet} color={C.loss} label={t('cal_minus_day')} />
      <LegendItem C={C} isTablet={isTablet} color={C.border} label={t('cal_zero_day')} />
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

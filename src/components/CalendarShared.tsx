import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import { t } from '../i18n';

export function SCard({ label, value, color, isTablet = false }: {
  label: string; value: string; color?: string; isTablet?: boolean;
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

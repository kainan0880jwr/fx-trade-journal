import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import { t, tArr } from '../i18n';

interface Props {
  month: string;
  onChange: (month: string) => void;
}

function addMonths(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = tArr('month_names');

export default function MonthSelector({ month, onChange }: Props) {
  const C = useTheme();
  const styles = makeStyles(C);

  const [y, m] = month.split('-').map(Number);
  // toISOString()はUTC基準のため、月末早朝のJST等では前月と誤判定することがある
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = month === currentYM;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => onChange(addMonths(month, -1))} style={styles.btn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={20} color={C.primary} />
      </TouchableOpacity>

      <View style={styles.labelBlock}>
        <Text style={styles.year}>{y}</Text>
        <Text style={styles.monthText}>{MONTH_NAMES[m - 1]}</Text>
        {isCurrentMonth && <View style={styles.nowBadge}><Text style={styles.nowText}>{t('this_month')}</Text></View>}
      </View>

      <TouchableOpacity onPress={() => onChange(addMonths(month, 1))} style={styles.btn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-forward" size={20} color={C.primary} />
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: C.bg,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    btn: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },
    labelBlock: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    year: { fontSize: 14, color: C.text2, fontWeight: '500' },
    monthText: { fontSize: 20, fontWeight: '800', color: C.text },
    nowBadge: { backgroundColor: C.primaryGlow, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: C.primary + '40' },
    nowText: { fontSize: 10, fontWeight: '700', color: C.primary },
  });
}

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';

interface Props {
  label: string;
  value: string;
  subValue?: string;
  color?: string;
}

export default function StatsCard({ label, value, subValue, color }: Props) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: color ?? C.primary }]}>{value}</Text>
      {subValue ? <Text style={styles.subValue}>{subValue}</Text> : null}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: 12,
      padding: 16,
      flex: 1,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    label: { fontSize: 11, color: C.text2, fontWeight: '600', marginBottom: 6 },
    value: { fontSize: 22, fontWeight: '800' },
    subValue: { fontSize: 11, color: C.text3, marginTop: 2 },
  });
}

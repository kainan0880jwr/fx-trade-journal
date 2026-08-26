import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import type { Trade } from '../types';
import { t, tArr } from '../i18n';
import { calcHourDayHeatmap } from '../utils/statsCalc';

const CELL = 20;
const GAP = 2;
const DAY_COL_WIDTH = 22;

export default function HourDayHeatmap({ trades }: { trades: Trade[] }) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const dayLabels = tArr('day_labels');
  const grid = useMemo(() => calcHourDayHeatmap(trades), [trades]);
  const maxCount = useMemo(
    () => Math.max(...grid.flat().map(c => c.total), 1),
    [grid]
  );

  return (
    <View style={s.wrap}>
      <Text style={s.title}>{t('heatmap_title')}</Text>
      <View style={{ flexDirection: 'row' }}>
        <View>
          <View style={{ height: CELL + GAP }} />
          {dayLabels.map((label, dow) => (
            <View key={dow} style={[s.dayLabelCell, { height: CELL, marginBottom: GAP }]}>
              <Text style={s.dayLabelText}>{label}</Text>
            </View>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={{ flexDirection: 'row' }}>
              {Array.from({ length: 24 }, (_, h) => (
                <View key={h} style={{ width: CELL, marginRight: GAP, height: CELL + GAP, justifyContent: 'flex-end' }}>
                  {h % 3 === 0 && <Text style={s.hourLabelText}>{h}</Text>}
                </View>
              ))}
            </View>
            {grid.map((row, dow) => (
              <View key={dow} style={{ flexDirection: 'row', marginBottom: GAP }}>
                {row.map(cell => (
                  <View
                    key={cell.hour}
                    style={[
                      s.cell,
                      cell.total === 0
                        ? { backgroundColor: 'transparent', borderColor: C.border }
                        : {
                          backgroundColor: (cell.avgPips >= 0 ? C.win : C.loss) +
                            opacityHex(cell.total / maxCount),
                          borderColor: 'transparent',
                        },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <Text style={s.hint}>{t('heatmap_hint')}</Text>
    </View>
  );
}

// 0〜1のtotal比率を、視認性を保つため30%〜100%の不透明度(16進2桁)に写像する
function opacityHex(ratio: number): string {
  const alpha = Math.round((0.3 + ratio * 0.7) * 255);
  return alpha.toString(16).padStart(2, '0');
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    wrap: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
    title: { fontSize: 13, fontWeight: '600', color: C.text2, marginBottom: 12 },
    dayLabelCell: { width: DAY_COL_WIDTH, alignItems: 'center', justifyContent: 'center' },
    dayLabelText: { fontSize: 10, color: C.text2, fontWeight: '600' },
    hourLabelText: { fontSize: 8, color: C.text3, textAlign: 'center' },
    cell: { width: CELL, height: CELL, marginRight: GAP, borderRadius: 4, borderWidth: 1 },
    hint: { fontSize: 10, color: C.text3, marginTop: 10, lineHeight: 14 },
  });
}

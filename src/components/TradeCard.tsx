import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { useIsTablet } from '../hooks/useIsTablet';
import type { ThemeColors } from '../theme/colors';
import { t } from '../i18n';
import type { Trade } from '../types';

interface Props {
  trade: Trade;
}

const STYLE_LABELS = () => ({
  scalping: t('card_style_scalp'), day: t('card_style_day'), swing: t('card_style_swing'), other: t('card_style_other'),
} as Record<string, string>);

function TradeCard({ trade }: Props) {
  const C = useTheme();
  const isTablet = useIsTablet();
  const styles = useMemo(() => makeStyles(C, isTablet), [C, isTablet]);

  const isWin  = trade.result === 'win';
  const isLoss = trade.result === 'loss';
  const resultColor = isWin ? C.win : isLoss ? C.loss : C.even;
  const resultBg    = isWin ? C.winBg : isLoss ? C.lossBg : C.evenBg;
  const resultLabel = isWin ? t('win_short') : isLoss ? t('loss_short') : t('even_short');
  const pipsSign  = (trade.pips ?? 0) > 0 ? '+' : '';
  const pipsText  = trade.pips != null ? `${pipsSign}${trade.pips}` : '-';
  const plText    = trade.profitLoss != null
    ? `${trade.profitLoss > 0 ? '+' : ''}${trade.profitLoss.toLocaleString()}¥`
    : null;
  const dateStr   = trade.date.slice(0, 10);
  const timeStr   = trade.date.length >= 16 ? trade.date.slice(11, 16) : '';
  const dirColor  = trade.direction === 'buy' ? C.buy : C.sell;
  const dirLabel  = trade.direction === 'buy' ? `▲ ${t('buy')}` : `▼ ${t('sell')}`;

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/trade/${trade.id}`)} activeOpacity={0.72}>
      <View style={[styles.accent, { backgroundColor: resultColor }]} />

      <View style={styles.body}>
        <View style={styles.row}>
          <View style={styles.pairBlock}>
            <Text style={styles.pair}>{trade.pair}</Text>
            <Text style={[styles.dir, { color: dirColor }]}>{dirLabel}</Text>
          </View>

          <View style={styles.right}>
            <View style={[styles.badge, { backgroundColor: resultBg, borderColor: resultColor + '60' }]}>
              <Text style={[styles.badgeText, { color: resultColor }]}>{resultLabel}</Text>
            </View>
            <Text style={[styles.pips, { color: resultColor }]}>
              {pipsText}
              <Text style={styles.pipsUnit}> pips</Text>
            </Text>
            {plText && <Text style={[styles.pl, { color: resultColor }]}>{plText}</Text>}
          </View>
        </View>

        <View style={styles.meta}>
          <MetaChip icon="calendar-outline" label={dateStr} />
          {timeStr ? <MetaChip icon="time-outline" label={timeStr} /> : null}
          <MetaChip icon="layers-outline" label={STYLE_LABELS()[trade.style] ?? trade.style} />
          {trade.tags.length > 0 && (
            <MetaChip icon="pricetag-outline" label={trade.tags[0]} highlight />
          )}
          {trade.selfRating >= 4 && (
            <View style={[styles.chip, { backgroundColor: C.yellowBg, borderColor: C.yellow + '50' }]}>
              <Ionicons name="star" size={10} color={C.yellow} />
              <Text style={[styles.chipText, { color: C.yellow }]}>{trade.selfRating}</Text>
            </View>
          )}
        </View>

        {trade.reflection ? (
          <Text style={styles.reflection} numberOfLines={1}>
            {trade.reflection}
          </Text>
        ) : null}
      </View>

      {trade.bookmarked && (
        <Ionicons name="bookmark" size={13} color={C.primary} style={styles.bookmark} />
      )}

      {trade.imageUris.length > 0 && (
        <View style={styles.imgIndicator}>
          <Ionicons name="image-outline" size={11} color={C.text3} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function MetaChip({ icon, label, highlight }: { icon: string; label: string; highlight?: boolean }) {
  const C = useTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: highlight ? C.purpleBg : C.cardAlt,
      borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
      borderWidth: 1,
      borderColor: highlight ? C.purple + '50' : C.border,
    }}>
      <Ionicons name={icon as any} size={10} color={highlight ? C.purple : C.text3} />
      <Text style={{ fontSize: 10, color: highlight ? C.purple : C.text3 }}>{label}</Text>
    </View>
  );
}

export default React.memo(TradeCard, (prev, next) => prev.trade === next.trade);

function makeStyles(C: ThemeColors, isTablet: boolean) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderRadius: 16,
      marginHorizontal: isTablet ? 10 : 14,
      marginVertical: 6,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    accent: { width: 3 },
    body: { flex: 1, padding: isTablet ? 16 : 13, paddingLeft: isTablet ? 14 : 12 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    pairBlock: {},
    pair: { fontSize: isTablet ? 19 : 17, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
    dir: { fontSize: isTablet ? 13 : 12, fontWeight: '700', marginTop: 2 },
    right: { alignItems: 'flex-end', gap: 3 },
    badge: {
      paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
      borderWidth: 1, marginBottom: 1,
    },
    badgeText: { fontSize: isTablet ? 12 : 11, fontWeight: '800' },
    pips: { fontSize: isTablet ? 26 : 22, fontWeight: '900' },
    pipsUnit: { fontSize: isTablet ? 12 : 11, fontWeight: '400', color: C.text2 },
    pl: { fontSize: isTablet ? 12 : 11, fontWeight: '600' },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
      borderWidth: 1,
    },
    chipText: { fontSize: isTablet ? 11 : 10 },
    reflection: { fontSize: isTablet ? 12 : 11, color: C.text3, marginTop: 6, lineHeight: isTablet ? 17 : 15 },
    bookmark: { position: 'absolute', top: 6, right: 6 },
    imgIndicator: { position: 'absolute', bottom: 6, right: 8 },
  });
}

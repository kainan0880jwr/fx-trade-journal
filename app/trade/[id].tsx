import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTradeById } from '../../src/db/queries';
import { useTradeStore } from '../../src/store/tradeStore';
import { deleteTradeImages, resolveImageUri } from '../../src/utils/imageStorage';
import { useTheme } from '../../src/theme/useTheme';
import type { ThemeColors } from '../../src/theme/colors';
import { t } from '../../src/i18n';
import type { Trade } from '../../src/types';

const STYLE_LABELS = () => ({
  scalping: t('style_scalping'), day: t('style_day'), swing: t('style_swing'), other: t('style_other'),
} as Record<string, string>);

export default function TradeDetailScreen() {
  const C = useTheme();
  const styles = makeStyles(C);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImg, setSelectedImg] = useState<string | null>(null);
  const { removeTrade, bookmarkTrade } = useTradeStore();

  useEffect(() => {
    if (id) {
      setIsLoading(true);
      getTradeById(id)
        .then(tr => { setTrade(tr); })
        .catch(e => { console.error('loadTrade error:', e); })
        .finally(() => setIsLoading(false));
    }
  }, [id]);

  const handleDelete = () => {
    Alert.alert(t('delete_confirm'), t('detail_delete_msg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => {
        if (!id || !trade) return;
        try {
          await removeTrade(id);
          deleteTradeImages(trade.imageUris).catch(() => {});
          router.back();
        } catch {
          Alert.alert(t('error'), t('save_error_msg'));
        }
      }},
    ]);
  };

  const handleBookmark = async () => {
    if (!trade || !id) return;
    const next = !trade.bookmarked;
    await bookmarkTrade(id, next);
    setTrade({ ...trade, bookmarked: next });
  };

  const handleShare = async () => {
    if (!trade) return;
    const pips = trade.pips != null ? `${trade.pips > 0 ? '+' : ''}${trade.pips}` : '-';
    const result = trade.result === 'win' ? t('win') : trade.result === 'loss' ? t('loss') : t('even');
    const dir = trade.direction === 'buy' ? 'BUY ▲' : 'SELL ▼';
    const dateStr = trade.date.slice(0, 10);
    const stars = '⭐'.repeat(trade.selfRating ?? 3);
    const pl = trade.profitLoss != null && trade.profitLoss !== 0
      ? `\n💴 ${trade.profitLoss > 0 ? '+' : ''}${trade.profitLoss.toLocaleString()}¥` : '';

    const lines = [
      `📊 ${trade.pair}  ${dateStr}`,
      `━━━━━━━━━━━━━━`,
      `⚡ ${dir}  ${result}`,
      `📈 ${pips} pips${pl}`,
      `${stars}`,
      `━━━━━━━━━━━━━━`,
      `📱 FXトレードログ`,
    ];
    await Share.share({ message: lines.join('\n') });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>{t('loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!trade) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>{t('detail_not_found')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isWin = trade.result === 'win';
  const isLoss = trade.result === 'loss';
  const resultColor = isWin ? C.win : isLoss ? C.loss : C.even;
  const resultLabel = isWin ? t('win') : isLoss ? t('loss') : t('even');
  const pipsStr = trade.pips != null ? `${trade.pips > 0 ? '+' : ''}${trade.pips}` : '-';
  const plStr = trade.profitLoss != null
    ? `${trade.profitLoss > 0 ? '+' : ''}${trade.profitLoss.toLocaleString()}¥` : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {selectedImg && (
        <TouchableOpacity style={styles.imgOverlay} onPress={() => setSelectedImg(null)} activeOpacity={1}>
          <Image source={{ uri: resolveImageUri(selectedImg) }} style={styles.imgFull} resizeMode="contain" />
          <TouchableOpacity style={styles.imgClose} onPress={() => setSelectedImg(null)}>
            <Ionicons name="close-circle" size={32} color="#FFFFFF" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <View style={[styles.heroCard, { borderTopColor: resultColor }]}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroPair}>{trade.pair}</Text>
            <Text style={[styles.heroDir, { color: trade.direction === 'buy' ? C.buy : C.sell }]}>
              {trade.direction === 'buy' ? '▲ BUY' : '▼ SELL'}
            </Text>
          </View>
          <View style={styles.heroRight}>
            <View style={[styles.resultBadge, { backgroundColor: resultColor }]}>
              <Text style={styles.resultBadgeText}>{resultLabel}</Text>
            </View>
            <TouchableOpacity onPress={handleShare} style={styles.bookmarkBtn}>
              <Ionicons name="share-outline" size={22} color={C.text2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBookmark} style={styles.bookmarkBtn}>
              <Ionicons name={trade.bookmarked ? 'bookmark' : 'bookmark-outline'} size={24}
                color={trade.bookmarked ? C.primary : C.text2} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={[styles.heroPips, { color: resultColor }]}>{pipsStr} <Text style={styles.heroPipsUnit}>pips</Text></Text>
        {plStr && <Text style={[styles.heroPL, { color: resultColor }]}>{plStr}</Text>}
        <View style={styles.heroStars}>
          {[1,2,3,4,5].map(n => (
            <Ionicons key={n} name="star" size={18} color={n <= trade.selfRating ? C.yellow : C.text3} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.infoCard}>
          <InfoRow label={t('detail_datetime')} value={trade.date.replace('T', ' ').slice(0, 16)} />
          {trade.entryRate != null && <InfoRow label={t('detail_entry_rate')} value={String(trade.entryRate)} />}
          {trade.exitRate != null && <InfoRow label={t('detail_exit_rate')} value={String(trade.exitRate)} />}
          {trade.stopLoss != null && <InfoRow label={t('detail_sl')} value={String(trade.stopLoss)} valueColor={C.loss} />}
          {trade.takeProfit != null && <InfoRow label={t('detail_tp')} value={String(trade.takeProfit)} valueColor={C.win} />}
          {trade.plannedRR != null && <InfoRow label={t('detail_planned_rr')} value={`1:${trade.plannedRR}`} valueColor={C.primary} />}
          <InfoRow label={t('detail_lot')} value={String(trade.lotSize)} />
          <InfoRow label={t('detail_style')} value={STYLE_LABELS()[trade.style] ?? trade.style} last />
        </View>

        {trade.tags && trade.tags.length > 0 && (
          <View style={styles.tagsCard}>
            <Text style={styles.sectionLabel}>{t('detail_tags')}</Text>
            <View style={styles.tagRow}>
              {trade.tags.map(tag => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {trade.imageUris && trade.imageUris.length > 0 && (
          <View style={styles.imagesCard}>
            <Text style={styles.sectionLabel}>{t('detail_images')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
              {trade.imageUris.map((uri, i) => (
                <TouchableOpacity key={i} onPress={() => setSelectedImg(uri)} style={styles.thumbTouch}>
                  <Image source={{ uri: resolveImageUri(uri) }} style={styles.thumb} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {(trade.tfWeekly || trade.tfDaily || trade.tf4h || trade.tf1h) && (
          <View style={styles.tagsCard}>
            <Text style={styles.sectionLabel}>{t('detail_tf')}</Text>
            {([
              { label: t('tf_weekly'), value: trade.tfWeekly },
              { label: t('tf_daily'), value: trade.tfDaily },
              { label: t('tf_4h'),    value: trade.tf4h },
              { label: t('tf_1h'),    value: trade.tf1h },
            ] as const).filter(tf => tf.value).map(tf => (
              <View key={tf.label} style={styles.tfRow}>
                <Text style={styles.tfLabel}>{tf.label}</Text>
                <Text style={styles.tfValue}>{tf.value}</Text>
              </View>
            ))}
          </View>
        )}

        {trade.reflection ? (
          <View style={styles.reflectCard}>
            <Text style={styles.sectionLabel}>{t('detail_reflection')}</Text>
            <Text style={styles.reflectText}>{trade.reflection}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={18} color={C.loss} />
          <Text style={styles.deleteBtnText}>{t('detail_delete')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  const C = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { fontSize: 14, color: C.text2 },
    imgOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
    imgFull: { width: '100%', height: '85%' },
    imgClose: { position: 'absolute', top: 50, right: 20 },
    heroCard: { backgroundColor: C.card, padding: 20, borderTopWidth: 4, borderBottomWidth: 1, borderBottomColor: C.border },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    heroPair: { fontSize: 26, fontWeight: '900', color: C.text },
    heroDir: { fontSize: 14, fontWeight: '700', marginTop: 4 },
    heroRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    resultBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
    resultBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    bookmarkBtn: { padding: 4 },
    heroPips: { fontSize: 44, fontWeight: '900' },
    heroPipsUnit: { fontSize: 18, fontWeight: '400' },
    heroPL: { fontSize: 18, fontWeight: '600', marginTop: 4 },
    heroStars: { flexDirection: 'row', gap: 4, marginTop: 12 },
    scroll: { padding: 16, paddingBottom: 40 },
    infoCard: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    infoRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    infoLabel: { fontSize: 14, color: C.text2 },
    infoValue: { fontSize: 14, fontWeight: '600', color: C.text },
    sectionLabel: { fontSize: 12, fontWeight: '600', color: C.text2, marginBottom: 10 },
    tagsCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: C.purple + '30', borderWidth: 1, borderColor: C.purple },
    tagChipText: { fontSize: 13, color: C.purple, fontWeight: '600' },
    imagesCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    imageScroll: { marginTop: 4 },
    thumbTouch: { marginRight: 10 },
    thumb: { width: 120, height: 90, borderRadius: 10 },
    reflectCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    reflectText: { fontSize: 15, color: C.text, lineHeight: 22 },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.loss, borderRadius: 14, padding: 15, gap: 6, marginTop: 8 },
    deleteBtnText: { color: C.loss, fontSize: 15, fontWeight: '600' },
    tfRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    tfLabel: { width: 32, fontSize: 11, fontWeight: '700', color: C.primary, paddingTop: 2 },
    tfValue: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },
  });
}

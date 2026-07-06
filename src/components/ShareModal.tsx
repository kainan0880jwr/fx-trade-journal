import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Switch, StyleSheet,
  ScrollView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/useTheme';
import { useIsTablet } from '../hooks/useIsTablet';
import type { ThemeColors } from '../theme/colors';
import type { DailyStats } from '../types';
import { buildShareText, shareStats, shareStatsAsHTML, formatPeriodLabel } from '../utils/shareUtils';
import { t } from '../i18n';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  stats: DailyStats;
  yearMonth: string;   // "2026-06"
  streak?: number;
  isPremium?: boolean;
}

export default function ShareModal({ visible, onClose, stats, yearMonth, streak = 0, isPremium = false }: ShareModalProps) {
  const C = useTheme();
  const isTablet = useIsTablet();
  const styles = useMemo(() => makeStyles(C, isTablet), [C, isTablet]);
  const [includeFinancials, setIncludeFinancials] = useState(false);
  const [htmlLoading, setHtmlLoading] = useState(false);

  const period = formatPeriodLabel(yearMonth);
  const preview = buildShareText({ stats, period, yearMonth, streak, includeFinancials });

  const handleTextShare = async () => {
    await shareStats({ stats, period, yearMonth, streak, includeFinancials });
    onClose();
  };

  const handleHTMLShare = async () => {
    setHtmlLoading(true);
    try {
      await shareStatsAsHTML({ stats, period, yearMonth, streak, includeFinancials, isPremium });
      onClose();
    } catch {
      Alert.alert(t('error'), t('settings_export_error'));
    } finally {
      setHtmlLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>{t('share_monthly_stats')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={C.text2} />
          </TouchableOpacity>
        </View>

        {/* テキストプレビュー */}
        <ScrollView style={styles.previewWrap} contentContainerStyle={styles.previewContent}>
          <View style={styles.previewCard}>
            <Text style={styles.previewText}>{preview}</Text>
          </View>
        </ScrollView>

        {/* 損益トグル */}
        <View style={styles.toggle}>
          <Text style={styles.toggleLabel}>{t('share_include_financials')}</Text>
          <Switch
            value={includeFinancials}
            onValueChange={setIncludeFinancials}
            trackColor={{ true: C.primary }}
            thumbColor={Platform.OS === 'android' ? (includeFinancials ? C.primary : C.text3) : undefined}
          />
        </View>
        <Text style={styles.toggleNote}>{t('share_financials_note')}</Text>

        {/* シェアボタン群 */}
        <View style={styles.btnRow}>
          {/* テキストシェア */}
          <TouchableOpacity style={[styles.shareBtn, styles.shareBtnSecondary]} onPress={handleTextShare}>
            <Ionicons name="chatbubble-outline" size={16} color={C.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.shareBtnText, { color: C.primary }]}>{t('share_button')}</Text>
          </TouchableOpacity>

          {/* HTML カードシェア */}
          <TouchableOpacity
            style={[styles.shareBtn, styles.shareBtnPrimary, htmlLoading && { opacity: 0.6 }]}
            onPress={handleHTMLShare}
            disabled={htmlLoading}
          >
            {htmlLoading ? (
              <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />
            ) : (
              <Ionicons name="image-outline" size={16} color="#FFF" style={{ marginRight: 6 }} />
            )}
            <Text style={styles.shareBtnText}>{t('share_card_btn')}</Text>
          </TouchableOpacity>
        </View>

        {/* 無料版ウォーターマーク注意書き */}
        {!isPremium && (
          <Text style={styles.watermarkNote}>{t('share_watermark_note')}</Text>
        )}
      </View>
    </Modal>
  );
}

function makeStyles(C: ThemeColors, isTablet: boolean) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: C.bg,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingHorizontal: isTablet ? 32 : 20,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
      maxHeight: '80%',
    },
    handle: {
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: C.border, alignSelf: 'center', marginTop: 12, marginBottom: 8,
    },
    header: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', paddingVertical: 12,
    },
    title: {
      fontSize: isTablet ? 18 : 16, fontWeight: '800', color: C.text,
    },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    },
    previewWrap: { maxHeight: isTablet ? 260 : 200 },
    previewContent: { paddingVertical: 8 },
    previewCard: {
      backgroundColor: C.card, borderRadius: 14,
      padding: 18, borderWidth: 1, borderColor: C.border,
    },
    previewText: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: isTablet ? 14 : 12.5, color: C.text, lineHeight: 22,
    },
    toggle: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', paddingVertical: 14,
      borderTopWidth: 1, borderTopColor: C.border, marginTop: 12,
    },
    toggleLabel: { fontSize: isTablet ? 15 : 14, fontWeight: '600', color: C.text },
    toggleNote: {
      fontSize: isTablet ? 12 : 11, color: C.text3, marginTop: -6, marginBottom: 16,
    },
    btnRow: {
      flexDirection: 'row', gap: 10,
    },
    shareBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: isTablet ? 16 : 14,
    },
    shareBtnPrimary: {
      backgroundColor: C.primary,
    },
    shareBtnSecondary: {
      backgroundColor: C.card,
      borderWidth: 1.5, borderColor: C.primary,
    },
    shareBtnText: {
      fontSize: isTablet ? 15 : 14, fontWeight: '800', color: '#FFF',
    },
    watermarkNote: {
      fontSize: isTablet ? 12 : 11,
      color: C.text3,
      textAlign: 'center',
      marginTop: 10,
      lineHeight: 16,
    },
  });
}

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../src/store/settingsStore';
import PremiumGate from '../src/components/PremiumGate';
import { useTheme } from '../src/theme/useTheme';
import type { ThemeColors } from '../src/theme/colors';
import { t } from '../src/i18n';

const RISK_PRESETS = ['0.5', '1', '1.5', '2', '3', '5'];

export default function CalculatorScreen() {
  const C = useTheme();
  const styles = makeStyles(C);
  const { settings } = useSettingsStore();
  const [balance, setBalance] = useState(
    settings.accountBalance > 0 ? String(settings.accountBalance) : ''
  );
  const [riskPct, setRiskPct] = useState(String(settings.defaultRiskPct));
  const [slPips, setSlPips] = useState('');
  const [isYenPair, setIsYenPair] = useState(true);
  const [usdJpy, setUsdJpy] = useState('155');

  const bal = parseFloat(balance);
  const risk = parseFloat(riskPct);
  const sl = parseFloat(slPips);
  const usd = parseFloat(usdJpy);
  const lotUnit = settings.lotUnit;

  const canCalc = bal > 0 && risk > 0 && sl > 0;

  let lotSize: number | null = null;
  let riskAmount: number | null = null;
  let explanation = '';

  if (canCalc) {
    riskAmount = Math.round(bal * risk / 100);
    if (isYenPair) {
      const pipValue = lotUnit / 10;
      lotSize = Math.floor((riskAmount / (sl * pipValue)) * 100) / 100;
      explanation = `損切りpips ${sl}pips × ロット単位${lotUnit}通貨 / 10 = ${sl * pipValue}円/lot`;
    } else {
      const pipValue = lotUnit * 0.0001 * usd;
      lotSize = Math.floor((riskAmount / (sl * pipValue)) * 100) / 100;
      explanation = `損切りpips ${sl}pips × ロット単位${lotUnit}通貨 × 0.0001 × USD/JPY${usd} = ${Math.round(sl * pipValue)}円/lot`;
    }
    lotSize = Math.max(0.01, lotSize);
  }

  return (
    <PremiumGate feature={t('calculator_title')}>
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.titleRow}>
            <Ionicons name="calculator-outline" size={24} color={C.primary} />
            <Text style={styles.title}>{t('calculator_title')}</Text>
          </View>
          <Text style={styles.subtitle}>{t('calculator_subtitle')}</Text>

          <Label>{t('calc_balance')}</Label>
          <TextInput style={styles.input} value={balance} onChangeText={setBalance}
            keyboardType="number-pad" placeholder="例: 500000" placeholderTextColor={C.text3} />

          <Label>{t('calc_risk_pct')}</Label>
          <View style={styles.chipRow}>
            {RISK_PRESETS.map(p => (
              <TouchableOpacity key={p}
                style={[styles.chip, riskPct === p && styles.chipActive]}
                onPress={() => setRiskPct(p)}>
                <Text style={[styles.chipLabel, riskPct === p && styles.chipLabelActive]}>{p}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={[styles.input, { marginTop: 8 }]} value={riskPct} onChangeText={setRiskPct}
            keyboardType="decimal-pad" placeholder="2" placeholderTextColor={C.text3} />

          <Label>{t('calc_sl_pips')}</Label>
          <TextInput style={styles.input} value={slPips} onChangeText={setSlPips}
            keyboardType="decimal-pad" placeholder="例: 20" placeholderTextColor={C.text3} />

          <Label>{t('calc_pair_type')}</Label>
          <View style={styles.segRow}>
            <TouchableOpacity style={[styles.seg, isYenPair && styles.segActive]}
              onPress={() => setIsYenPair(true)}>
              <Text style={[styles.segLabel, isYenPair && styles.segLabelActive]}>{t('calc_yen_pair')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.seg, !isYenPair && styles.segActive]}
              onPress={() => setIsYenPair(false)}>
              <Text style={[styles.segLabel, !isYenPair && styles.segLabelActive]}>{t('calc_dollar_pair')}</Text>
            </TouchableOpacity>
          </View>

          {!isYenPair && (
            <>
              <Label>{t('calc_usdjpy_rate')}</Label>
              <TextInput style={styles.input} value={usdJpy} onChangeText={setUsdJpy}
                keyboardType="decimal-pad" placeholder="155.000" placeholderTextColor={C.text3} />
            </>
          )}

          <View style={styles.resultCard}>
            {canCalc && lotSize != null && riskAmount != null ? (
              <>
                <Text style={styles.resultLabel}>{t('calc_recommended_lot')}</Text>
                <Text style={styles.resultLot}>{lotSize.toFixed(2)} <Text style={styles.resultUnit}>lot</Text></Text>
                <View style={styles.resultDivider} />
                <View style={styles.resultRow}>
                  <Text style={styles.resultSubLabel}>{t('calc_risk_amount')}</Text>
                  <Text style={styles.resultSubValue}>{riskAmount.toLocaleString()}¥</Text>
                </View>
                <View style={styles.resultRow}>
                  <Text style={styles.resultSubLabel}>{riskPct}%</Text>
                  <Text style={styles.resultSubValue}>{riskPct}%</Text>
                </View>
                <Text style={styles.resultExplan}>{explanation}</Text>
              </>
            ) : (
              <View style={styles.resultEmpty}>
                <Ionicons name="calculator-outline" size={36} color={C.text3} />
                <Text style={styles.resultEmptyText}>{t('calc_empty')}</Text>
              </View>
            )}
          </View>

          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>{t('calc_money_mgmt')}</Text>
            <HintRow label={t('calc_ultra_conservative')} value={t('calc_hint_ultra')} />
            <HintRow label={t('calc_conservative')} value={t('calc_hint_conservative')} />
            <HintRow label={t('calc_standard')} value={t('calc_hint_standard')} highlight />
            <HintRow label={t('calc_aggressive')} value={t('calc_hint_aggressive')} />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </PremiumGate>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  const C = useTheme();
  return <Text style={{ fontSize: 13, fontWeight: '600', color: C.text2, marginTop: 18, marginBottom: 8 }}>{children}</Text>;
}

function HintRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const C = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={styles.hintRow}>
      <Text style={[styles.hintLabel, highlight && { color: C.primary }]}>{label}</Text>
      <Text style={[styles.hintValue, highlight && { color: C.primary, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    scroll: { padding: 16 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    title: { fontSize: 20, fontWeight: '800', color: C.text },
    subtitle: { fontSize: 13, color: C.text2, marginBottom: 4, lineHeight: 20 },
    input: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 13, fontSize: 15, color: C.text },
    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
    chipActive: { backgroundColor: C.primary, borderColor: C.primary },
    chipLabel: { fontSize: 13, color: C.text2 },
    chipLabelActive: { color: '#FFFFFF', fontWeight: '700' },
    segRow: { flexDirection: 'row', gap: 8 },
    seg: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card, alignItems: 'center' },
    segActive: { borderColor: C.primary, backgroundColor: C.cardAlt },
    segLabel: { fontSize: 12, color: C.text2 },
    segLabelActive: { color: C.primary, fontWeight: '700' },
    resultCard: { backgroundColor: C.card, borderRadius: 16, padding: 20, marginTop: 24, borderWidth: 1.5, borderColor: C.primary + '60', minHeight: 130 },
    resultLabel: { fontSize: 12, color: C.text2, marginBottom: 6 },
    resultLot: { fontSize: 52, fontWeight: '900', color: C.primary },
    resultUnit: { fontSize: 20, fontWeight: '400', color: C.text2 },
    resultDivider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    resultSubLabel: { fontSize: 13, color: C.text2 },
    resultSubValue: { fontSize: 13, fontWeight: '700', color: C.text },
    resultExplan: { fontSize: 11, color: C.text3, marginTop: 10, lineHeight: 16 },
    resultEmpty: { alignItems: 'center', justifyContent: 'center', gap: 10 },
    resultEmptyText: { fontSize: 13, color: C.text3 },
    hintCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: C.border },
    hintTitle: { fontSize: 13, fontWeight: '700', color: C.text2, marginBottom: 12 },
    hintRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
    hintLabel: { fontSize: 13, color: C.text2 },
    hintValue: { fontSize: 13, color: C.text },
  });
}

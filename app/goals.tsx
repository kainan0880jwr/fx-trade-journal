import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/useTheme';
import type { ThemeColors } from '../src/theme/colors';
import { parseDecimal } from '../src/utils/parseDecimal';
import { moneySuffix } from '../src/utils/formatMoney';
import { closeScreen } from '../src/utils/closeScreen';
import { t } from '../src/i18n';
import type { GoalField } from '../src/db/queries';

/** 数値目標の入力欄。未設定は空欄で表し、0 を入れさせない */
type NumField = Exclude<GoalField, 'dailyRuleGoal'>;

export default function GoalsScreen() {
  const C = useTheme();
  const s = makeStyles(C);
  const settings = useSettingsStore(st => st.settings);
  const tradeRules = useSettingsStore(st => st.tradeRules);
  const updateGoal = useSettingsStore(st => st.updateGoal);

  const [ruleDaily, setRuleDaily] = useState(settings.dailyRuleGoal);
  const [saving, setSaving] = useState(false);
  const [inputs, setInputs] = useState<Record<NumField, string>>(() => {
    const init = {} as Record<NumField, string>;
    const fields: NumField[] = [
      'dailyPipsGoal', 'dailyPLGoal',
      'weeklyRuleDaysGoal', 'weeklyPipsGoal', 'weeklyPLGoal',
      'monthlyRuleDaysGoal', 'monthlyPipsGoal', 'monthlyWinRateGoal', 'monthlyPLGoal',
      'yearlyRuleDaysGoal', 'yearlyPipsGoal', 'yearlyPLGoal', 'yearlyWinRateGoal',
    ];
    for (const f of fields) {
      const v = settings[f] as number;
      init[f] = v > 0 ? String(v) : '';
    }
    return init;
  });

  const setInput = (f: NumField, v: string) => setInputs(prev => ({ ...prev, [f]: v }));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateGoal('dailyRuleGoal', ruleDaily);
      for (const [f, raw] of Object.entries(inputs) as [NumField, string][]) {
        // 空欄は「未設定」。parseDecimal が null を返すので 0 に落とす。
        await updateGoal(f, Math.max(0, parseDecimal(raw) ?? 0));
      }
      Alert.alert(t('settings_goals_saved'));
      closeScreen();
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    } finally {
      setSaving(false);
    }
  };

  const noRules = tradeRules.length === 0;

  const NumRow = ({ field, label, placeholder, suffix }: {
    field: NumField; label: string; placeholder: string; suffix?: string;
  }) => (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}{suffix ? ` (${suffix})` : ''}</Text>
      <TextInput
        style={s.input}
        value={inputs[field]}
        onChangeText={v => setInput(field, v)}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={C.text3}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Ionicons name="flag-outline" size={26} color={C.primary} />
        <Text style={s.headerTitle}>{t('goal_screen_title')}</Text>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={closeScreen}
          accessibilityLabel={t('cancel')}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={22} color={C.text2} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.intro}>{t('goal_intro')}</Text>

          {noRules && (
            <View style={s.noticeCard}>
              <Ionicons name="information-circle-outline" size={16} color={C.text2} />
              <Text style={s.noticeText}>{t('goal_no_rules_note')}</Text>
            </View>
          )}

          {/* ── 日 ── */}
          <Text style={s.section}>{t('goal_period_day')}</Text>
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.rowLabel}>{t('goal_rule_daily')}</Text>
              <Switch
                value={ruleDaily}
                onValueChange={setRuleDaily}
                disabled={noRules}
                accessibilityLabel={t('goal_rule_daily')}
              />
            </View>
            <NumRow field="dailyPipsGoal" label="pips" placeholder={`${t('eg_prefix')}20`} />
            <NumRow field="dailyPLGoal" label={t('goal_pl')} placeholder={`${t('eg_prefix')}5000`} suffix={moneySuffix()} />
            {/* 日単位の成果目標は、未達の日に無理に建てる理由を作りやすい。
                設定できるようにはするが、なぜ既定でオフなのかは明示する。 */}
            <Text style={s.warn}>{t('goal_daily_outcome_note')}</Text>
          </View>

          {/* ── 週 ── */}
          <Text style={s.section}>{t('goal_period_week')}</Text>
          <View style={s.card}>
            <NumRow field="weeklyRuleDaysGoal" label={t('goal_rule_days')} placeholder={`${t('eg_prefix')}4`} />
            <NumRow field="weeklyPipsGoal" label="pips" placeholder={`${t('eg_prefix')}30`} />
            <NumRow field="weeklyPLGoal" label={t('goal_pl')} placeholder={`${t('eg_prefix')}15000`} suffix={moneySuffix()} />
          </View>

          {/* ── 月 ── */}
          <Text style={s.section}>{t('goal_period_month')}</Text>
          <View style={s.card}>
            <NumRow field="monthlyRuleDaysGoal" label={t('goal_rule_days')} placeholder={`${t('eg_prefix')}15`} />
            <NumRow field="monthlyPipsGoal" label="pips" placeholder={`${t('eg_prefix')}100`} />
            <NumRow field="monthlyWinRateGoal" label={t('goal_winrate')} placeholder={`${t('eg_prefix')}60`} suffix="%" />
            <NumRow field="monthlyPLGoal" label={t('goal_pl')} placeholder={`${t('eg_prefix')}50000`} suffix={moneySuffix()} />
          </View>

          {/* ── 年 ── */}
          <Text style={s.section}>{t('goal_period_year')}</Text>
          <View style={s.card}>
            <NumRow field="yearlyRuleDaysGoal" label={t('goal_rule_days')} placeholder={`${t('eg_prefix')}180`} />
            <NumRow field="yearlyPipsGoal" label="pips" placeholder={`${t('eg_prefix')}1200`} />
            <NumRow field="yearlyWinRateGoal" label={t('goal_winrate')} placeholder={`${t('eg_prefix')}60`} suffix="%" />
            <NumRow field="yearlyPLGoal" label={t('goal_pl')} placeholder={`${t('eg_prefix')}600000`} suffix={moneySuffix()} />
          </View>

          <Text style={s.footNote}>{t('goal_mark_note')}</Text>

          <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            <Text style={s.saveBtnText}>{t('save')}</Text>
          </TouchableOpacity>
          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: C.text },
    closeBtn: { padding: 4 },
    scroll: { padding: 16 },
    intro: { fontSize: 12, lineHeight: 18, color: C.text2, marginBottom: 14 },
    noticeCard: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: C.cardAlt, borderRadius: 10, padding: 12, marginBottom: 14 },
    noticeText: { flex: 1, fontSize: 11, lineHeight: 16, color: C.text2 },
    section: { fontSize: 13, fontWeight: '800', color: C.text, marginTop: 8, marginBottom: 8 },
    card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
    rowLabel: { flex: 1, fontSize: 13, color: C.text },
    input: { width: 120, backgroundColor: C.cardAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: C.text, fontSize: 14, textAlign: 'right', borderWidth: 1, borderColor: C.border },
    warn: { fontSize: 10, lineHeight: 15, color: C.text3, marginTop: 8 },
    footNote: { fontSize: 11, lineHeight: 16, color: C.text2, marginTop: 14, marginBottom: 16 },
    saveBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  });
}

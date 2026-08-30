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
import { usePurchaseStore } from '../src/store/purchaseStore';
import { router } from 'expo-router';
import { t } from '../src/i18n';
import type { GoalField } from '../src/db/queries';

/** 数値目標の入力欄。未設定は空欄で表し、0 を入れさせない */
type NumField = Exclude<GoalField, 'dailyRuleGoal'>;

/**
 * 数値目標の入力行。
 *
 * この定義を GoalsScreen の内側に置くと、入力のたびに新しい関数として
 * 作られるため React が別のコンポーネントとみなし、TextInput が
 * unmount/remount されてフォーカスが外れる（1文字しか入力できなくなる）。
 * 必ず画面の外に置くこと。
 */
function NumRow({ field, label, placeholder, suffix, value, onChange, locked, onLockedPress, C, s }: {
  field: NumField; label: string; placeholder: string; suffix?: string;
  value: string; onChange: (f: NumField, v: string) => void;
  locked?: boolean; onLockedPress?: () => void;
  C: ThemeColors; s: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, locked && { color: C.text3 }]}>{label}{suffix ? ` (${suffix})` : ''}</Text>
      {locked ? (
        <TouchableOpacity
          style={[s.input, s.inputLocked]}
          onPress={onLockedPress}
          accessibilityRole="button"
          accessibilityLabel={`${label} (${t('premium_badge')})`}
        >
          <Ionicons name="lock-closed" size={14} color={C.text3} />
        </TouchableOpacity>
      ) : (
        <TextInput
          style={s.input}
          value={value}
          onChangeText={v => onChange(field, v)}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={C.text3}
          accessibilityLabel={label}
        />
      )}
    </View>
  );
}

export default function GoalsScreen() {
  const C = useTheme();
  const s = makeStyles(C);
  const settings = useSettingsStore(st => st.settings);
  const tradeRules = useSettingsStore(st => st.tradeRules);
  const updateGoal = useSettingsStore(st => st.updateGoal);

  const [ruleDaily, setRuleDaily] = useState(settings.dailyRuleGoal);
  const [saving, setSaving] = useState(false);
  const isPremium = usePurchaseStore(st => st.isPremium);

  // 月次のpips・勝率・損益は以前から設定画面で無料提供していた項目なので、
  // 有料化して取り上げない。日・週・年とルール遵守は今回の新機能なので有料。
  const FREE_FIELDS: NumField[] = ['monthlyPipsGoal', 'monthlyWinRateGoal', 'monthlyPLGoal'];
  const isLocked = (f: NumField) => !isPremium && !FREE_FIELDS.includes(f);
  const openPaywall = () =>
    router.push({ pathname: '/paywall', params: { source: 'goals' } });
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
      if (isPremium) await updateGoal('dailyRuleGoal', ruleDaily);
      for (const [f, raw] of Object.entries(inputs) as [NumField, string][]) {
        if (isLocked(f)) continue;   // 未購読の項目は既存値を書き換えない
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

          {/* 案内だけ出しても設定画面まで辿れないので、タップで戻れるようにする */}
          {noRules && (
            <TouchableOpacity
              style={s.noticeCard}
              onPress={closeScreen}
              accessibilityRole="button"
              accessibilityLabel={t('goal_no_rules_note')}
            >
              <Ionicons name="information-circle-outline" size={16} color={C.text2} />
              <Text style={s.noticeText}>{t('goal_no_rules_note')}</Text>
              <Ionicons name="chevron-forward" size={16} color={C.text3} />
            </TouchableOpacity>
          )}

          {/* ── 日 ── */}
          <View style={s.sectionRow}>
            <Text style={s.section}>{t('goal_period_day')}</Text>
            {!isPremium && <Text style={s.proTag}>{t('premium_badge')}</Text>}
          </View>
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.rowLabel}>{t('goal_rule_daily')}</Text>
              {!isPremium ? (
                <TouchableOpacity onPress={openPaywall} accessibilityRole="button"
                  accessibilityLabel={`${t('goal_rule_daily')} (${t('premium_badge')})`}>
                  <Ionicons name="lock-closed" size={16} color={C.text3} />
                </TouchableOpacity>
              ) : (
                <Switch
                  value={ruleDaily}
                  onValueChange={setRuleDaily}
                  disabled={noRules}
                  accessibilityLabel={t('goal_rule_daily')}
                />
              )}
            </View>
            <NumRow field="dailyPipsGoal" label="pips" placeholder={`${t('eg_prefix')}20`} value={inputs.dailyPipsGoal} onChange={setInput} locked={isLocked('dailyPipsGoal')} onLockedPress={openPaywall} C={C} s={s} />
            <NumRow field="dailyPLGoal" label={t('goal_pl')} placeholder={`${t('eg_prefix')}5000`} suffix={moneySuffix()} value={inputs.dailyPLGoal} onChange={setInput} locked={isLocked('dailyPLGoal')} onLockedPress={openPaywall} C={C} s={s} />
            {/* 日単位の成果目標は、未達の日に無理に建てる理由を作りやすい。
                設定できるようにはするが、なぜ既定でオフなのかは明示する。 */}
            <Text style={s.warn}>{t('goal_daily_outcome_note')}</Text>
          </View>

          {/* ── 週 ── */}
          <View style={s.sectionRow}>
            <Text style={s.section}>{t('goal_period_week')}</Text>
            {!isPremium && <Text style={s.proTag}>{t('premium_badge')}</Text>}
          </View>
          <View style={s.card}>
            <NumRow field="weeklyRuleDaysGoal" label={t('goal_rule_days')} placeholder={`${t('eg_prefix')}4`} value={inputs.weeklyRuleDaysGoal} onChange={setInput} locked={isLocked('weeklyRuleDaysGoal')} onLockedPress={openPaywall} C={C} s={s} />
            <NumRow field="weeklyPipsGoal" label="pips" placeholder={`${t('eg_prefix')}30`} value={inputs.weeklyPipsGoal} onChange={setInput} locked={isLocked('weeklyPipsGoal')} onLockedPress={openPaywall} C={C} s={s} />
            <NumRow field="weeklyPLGoal" label={t('goal_pl')} placeholder={`${t('eg_prefix')}15000`} suffix={moneySuffix()} value={inputs.weeklyPLGoal} onChange={setInput} locked={isLocked('weeklyPLGoal')} onLockedPress={openPaywall} C={C} s={s} />
          </View>

          {/* ── 月 ── */}
          <Text style={s.section}>{t('goal_period_month')}</Text>
          <View style={s.card}>
            <NumRow field="monthlyRuleDaysGoal" label={t('goal_rule_days')} placeholder={`${t('eg_prefix')}15`} value={inputs.monthlyRuleDaysGoal} onChange={setInput} locked={isLocked('monthlyRuleDaysGoal')} onLockedPress={openPaywall} C={C} s={s} />
            <NumRow field="monthlyPipsGoal" label="pips" placeholder={`${t('eg_prefix')}100`} value={inputs.monthlyPipsGoal} onChange={setInput} locked={isLocked('monthlyPipsGoal')} onLockedPress={openPaywall} C={C} s={s} />
            <NumRow field="monthlyWinRateGoal" label={t('goal_winrate')} placeholder={`${t('eg_prefix')}60`} suffix="%" value={inputs.monthlyWinRateGoal} onChange={setInput} locked={isLocked('monthlyWinRateGoal')} onLockedPress={openPaywall} C={C} s={s} />
            <NumRow field="monthlyPLGoal" label={t('goal_pl')} placeholder={`${t('eg_prefix')}50000`} suffix={moneySuffix()} value={inputs.monthlyPLGoal} onChange={setInput} locked={isLocked('monthlyPLGoal')} onLockedPress={openPaywall} C={C} s={s} />
          </View>

          {/* ── 年 ── */}
          <View style={s.sectionRow}>
            <Text style={s.section}>{t('goal_period_year')}</Text>
            {!isPremium && <Text style={s.proTag}>{t('premium_badge')}</Text>}
          </View>
          <View style={s.card}>
            <NumRow field="yearlyRuleDaysGoal" label={t('goal_rule_days')} placeholder={`${t('eg_prefix')}180`} value={inputs.yearlyRuleDaysGoal} onChange={setInput} locked={isLocked('yearlyRuleDaysGoal')} onLockedPress={openPaywall} C={C} s={s} />
            <NumRow field="yearlyPipsGoal" label="pips" placeholder={`${t('eg_prefix')}1200`} value={inputs.yearlyPipsGoal} onChange={setInput} locked={isLocked('yearlyPipsGoal')} onLockedPress={openPaywall} C={C} s={s} />
            <NumRow field="yearlyWinRateGoal" label={t('goal_winrate')} placeholder={`${t('eg_prefix')}60`} suffix="%" value={inputs.yearlyWinRateGoal} onChange={setInput} locked={isLocked('yearlyWinRateGoal')} onLockedPress={openPaywall} C={C} s={s} />
            <NumRow field="yearlyPLGoal" label={t('goal_pl')} placeholder={`${t('eg_prefix')}600000`} suffix={moneySuffix()} value={inputs.yearlyPLGoal} onChange={setInput} locked={isLocked('yearlyPLGoal')} onLockedPress={openPaywall} C={C} s={s} />
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
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    proTag: { fontSize: 9, fontWeight: '800', color: '#1B1E28', backgroundColor: C.yellow, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
    inputLocked: { alignItems: 'center', justifyContent: 'center' },
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

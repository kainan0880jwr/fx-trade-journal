import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Switch, Platform, ActivityIndicator, Linking
} from 'react-native';
import Constants from 'expo-constants';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as LocalAuthentication from 'expo-local-authentication';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTradeStore } from '../../src/store/tradeStore';
import { generateId } from '../../src/utils/statsCalc';
import { getAllTrades, getSetting, setSetting } from '../../src/db/queries';
import { exportBackup, importBackup } from '../../src/utils/backup';
import { importMT4CSV } from '../../src/utils/mt4Import';
import {
  isNotificationsAvailable, requestNotificationPermission,
  scheduleReminder, cancelAllReminders, scheduleWeeklySummary,
} from '../../src/utils/notifications';
import { useTheme } from '../../src/theme/useTheme';
import type { ThemeColors } from '../../src/theme/colors';
import { t } from '../../src/i18n';
import type { CurrencyPair, AppSettings } from '../../src/types';

type ThemeMode = AppSettings['themeMode'];

// ──────────────────────────────────────────────────────────────────
// アフィリエイトブローカー一覧
// TODO: 各社のアフィリエイトプログラムに登録後、url を自分の紹介リンクに書き換えてください
// ──────────────────────────────────────────────────────────────────
const BROKERS = [
  {
    id: 'gmo',
    emoji: '🟩',
    name: 'GMOクリック証券',
    tagline: '業界最狭スプレッド・国内FX取引高No.1',
    badges: ['スプレッド最狭', 'スマホ取引充実'],
    // TODO: アフィリエイトURL に置き換える
    url: 'https://www.gmo-click.com/lp/fx3/a/',
  },
  {
    id: 'dmm',
    emoji: '⬛',
    name: 'DMM FX',
    tagline: '豪華キャッシュバック・シンプルな取引画面',
    badges: ['キャッシュバックあり', '初心者向け'],
    // TODO: アフィリエイトURL に置き換える
    url: 'https://fx.dmm.com/lp/01/',
  },
  {
    id: 'sbi',
    emoji: '🟦',
    name: 'SBI FXトレード',
    tagline: 'SBIグループ・1通貨から取引可能',
    badges: ['1通貨から', '安心の大手証券'],
    // TODO: アフィリエイトURL に置き換える
    url: 'https://www.sbifxt.co.jp/',
  },
  {
    id: 'gaitame',
    emoji: '🟧',
    name: '外為どっとコム',
    tagline: '老舗FX会社・情報ツールが充実',
    badges: ['分析ツール豊富', '老舗で安心'],
    // TODO: アフィリエイトURL に置き換える
    url: 'https://www.gaitame.com/fx/',
  },
] as const;

export default function SettingsScreen() {
  const C = useTheme();
  const styles = makeStyles(C);

  const {
    pairs, settings, entryTags, tradeRules,
    addPair, removePair, updateLotUnit,
    updateAccountBalance, updateDefaultRiskPct,
    updateMonthlyPipsGoal, updateMonthlyWinRateGoal,
    addEntryTag, removeEntryTag,
    addTradeRule, removeTradeRule,
    updateThemeMode, updateAppLockEnabled,
  } = useSettingsStore();

  const [lotInput, setLotInput] = useState(String(settings.lotUnit));
  const [balanceInput, setBalanceInput] = useState(
    settings.accountBalance > 0 ? String(settings.accountBalance) : ''
  );
  const [riskInput, setRiskInput] = useState(String(settings.defaultRiskPct));
  const [pipsGoalInput, setPipsGoalInput] = useState(
    settings.monthlyPipsGoal > 0 ? String(settings.monthlyPipsGoal) : ''
  );
  const [winRateGoalInput, setWinRateGoalInput] = useState(
    settings.monthlyWinRateGoal > 0 ? String(settings.monthlyWinRateGoal) : ''
  );
  const [showAddPair, setShowAddPair] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newPairName, setNewPairName] = useState('');
  const [newPairDigits, setNewPairDigits] = useState<2 | 4>(2);
  const [newPairIsYen, setNewPairIsYen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newRule, setNewRule] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [mt4Loading, setMt4Loading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifHour, setNotifHour] = useState(21);
  const [notifMinute, setNotifMinute] = useState(0);
  const [weeklyEnabled, setWeeklyEnabled] = useState(false);
  const [weeklyHour, setWeeklyHour] = useState(8);
  const [weeklyMinute, setWeeklyMinute] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showWeeklyTimePicker, setShowWeeklyTimePicker] = useState(false);
  const notifAvailable = isNotificationsAvailable();

  const notifTimeDate = new Date();
  notifTimeDate.setHours(notifHour, notifMinute, 0, 0);
  const weeklyTimeDate = new Date();
  weeklyTimeDate.setHours(weeklyHour, weeklyMinute, 0, 0);

  const handleNotifTimeChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selected) {
      setNotifHour(selected.getHours());
      setNotifMinute(selected.getMinutes());
    }
  };

  const handleWeeklyTimeChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowWeeklyTimePicker(false);
    if (selected) {
      setWeeklyHour(selected.getHours());
      setWeeklyMinute(selected.getMinutes());
    }
  };

  useEffect(() => {
    getSetting('notif_enabled').then(v => setNotifEnabled(v === '1'));
    getSetting('notif_hour').then(v => { if (v) setNotifHour(parseInt(v, 10)); });
    getSetting('notif_minute').then(v => { if (v) setNotifMinute(parseInt(v, 10)); });
    getSetting('weekly_notif_enabled').then(v => setWeeklyEnabled(v === '1'));
    getSetting('weekly_notif_hour').then(v => { if (v) setWeeklyHour(parseInt(v, 10)); });
    getSetting('weekly_notif_minute').then(v => { if (v) setWeeklyMinute(parseInt(v, 10)); });
  }, []);

  const handleSaveLotUnit = async () => {
    const val = parseInt(lotInput, 10);
    if (isNaN(val) || val <= 0) { Alert.alert(t('input_error'), t('settings_valid_number')); return; }
    try {
      await updateLotUnit(val);
      Alert.alert(t('saved'));
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleSaveBalance = async () => {
    const val = parseFloat(balanceInput);
    if (isNaN(val) || val < 0) { Alert.alert(t('input_error'), t('settings_valid_number')); return; }
    try {
      await updateAccountBalance(val);
      await updateDefaultRiskPct(parseFloat(riskInput) || 2);
      Alert.alert(t('saved'));
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleSaveGoals = async () => {
    try {
      await updateMonthlyPipsGoal(parseFloat(pipsGoalInput) || 0);
      await updateMonthlyWinRateGoal(parseFloat(winRateGoalInput) || 0);
      Alert.alert(t('settings_goals_saved'));
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleExportBackup = async () => {
    setBackupLoading(true);
    try {
      await exportBackup();
    } catch {
      Alert.alert(t('error'), t('backup_import_error'));
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImportBackup = () => {
    Alert.alert(
      t('backup_import'),
      t('backup_import_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('backup_import'),
          style: 'destructive',
          onPress: async () => {
            setBackupLoading(true);
            try {
              const count = await importBackup();
              if (count > 0) {
                Alert.alert(t('saved'), t('backup_import_success').replace('{n}', String(count)));
              }
            } catch {
              Alert.alert(t('error'), t('backup_import_error'));
            } finally {
              setBackupLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleAppLockToggle = async (value: boolean) => {
    try {
      if (!value) {
        await updateAppLockEnabled(false);
        return;
      }
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert(t('app_lock_unavailable_title'), t('app_lock_unavailable_msg'));
        return;
      }
      // 実際の本人確認はAppLockGate側が有効化を検知して行う（ここで重ねて呼ぶとFace IDシートが競合してフリーズする）
      await updateAppLockEnabled(true);
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleMT4Import = async () => {
    setMt4Loading(true);
    try {
      const result = await importMT4CSV();
      if (result.imported > 0) {
        Alert.alert(t('saved'), t('mt4_import_success').replace('{n}', String(result.imported)));
      } else if (result.errors.length > 0) {
        Alert.alert(t('mt4_import_error'), result.errors.slice(0, 3).join('\n'));
      } else if (!result.imported) {
        Alert.alert(t('settings_no_data'), t('mt4_import_none'));
      }
    } catch (e: any) {
      Alert.alert(t('error'), t('mt4_import_error'));
    } finally {
      setMt4Loading(false);
    }
  };

  // Excel/Googleスプレッドシートでの数式実行（CSVインジェクション）を防ぐため、
  // 数式と解釈されうる先頭文字にはシングルクォートを前置してから、RFC 4180準拠で全セルをクォートする
  const csvCell = (v: string | number): string => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const handleExportCSV = async () => {
    const trades = await getAllTrades();
    if (trades.length === 0) { Alert.alert(t('settings_no_data'), t('settings_no_export')); return; }
    Alert.alert(t('settings_csv'), t('csv_export_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('settings_csv'),
        onPress: async () => {
          try {
            const header = 'ID,日時,通貨ペア,方向,新規レート,決済レート,SL,TP,計画RR,ロット,スタイル,タグ,pips,損益,結果,自己評価,反省,集中度,冷静さ,焦り度,遵守ルール';
            const rows = trades.map(tr => [
              csvCell(tr.id), csvCell(tr.date), csvCell(tr.pair), csvCell(tr.direction),
              csvCell(tr.entryRate ?? ''), csvCell(tr.exitRate ?? ''),
              csvCell(tr.stopLoss ?? ''), csvCell(tr.takeProfit ?? ''), csvCell(tr.plannedRR ?? ''),
              csvCell(tr.lotSize), csvCell(tr.style),
              csvCell((tr.tags ?? []).join('|')),
              csvCell(tr.pips ?? ''), csvCell(tr.profitLoss ?? ''), csvCell(tr.result),
              csvCell(tr.selfRating),
              csvCell((tr.reflection ?? '').replace(/[\r\n]/g, ' ')),
              csvCell(tr.mentalFocus ?? ''), csvCell(tr.mentalCalm ?? ''), csvCell(tr.mentalFear ?? ''),
              csvCell((tr.ruleChecks ?? []).join('|')),
            ].join(','));
            const csv = '﻿' + [header, ...rows].join('\r\n'); // BOM付きでExcel日本語文字化けを防止
            if (!cacheDirectory) throw new Error('cacheDirectory unavailable');
            const dateStr = new Date().toISOString().slice(0, 10);
            const filePath = `${cacheDirectory}fx-trades-${dateStr}.csv`;
            await writeAsStringAsync(filePath, csv, { encoding: 'utf8' });
            const isAvailable = await Sharing.isAvailableAsync();
            if (!isAvailable) throw new Error('sharing_unavailable');
            await Sharing.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle: t('settings_csv') });
          } catch {
            Alert.alert(t('error'), t('settings_export_error'));
          }
        },
      },
    ]);
  };

  const handleAddRule = async () => {
    const rule = newRule.trim();
    if (!rule) return;
    if (tradeRules.includes(rule)) { Alert.alert(t('settings_rule_exists')); return; }
    try {
      await addTradeRule(rule); setNewRule(''); setShowAddRule(false);
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleDeleteRule = (rule: string) => {
    Alert.alert(t('delete_confirm'), `「${rule}」`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          try {
            await removeTradeRule(rule);
          } catch {
            Alert.alert(t('error'), t('settings_save_error_msg'));
          }
        },
      },
    ]);
  };

  const handleAddPair = async () => {
    const name = newPairName.trim().toUpperCase();
    if (name.length < 6) { Alert.alert(t('input_error'), t('settings_pair_format')); return; }
    try {
      await addPair({ id: generateId(), name, pipDigits: newPairDigits, isYenPair: newPairIsYen, isActive: true });
      setNewPairName(''); setShowAddPair(false);
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleDeletePair = (pair: CurrencyPair) => {
    Alert.alert(t('delete_confirm'), `${pair.name}`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          try {
            await removePair(pair.id);
          } catch {
            Alert.alert(t('error'), t('settings_save_error_msg'));
          }
        },
      },
    ]);
  };

  const handleAddTag = async () => {
    const tag = newTag.trim();
    if (!tag) return;
    if (entryTags.includes(tag)) { Alert.alert(t('settings_tag_exists')); return; }
    try {
      await addEntryTag(tag); setNewTag(''); setShowAddTag(false);
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleDeleteTag = (tag: string) => {
    Alert.alert(t('delete_confirm'), `「${tag}」`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          try {
            await removeEntryTag(tag);
          } catch {
            Alert.alert(t('error'), t('settings_save_error_msg'));
          }
        },
      },
    ]);
  };

  const handleNotifToggle = async (val: boolean) => {
    try {
      if (val) {
        const granted = await requestNotificationPermission();
        if (!granted) { Alert.alert(t('settings_notif_permission'), t('settings_notif_permission_msg')); return; }
        await scheduleReminder(notifHour, notifMinute);
      } else {
        await cancelAllReminders();
      }
      await setSetting('notif_enabled', val ? '1' : '0');
      setNotifEnabled(val);
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleNotifTimeSave = async () => {
    try {
      await setSetting('notif_hour', String(notifHour));
      await setSetting('notif_minute', String(notifMinute));
      if (notifEnabled) await scheduleReminder(notifHour, notifMinute);
      const timeStr = `${String(notifHour).padStart(2,'0')}:${String(notifMinute).padStart(2,'0')}`;
      Alert.alert(t('saved'), t('settings_notif_saved_msg').replace('{time}', timeStr));
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleWeeklyToggle = async (val: boolean) => {
    try {
      if (val) {
        const granted = await requestNotificationPermission();
        if (!granted) { Alert.alert(t('settings_notif_permission'), t('settings_notif_permission_msg')); return; }
      }
      await setSetting('weekly_notif_enabled', val ? '1' : '0');
      await scheduleWeeklySummary(weeklyHour, weeklyMinute, val); // 曜日は月曜固定、時刻のみ選択可能
      setWeeklyEnabled(val);
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleWeeklyTimeSave = async () => {
    try {
      await setSetting('weekly_notif_hour', String(weeklyHour));
      await setSetting('weekly_notif_minute', String(weeklyMinute));
      if (weeklyEnabled) await scheduleWeeklySummary(weeklyHour, weeklyMinute, true);
      const timeStr = `${String(weeklyHour).padStart(2,'0')}:${String(weeklyMinute).padStart(2,'0')}`;
      Alert.alert(t('saved'), t('settings_weekly_time_saved_msg').replace('{time}', timeStr));
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleThemeChange = async (mode: ThemeMode) => {
    try {
      await updateThemeMode(mode);
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'dark',   label: t('settings_theme_dark'),   icon: 'moon-outline' },
    { mode: 'light',  label: t('settings_theme_light'),  icon: 'sunny-outline' },
    { mode: 'system', label: t('settings_theme_system'), icon: 'phone-portrait-outline' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* 実績バッジ */}
        <TouchableOpacity style={styles.exportBtn} onPress={() => router.push('/badges')}>
          <Ionicons name="trophy-outline" size={22} color={C.yellow} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.exportTitle}>{t('settings_badges')}</Text>
            <Text style={styles.exportSub}>{t('settings_badges_sub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.text3} />
        </TouchableOpacity>

        {/* テーマ設定 */}
        <SectionTitle>{t('settings_theme')}</SectionTitle>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings_theme_mode')}</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map(opt => {
              const active = settings.themeMode === opt.mode;
              return (
                <TouchableOpacity
                  key={opt.mode}
                  style={[styles.themeSeg, active && styles.themeSegActive]}
                  onPress={() => handleThemeChange(opt.mode)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={18}
                    color={active ? C.primary : C.text3}
                  />
                  <Text style={[styles.themeSegLabel, active && { color: C.primary, fontWeight: '700' }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 記録リマインダー通知 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings_reminder')}</Text>
          {!notifAvailable ? (
            <View style={styles.card}>
              <Text style={styles.notifNote}>{t('settings_notif_install')}</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.notifRow}>
                <Text style={styles.notifLabel}>{t('settings_daily_reminder')}</Text>
                <Switch
                  value={notifEnabled}
                  onValueChange={handleNotifToggle}
                  trackColor={{ true: C.primary }}
                />
              </View>
              {notifEnabled && (
                <View style={styles.notifTimeRow}>
                  <Text style={styles.notifLabel}>{t('settings_notif_time')}</Text>
                  <View style={styles.notifTimeInputs}>
                    <TouchableOpacity
                      style={styles.notifTimeTouchable}
                      onPress={() => setShowTimePicker(true)}
                    >
                      <Text style={styles.notifTimeText}>
                        {String(notifHour).padStart(2, '0')}:{String(notifMinute).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.notifSaveBtn} onPress={handleNotifTimeSave}>
                      <Text style={styles.notifSaveBtnText}>{t('save')}</Text>
                    </TouchableOpacity>
                  </View>
                  {showTimePicker && (
                    <>
                      <DateTimePicker
                        value={notifTimeDate}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleNotifTimeChange}
                        locale="ja-JP"
                      />
                      {Platform.OS === 'ios' && (
                        <TouchableOpacity style={styles.notifSaveBtn} onPress={async () => { setShowTimePicker(false); await handleNotifTimeSave(); }}>
                          <Text style={styles.notifSaveBtnText}>{t('done_save')}</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              )}
              {/* 週次サマリー通知（毎週月曜、時刻は選択可能） */}
              <View style={[styles.notifRow, { marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifLabel}>{t('settings_weekly_summary')}</Text>
                  <Text style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{t('settings_weekly_summary_sub')}</Text>
                </View>
                <Switch
                  value={weeklyEnabled}
                  onValueChange={handleWeeklyToggle}
                  trackColor={{ true: C.primary }}
                />
              </View>
              {weeklyEnabled && (
                <View style={styles.notifTimeRow}>
                  <Text style={styles.notifLabel}>{t('settings_notif_time')}</Text>
                  <View style={styles.notifTimeInputs}>
                    <TouchableOpacity
                      style={styles.notifTimeTouchable}
                      onPress={() => setShowWeeklyTimePicker(true)}
                    >
                      <Text style={styles.notifTimeText}>
                        {String(weeklyHour).padStart(2, '0')}:{String(weeklyMinute).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.notifSaveBtn} onPress={handleWeeklyTimeSave}>
                      <Text style={styles.notifSaveBtnText}>{t('save')}</Text>
                    </TouchableOpacity>
                  </View>
                  {showWeeklyTimePicker && (
                    <>
                      <DateTimePicker
                        value={weeklyTimeDate}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleWeeklyTimeChange}
                        locale="ja-JP"
                      />
                      {Platform.OS === 'ios' && (
                        <TouchableOpacity style={styles.notifSaveBtn} onPress={async () => { setShowWeeklyTimePicker(false); await handleWeeklyTimeSave(); }}>
                          <Text style={styles.notifSaveBtnText}>{t('done_save')}</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        {/* アプリロック（生体認証） */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('app_lock_title')}</Text>
          <View style={styles.card}>
            <View style={styles.notifRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.notifLabel}>{t('app_lock_toggle')}</Text>
                <Text style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{t('app_lock_toggle_sub')}</Text>
              </View>
              <Switch
                value={settings.appLockEnabled}
                onValueChange={handleAppLockToggle}
                trackColor={{ true: C.primary }}
              />
            </View>
          </View>
        </View>

        {/* CSVエクスポート */}
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
          <Ionicons name="download-outline" size={22} color={C.yellow} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.calcTitle}>{t('settings_csv')}</Text>
            <Text style={styles.calcSubtitle}>{t('settings_csv_sub')}</Text>
          </View>
          <Ionicons name="share-outline" size={18} color={C.text3} />
        </TouchableOpacity>

        {/* MT4/MT5 CSVインポート */}
        <TouchableOpacity
          style={[styles.exportBtn, mt4Loading && { opacity: 0.6 }]}
          onPress={handleMT4Import}
          disabled={mt4Loading}
        >
          {mt4Loading
            ? <ActivityIndicator size="small" color={C.primary} />
            : <Ionicons name="cloud-download-outline" size={22} color={C.primary} />
          }
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.calcTitle}>{t('mt4_import')}</Text>
            <Text style={styles.calcSubtitle}>{t('mt4_import_sub')}</Text>
          </View>
          <Ionicons name="document-text-outline" size={18} color={C.text3} />
        </TouchableOpacity>

        {/* データバックアップ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('backup_section')}</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.backupBtn, backupLoading && styles.backupBtnDisabled]}
              onPress={handleExportBackup}
              disabled={backupLoading}
            >
              {backupLoading ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={20} color={C.primary} />
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.backupBtnTitle}>{t('backup_export')}</Text>
                <Text style={styles.backupBtnSub}>{t('backup_export_sub')}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.backupSep} />
            <TouchableOpacity
              style={[styles.backupBtn, backupLoading && styles.backupBtnDisabled]}
              onPress={handleImportBackup}
              disabled={backupLoading}
            >
              {backupLoading ? (
                <ActivityIndicator size="small" color={C.text2} />
              ) : (
                <Ionicons name="cloud-download-outline" size={20} color={C.text2} />
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.backupBtnTitle}>{t('backup_import')}</Text>
                <Text style={styles.backupBtnSub}>{t('backup_import_sub')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 資金管理計算機ショートカット */}
        <TouchableOpacity style={styles.calcShortcut} onPress={() => router.push('/calculator')}>
          <Ionicons name="calculator-outline" size={22} color={C.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.calcTitle}>{t('settings_calculator')}</Text>
            <Text style={styles.calcSubtitle}>{t('settings_calculator_sub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.text3} />
        </TouchableOpacity>

        {/* 資金管理設定 */}
        <SectionTitle>{t('settings_money')}</SectionTitle>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings_balance')}</Text>
          <TextInput style={[styles.input, { marginBottom: 12 }]}
            value={balanceInput} onChangeText={setBalanceInput}
            keyboardType="number-pad" placeholder="例: 500000" placeholderTextColor={C.text3} />
          <Text style={styles.cardLabel}>{t('settings_risk')}</Text>
          <TextInput style={[styles.input, { marginBottom: 14 }]}
            value={riskInput} onChangeText={setRiskInput}
            keyboardType="decimal-pad" placeholder="2" placeholderTextColor={C.text3} />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveBalance}>
            <Text style={styles.primaryBtnText}>{t('save')}</Text>
          </TouchableOpacity>
        </View>

        {/* 月次目標 */}
        <SectionTitle>{t('settings_goals')}</SectionTitle>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings_pips_goal')}</Text>
          <TextInput style={[styles.input, { marginBottom: 12 }]}
            value={pipsGoalInput} onChangeText={setPipsGoalInput}
            keyboardType="decimal-pad" placeholder="例: 100" placeholderTextColor={C.text3} />
          <Text style={styles.cardLabel}>{t('settings_winrate_goal')}</Text>
          <TextInput style={[styles.input, { marginBottom: 14 }]}
            value={winRateGoalInput} onChangeText={setWinRateGoalInput}
            keyboardType="decimal-pad" placeholder="例: 60" placeholderTextColor={C.text3} />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveGoals}>
            <Text style={styles.primaryBtnText}>{t('save')}</Text>
          </TouchableOpacity>
        </View>

        {/* ロット設定 */}
        <SectionTitle>{t('settings_lot_unit')}</SectionTitle>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings_lot_unit')}</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]}
              value={lotInput} onChangeText={setLotInput}
              keyboardType="number-pad" placeholder="10000" placeholderTextColor={C.text3} />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveLotUnit}>
              <Text style={styles.primaryBtnText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* トレードルール管理 */}
        <View style={styles.sectionRow}>
          <SectionTitle>{t('settings_rules')}</SectionTitle>
          <TouchableOpacity onPress={() => setShowAddRule(!showAddRule)}>
            <Ionicons name={showAddRule ? 'close-circle-outline' : 'add-circle-outline'} size={26} color={C.primary} />
          </TouchableOpacity>
        </View>
        {showAddRule && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('settings_add_rule')}</Text>
            <View style={styles.row}>
              <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]}
                value={newRule} onChangeText={setNewRule}
                placeholder={t('settings_rule_placeholder')} placeholderTextColor={C.text3} />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleAddRule}>
                <Text style={styles.primaryBtnText}>{t('add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={styles.listCard}>
          {tradeRules.length === 0 ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: C.text3, fontSize: 13 }}>{t('settings_no_rules')}</Text>
            </View>
          ) : tradeRules.map((rule, idx) => (
            <View key={rule} style={[styles.pairRow, idx < tradeRules.length - 1 && styles.pairBorder]}>
              <Text style={[styles.pairName, { flex: 1, fontSize: 13 }]}>{rule}</Text>
              <TouchableOpacity onPress={() => handleDeleteRule(rule)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="trash-outline" size={18} color={C.loss} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* エントリー根拠タグ管理 */}
        <View style={styles.sectionRow}>
          <SectionTitle>{t('settings_tags')}</SectionTitle>
          <TouchableOpacity onPress={() => setShowAddTag(!showAddTag)}>
            <Ionicons name={showAddTag ? 'close-circle-outline' : 'add-circle-outline'} size={26} color={C.primary} />
          </TouchableOpacity>
        </View>
        {showAddTag && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('settings_add_tag')}</Text>
            <View style={styles.row}>
              <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]}
                value={newTag} onChangeText={setNewTag}
                placeholder={t('settings_tag_placeholder')} placeholderTextColor={C.text3} />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleAddTag}>
                <Text style={styles.primaryBtnText}>{t('add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={styles.tagGrid}>
          {entryTags.map(tag => (
            <View key={tag} style={styles.tagItem}>
              <Text style={styles.tagLabel}>{tag}</Text>
              <TouchableOpacity onPress={() => handleDeleteTag(tag)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={14} color={C.text3} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* 通貨ペア管理 */}
        <View style={styles.sectionRow}>
          <SectionTitle>{t('settings_pairs')}</SectionTitle>
          <TouchableOpacity onPress={() => setShowAddPair(!showAddPair)}>
            <Ionicons name={showAddPair ? 'close-circle-outline' : 'add-circle-outline'} size={26} color={C.primary} />
          </TouchableOpacity>
        </View>
        {showAddPair && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('settings_add_pair_title')}</Text>
            <TextInput style={[styles.input, { marginBottom: 12 }]}
              value={newPairName} onChangeText={setNewPairName}
              placeholder="例: NZD/JPY" placeholderTextColor={C.text3} autoCapitalize="characters" />
            <Text style={styles.cardLabel}>{t('settings_pip_digits')}</Text>
            <View style={[styles.row, { marginBottom: 12 }]}>
              {([2, 4] as const).map(d => (
                <TouchableOpacity key={d}
                  style={[styles.seg, newPairDigits === d && styles.segActive]}
                  onPress={() => setNewPairDigits(d)}>
                  <Text style={[styles.segLabel, newPairDigits === d && styles.segLabelActive]}>
                    {d === 2 ? t('settings_yen_pair') : `${d}D`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.cardLabel}>{t('settings_yen_calc')}</Text>
              <Switch value={newPairIsYen} onValueChange={setNewPairIsYen} trackColor={{ true: C.primary }} />
            </View>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 14, width: '100%' }]} onPress={handleAddPair}>
              <Text style={styles.primaryBtnText}>{t('settings_pair_add')}</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.listCard}>
          {pairs.map((pair, idx) => (
            <View key={pair.id} style={[styles.pairRow, idx < pairs.length - 1 && styles.pairBorder]}>
              <View>
                <Text style={styles.pairName}>{pair.name}</Text>
                <Text style={styles.pairMeta}>{t('settings_pair_pip_meta').replace('{digits}', String(pair.pipDigits))}{pair.isYenPair ? t('settings_pair_yen_badge') : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDeletePair(pair)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="trash-outline" size={20} color={C.loss} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* おすすめFX口座（アフィリエイト） */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 6, gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.text2 }}>{t('affiliate_section')}</Text>
          <View style={{ backgroundColor: '#888', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 }}>広告</Text>
          </View>
        </View>
        <Text style={styles.affiliateNote}>{t('affiliate_note')}</Text>
        {BROKERS.map(broker => (
          <View key={broker.id} style={styles.affiliateCard}>
            <View style={styles.affiliateHeader}>
              <Text style={styles.affiliateEmoji}>{broker.emoji}</Text>
              <View style={styles.affiliateInfo}>
                <Text style={styles.affiliateName}>{broker.name}</Text>
                <Text style={styles.affiliateTagline}>{broker.tagline}</Text>
              </View>
            </View>
            <View style={styles.affiliateBadges}>
              {broker.badges.map(badge => (
                <View key={badge} style={styles.affiliateBadge}>
                  <Text style={styles.affiliateBadgeText}>{badge}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={styles.affiliateBtn}
              onPress={() => Linking.openURL(broker.url)}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={14} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.affiliateBtnText}>{t('affiliate_open_btn')}</Text>
            </TouchableOpacity>
          </View>
        ))}
        <Text style={styles.affiliateDisclaimer}>{t('affiliate_disclaimer')}</Text>

        {/* サポート・法的情報 */}
        <SectionTitle>{t('settings_about')}</SectionTitle>
        <View style={styles.listCard}>
          <TouchableOpacity style={[styles.pairRow, styles.pairBorder]} onPress={() => Linking.openURL('mailto:kainan0880jwr@gmail.com')}>
            <Text style={styles.pairName}>{t('settings_contact')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pairRow, styles.pairBorder]} onPress={() => Linking.openURL('https://kainan0880jwr.github.io/fx-trade-journal/privacy-policy.html')}>
            <Text style={styles.pairName}>{t('settings_privacy')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pairRow, styles.pairBorder]} onPress={() => Linking.openURL('https://kainan0880jwr.github.io/fx-trade-journal/terms.html')}>
            <Text style={styles.pairName}>{t('settings_terms')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pairRow, styles.pairBorder]} onPress={() => Linking.openURL('https://kainan0880jwr.github.io/fx-trade-journal/tokushoho.html')}>
            <Text style={styles.pairName}>{t('settings_tokushoho')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pairRow}
            onPress={() => Linking.openURL(
              Platform.OS === 'ios'
                ? 'https://apps.apple.com/account/subscriptions'
                : 'https://play.google.com/store/account/subscriptions'
            )}
          >
            <Text style={styles.pairName}>{t('settings_manage_subscription')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>
        </View>

        {/* アプリ情報 */}
        <SectionTitle>{t('settings_version')}</SectionTitle>
        <View style={styles.listCard}>
          <InfoRow label={t('app_name')} value={Constants.expoConfig?.version ?? '-'} last />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const C = useTheme();
  return <Text style={{ fontSize: 13, fontWeight: '700', color: C.text2, marginTop: 20, marginBottom: 10 }}>{children}</Text>;
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const C = useTheme();
  const styles = makeStyles(C);
  return (
    <View style={[styles.pairRow, !last && styles.pairBorder]}>
      <Text style={styles.pairMeta}>{label}</Text>
      <Text style={styles.pairName}>{value}</Text>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    scroll: { padding: 16 },
    exportBtn: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.card, borderRadius: 14, padding: 16,
      borderWidth: 1.5, borderColor: C.yellow + '60', marginBottom: 8,
    },
    calcShortcut: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.card, borderRadius: 14, padding: 16,
      borderWidth: 1.5, borderColor: C.primary + '60', marginBottom: 8,
    },
    calcTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    calcSubtitle: { fontSize: 12, color: C.text2, marginTop: 2 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: C.text2, marginTop: 20, marginBottom: 10 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 },
    card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: C.border },
    cardLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center' },
    input: { backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 11, fontSize: 15, color: C.text },
    primaryBtn: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center' },
    primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    seg: { flex: 1, paddingVertical: 10, marginRight: 8, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
    segActive: { borderColor: C.primary, backgroundColor: C.cardAlt },
    segLabel: { fontSize: 12, color: C.text2 },
    segLabelActive: { color: C.primary, fontWeight: '600' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    tagItem: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    tagLabel: { fontSize: 13, color: C.text },
    listCard: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
    pairRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    pairBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    pairName: { fontSize: 15, fontWeight: '600', color: C.text },
    pairMeta: { fontSize: 12, color: C.text2, marginTop: 2 },
    section: { marginBottom: 4 },
    exportTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    exportSub: { fontSize: 12, color: C.text2, marginTop: 2 },
    notifNote: { fontSize: 13, color: C.text2, lineHeight: 20 },
    notifRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    notifLabel: { fontSize: 14, color: C.text },
    notifTimeRow: { marginTop: 4 },
    notifTimeInputs: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    notifTimeTouchable: { backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    notifTimeText: { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: 1 },
    notifSaveBtn: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
    notifSaveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
    backupBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    backupBtnDisabled: { opacity: 0.5 },
    backupBtnTitle: { fontSize: 14, fontWeight: '600', color: C.text },
    backupBtnSub: { fontSize: 12, color: C.text2, marginTop: 2 },
    backupSep: { height: 1, backgroundColor: C.border },
    // アフィリエイト
    affiliateNote: {
      fontSize: 12, color: C.text3, marginBottom: 10, lineHeight: 18,
    },
    affiliateCard: {
      backgroundColor: C.card,
      borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: C.border,
      marginBottom: 10,
    },
    affiliateHeader: {
      flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10,
    },
    affiliateEmoji: {
      fontSize: 28, marginRight: 12, lineHeight: 36,
    },
    affiliateInfo: { flex: 1 },
    affiliateName: {
      fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 3,
    },
    affiliateTagline: {
      fontSize: 12, color: C.text2, lineHeight: 18,
    },
    affiliateBadges: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12,
    },
    affiliateBadge: {
      backgroundColor: C.primary + '20',
      borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
      borderWidth: 1, borderColor: C.primary + '40',
    },
    affiliateBadgeText: {
      fontSize: 11, fontWeight: '600', color: C.primary,
    },
    affiliateBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.primary,
      borderRadius: 10, paddingVertical: 11,
    },
    affiliateBtnText: {
      fontSize: 13, fontWeight: '800', color: '#FFF',
    },
    affiliateDisclaimer: {
      fontSize: 10, color: C.text3, lineHeight: 16, marginBottom: 8,
    },
    // テーマ切り替え
    themeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    themeSeg: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 10, borderRadius: 10,
      borderWidth: 1.5, borderColor: C.border, backgroundColor: C.cardAlt,
    },
    themeSegActive: { borderColor: C.primary, backgroundColor: C.primary + '18' },
    themeSegLabel: { fontSize: 12, color: C.text2 },
  });
}

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Switch, Platform, ActivityIndicator
} from 'react-native';
import Constants from 'expo-constants';
import { cacheDirectory, writeAsStringAsync, deleteAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as LocalAuthentication from 'expo-local-authentication';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTradeStore } from '../../src/store/tradeStore';
import { usePurchaseStore } from '../../src/store/purchaseStore';
import { generateId } from '../../src/utils/statsCalc';
import { getAllTrades, getSetting, setSetting } from '../../src/db/queries';
import { exportBackup, importBackup, getPreImportSnapshot, restorePreImportSnapshot, getLastBackupAt, backupFreshness, estimateBackupImages, MAX_TRADES_PER_BACKUP } from '../../src/utils/backup';
import { importMT4CSV } from '../../src/utils/mt4Import';
import {
  isNotificationsAvailable, requestNotificationPermission,
  scheduleReminder, cancelAllReminders, scheduleWeeklySummary,
} from '../../src/utils/notifications';
import { useTheme } from '../../src/theme/useTheme';
import type { ThemeColors } from '../../src/theme/colors';
import { t } from '../../src/i18n';
import {
  PRIVACY_POLICY_URL, TERMS_URL, TOKUSHOHO_URL,
  CONTACT_EMAIL, CONTACT_MAILTO_URL, SUBSCRIPTIONS_URL,
} from '../../src/utils/legalLinks';
import { openExternalUrl } from '../../src/utils/openExternalUrl';
import type { CurrencyPair, AppSettings } from '../../src/types';
import { parseDecimal } from '../../src/utils/parseDecimal';

type ThemeMode = AppSettings['themeMode'];

export default function SettingsScreen() {
  const C = useTheme();
  const styles = makeStyles(C);

  const {
    pairs, settings, entryTags, tradeRules,
    addPair, removePair, updateLotUnit, updateDefaultLotSize,
    updateAccountBalance, updateDefaultRiskPct,
    addEntryTag, removeEntryTag,
    addTradeRule, removeTradeRule,
    updateThemeMode, updateAppLockEnabled,
    loadAll,
  } = useSettingsStore();
  const isPremium = usePurchaseStore(s => s.isPremium);
  const restore = usePurchaseStore(s => s.restore);
  const [restoring, setRestoring] = useState(false);

  const [lotInput, setLotInput] = useState(String(settings.lotUnit));
  const [defaultLotInput, setDefaultLotInput] = useState(String(settings.defaultLotSize));
  const [balanceInput, setBalanceInput] = useState(
    settings.accountBalance > 0 ? String(settings.accountBalance) : ''
  );
  const [riskInput, setRiskInput] = useState(String(settings.defaultRiskPct));
  const [showAddPair, setShowAddPair] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newPairName, setNewPairName] = useState('');
  const [newPairDigits, setNewPairDigits] = useState<2 | 4>(2);
  const [newPairIsYen, setNewPairIsYen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newRule, setNewRule] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  // 「いつの時点に戻るのか」を提示できるよう、有無ではなく日時を持つ
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const hasSnapshot = snapshotAt != null;
  // 暗号鍵は端末に紐づくため、機種変更・端末紛失からの復旧手段は手動バックアップだけ。
  // 「最後にいつ取ったか」を常に見せて、危険な状態に気づけるようにする。
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const freshness = backupFreshness(lastBackupAt);

  useEffect(() => {
    getPreImportSnapshot().then(snap => setSnapshotAt(snap?.exportedAt ?? null));
    getLastBackupAt().then(setLastBackupAt).catch(() => {});
  }, []);
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

  const handleSaveDefaultLot = async () => {
    const val = parseDecimal(defaultLotInput);
    if (val == null || val <= 0) { Alert.alert(t('input_error'), t('lot_error')); return; }
    try {
      await updateDefaultLotSize(val);
      Alert.alert(t('saved'), '');
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  const handleSaveBalance = async () => {
    const val = parseDecimal(balanceInput) ?? NaN;
    if (isNaN(val) || val < 0) { Alert.alert(t('input_error'), t('settings_valid_number')); return; }
    try {
      await updateAccountBalance(val);
      // `|| 2` だとリスク0%を設定できず、空欄も黙って2%になっていた
      await updateDefaultRiskPct(parseDecimal(riskInput) ?? 2);
      Alert.alert(t('saved'));
    } catch {
      Alert.alert(t('error'), t('settings_save_error_msg'));
    }
  };

  // 見積もりはMB表示で十分（KB単位の精度は判断に影響しない）
  const formatMB = (bytes: number) => `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;

  const runExportBackup = async (includeImages: boolean) => {
    setBackupLoading(true);
    try {
      const result = await exportBackup({ includeImages });
      // 表示中の「最終バックアップ」を即座に更新する（次回起動まで古いままだと、
      // 取ったのに警告が出続けて「効いていない」ように見える）。
      // **この読み直しの失敗でエクスポートを失敗扱いにしないこと。** DBの読み取りは
      // throw しうるので、外側の catch に流すと「バックアップは取れているのに
      // 失敗しました と出る」ことになり、ユーザーは正しいバックアップを捨ててしまう。
      try {
        setLastBackupAt(await getLastBackupAt());
      } catch {
        // 表示が次回起動まで古いままになるだけ
      }
      // 容量の上限で画像が落ちたことは必ず伝える。黙って落とすと、本人は
      // 画像も残っているつもりで機種変更してしまう。事前の見積もりで伝えていても、
      // 実際に落ちた枚数は結果でしか分からないので、ここでも必ず出す。
      if (result.omittedImages > 0) {
        Alert.alert(
          t('backup_export_partial_title'),
          t('backup_export_partial_msg').replace('{n}', String(result.omittedImages))
        );
      }
    } catch (e) {
      const tooMany = e instanceof Error && e.message === 'too_many_trades';
      Alert.alert(
        t('error'),
        tooMany
          ? t('backup_export_too_many').replace('{n}', String(MAX_TRADES_PER_BACKUP))
          : t('backup_export_error')
      );
    } finally {
      setBackupLoading(false);
    }
  };

  const handleExportBackup = async () => {
    // 画像を読み込む前にファイルサイズだけで見積もる。読み込んでから「入りません
    // でした」では、その読み込み自体でメモリ不足になって何も作れない恐れがある。
    let est: Awaited<ReturnType<typeof estimateBackupImages>> | null = null;
    setBackupLoading(true);
    try {
      est = await estimateBackupImages();
    } catch {
      // 見積もれないときは選択肢を出さず、通常どおり画像込みで作る
    } finally {
      setBackupLoading(false);
    }

    // 画像を持っていない人に選択肢を出しても手間が増えるだけなので、そのまま作る。
    if (!est || est.total === 0) {
      await runExportBackup(true);
      return;
    }

    const overflows = est.omitted > 0;
    const message = overflows
      ? t('backup_export_images_msg_partial')
          .replace('{size}', formatMB(est.rawBytes))
          .replace('{n}', String(est.included))
          .replace('{total}', String(est.total))
      : t('backup_export_images_msg');
    Alert.alert(
      t('backup_export_images_title'),
      message,
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('backup_export_records_only'), onPress: () => { void runExportBackup(false); } },
        {
          text: overflows ? t('backup_export_partial_btn') : t('backup_export_with_images'),
          onPress: () => { void runExportBackup(true); },
        },
      ]
    );
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
                // 復元は settings テーブルと currency_pairs を丸ごと入れ替えるが、
                // zustand ストアには復元前の値が残る。この状態でタグを1つ足すと
                // 各ミューテータが配列全体を書き戻すため、**復元した内容が丸ごと
                // 巻き戻る**。必ず読み直す。
                await loadAll();
                Alert.alert(t('saved'), t('backup_import_success').replace('{n}', String(count)));
                setSnapshotAt(new Date().toISOString());
              }
            } catch (e) {
              const msg = e instanceof Error && e.message === 'empty_backup'
                ? t('backup_import_empty')
                : t('backup_import_error');
              Alert.alert(t('error'), msg);
            } finally {
              setBackupLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRestoreSnapshot = () => {
    // どの時点に戻るのかを必ず示す。示さないと「今日までの記録が消える」
    // ことに気づけないまま実行されてしまう。
    const when = snapshotAt ? new Date(snapshotAt).toLocaleString() : '';
    const body = when
      ? `${t('backup_restore_confirm')}\n\n${t('backup_restore_snapshot_date').replace('{date}', when)}`
      : t('backup_restore_confirm');
    Alert.alert(
      t('backup_restore_snapshot'),
      body,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('backup_restore_snapshot'),
          style: 'destructive',
          onPress: async () => {
            setBackupLoading(true);
            try {
              const count = await restorePreImportSnapshot();
              setSnapshotAt(null);  // 復元でスナップショットは消えるのでボタンも消す
              Alert.alert(t('saved'), t('backup_restore_success').replace('{n}', String(count)));
            } catch {
              Alert.alert(t('error'), t('backup_restore_error'));
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
        // skipped はこれまでどこにも表示されず、500行中480行が失敗しても
        // 「20件インポートしました」としか出なかった。以後の統計が実態と
        // 乖離したまま使われるため、必ずスキップ件数も伝える。
        const msg = t('mt4_import_success').replace('{n}', String(result.imported))
          + (result.skipped > 0
              ? `\n${t('mt4_import_skipped').replace('{n}', String(result.skipped))}`
              : '');
        Alert.alert(t('saved'), msg);
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

  // オンボーディングの「CSVを取り込む」選択から遷移してきた場合、ファイル選択を自動起動する
  const { autoImport } = useLocalSearchParams<{ autoImport?: string }>();
  useEffect(() => {
    if (autoImport === '1') handleMT4Import();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoImport]);

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
            const header = t('csv_header');
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
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const filePath = `${cacheDirectory}fx-trades-${dateStr}.csv`;
            await writeAsStringAsync(filePath, csv, { encoding: 'utf8' });
            // 暗号化DBの投資を無にしないよう、平文の一時ファイルをキャッシュに残さない。
            // **finally で消すこと。** 共有が使えない／共有中に例外が出た経路で消し忘れると、
            // 全トレードの平文CSV（日付・通貨ペア・レート・ロット・損益・反省メモ）が残る。
            try {
              const isAvailable = await Sharing.isAvailableAsync();
              if (!isAvailable) throw new Error('sharing_unavailable');
              await Sharing.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle: t('settings_csv') });
            } finally {
              await deleteAsync(filePath, { idempotent: true }).catch(() => {});
            }
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
        // scheduleReminder は失敗を boolean で返す設計だが、これまで戻り値を
        // 見ておらず、OS側の予約に失敗しても「21:00に通知します」と保存完了を
        // 表示してトグルもONのままだった。通知は永久に来ないのにユーザーは
        // 設定できたと信じてしまう。
        const ok = await scheduleReminder(notifHour, notifMinute);
        if (!ok) { Alert.alert(t('error'), t('settings_notif_schedule_failed')); return; }
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
      if (notifEnabled) {
        const ok = await scheduleReminder(notifHour, notifMinute);
        if (!ok) { Alert.alert(t('error'), t('settings_notif_schedule_failed')); return; }
      }
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

  // 購入の復元はペイウォールにしか無く、再インストールした課金済みユーザーは
  // ロック機能を踏んでペイウォールに到達しないと復元できなかった。
  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const result = await restore();
      if (result === 'success') Alert.alert(t('restore_success_title'), t('restore_success_msg'));
      else if (result === 'no_entitlement') Alert.alert(t('restore_fail_title'), t('restore_fail_msg'));
      else Alert.alert(t('restore_error_title'), t('restore_error_msg'));
    } finally {
      setRestoring(false);
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

        {/* PRO への導線。これが無いと「課金したい」と思ったユーザーが
            自分から購読画面へ行けず、ロック機能を偶然踏むまで辿り着けない。 */}
        {!isPremium ? (
          <TouchableOpacity
            style={styles.proBanner}
            onPress={() => router.push({ pathname: '/paywall', params: { source: 'settings' } })}
            accessibilityRole="button"
            accessibilityLabel={t('settings_upgrade')}
          >
            <Ionicons name="star" size={22} color={C.yellow} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.proBannerTitle}>{t('settings_upgrade')}</Text>
              <Text style={styles.proBannerSub}>{t('settings_upgrade_sub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.text3} />
          </TouchableOpacity>
        ) : (
          <View style={styles.proBanner}>
            <Ionicons name="checkmark-circle" size={22} color={C.win} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.proBannerTitle}>{t('settings_premium_active')}</Text>
            </View>
            <TouchableOpacity
              onPress={handleRestore}
              disabled={restoring}
              accessibilityRole="button"
              accessibilityLabel={t('premium_restore')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.proRestore}>{t('premium_restore')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 実績バッジ */}
        <TouchableOpacity style={styles.exportBtn} onPress={() => router.push('/badges')}>
          <Ionicons name="trophy-outline" size={22} color={C.yellow} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={styles.rowTitleWrap}>
              <Text style={styles.exportTitle}>{t('settings_badges')}</Text>
              {!isPremium && <Text style={styles.proTag}>{t('premium_badge')}</Text>}
            </View>
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
                        locale={t('locale_tag')}
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
                        locale={t('locale_tag')}
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
            <View style={styles.backupStatus}>
              <Ionicons
                name={freshness.state === 'ok' ? 'shield-checkmark-outline' : 'alert-circle-outline'}
                size={18}
                color={freshness.state === 'ok' ? C.win : C.yellow}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.backupStatusTitle}>
                  {freshness.state === 'never'
                    ? t('backup_status_never')
                    : t('backup_status_last').replace('{date}', freshness.at.toLocaleDateString())}
                </Text>
                <Text
                  style={[
                    styles.backupStatusSub,
                    // 注意を促す文面は本文色で出す。テーマの yellow は白背景での
                    // コントラストが 3.4:1 しかなく、小さい文字には使えない。
                    freshness.state !== 'ok' && styles.backupStatusSubAlert,
                  ]}
                >
                  {freshness.state === 'never'
                    ? t('backup_status_never_sub')
                    : freshness.state === 'stale'
                      ? t('backup_status_stale_sub').replace('{n}', String(freshness.days))
                      : t('backup_status_ok_sub')}
                </Text>
              </View>
            </View>
            <View style={styles.backupSep} />
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
            {hasSnapshot && (
              <>
                <View style={styles.backupSep} />
                <TouchableOpacity
                  style={[styles.backupBtn, backupLoading && styles.backupBtnDisabled]}
                  onPress={handleRestoreSnapshot}
                  disabled={backupLoading}
                >
                  {backupLoading ? (
                    <ActivityIndicator size="small" color={C.text2} />
                  ) : (
                    <Ionicons name="arrow-undo-outline" size={20} color={C.text2} />
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.backupBtnTitle}>{t('backup_restore_snapshot')}</Text>
                    <Text style={styles.backupBtnSub}>{t('backup_restore_snapshot_sub')}</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* 資金管理計算機ショートカット */}
        <TouchableOpacity style={styles.calcShortcut} onPress={() => router.push('/calculator')}>
          <Ionicons name="calculator-outline" size={22} color={C.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={styles.rowTitleWrap}>
              <Text style={styles.calcTitle}>{t('settings_calculator')}</Text>
              {!isPremium && <Text style={styles.proTag}>{t('premium_badge')}</Text>}
            </View>
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
            keyboardType="number-pad" placeholder={`${t('eg_prefix')}500000`} placeholderTextColor={C.text3} />
          <Text style={styles.cardLabel}>{t('settings_risk')}</Text>
          <TextInput style={[styles.input, { marginBottom: 14 }]}
            value={riskInput} onChangeText={setRiskInput}
            keyboardType="decimal-pad" placeholder="2" placeholderTextColor={C.text3} />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveBalance}>
            <Text style={styles.primaryBtnText}>{t('save')}</Text>
          </TouchableOpacity>
        </View>

        {/* 目標。日・週・月・年で14項目あり、設定画面に並べると探せなくなるため
            専用画面に分けている。 */}
        <SectionTitle>{t('settings_goals')}</SectionTitle>
        <TouchableOpacity
          style={styles.calcShortcut}
          onPress={() => router.push('/goals')}
          accessibilityRole="button"
          accessibilityLabel={t('settings_goals_link')}
        >
          <Ionicons name="flag-outline" size={20} color={C.primary} />
          <Text style={[styles.calcTitle, { flex: 1, marginLeft: 12 }]}>{t('settings_goals_link')}</Text>
          <Ionicons name="chevron-forward" size={18} color={C.text3} />
        </TouchableOpacity>

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

          {/* 既定ロット。クイック入力のロット欄の初期値になる。
              これが入ることで、記録するたびに損益が計算されるようになる。 */}
          <Text style={[styles.cardLabel, { marginTop: 16 }]}>{t('settings_default_lot')}</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]}
              value={defaultLotInput} onChangeText={setDefaultLotInput}
              keyboardType="decimal-pad" placeholder="0.1" placeholderTextColor={C.text3}
              accessibilityLabel={t('settings_default_lot')} />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveDefaultLot}>
              <Text style={styles.primaryBtnText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.noteText}>{t('settings_default_lot_note')}</Text>
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
              placeholder={`${t('eg_prefix')}NZD/JPY`} placeholderTextColor={C.text3} autoCapitalize="characters" />
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

        {/* サポート・法的情報 */}
        <SectionTitle>{t('settings_about')}</SectionTitle>
        <View style={styles.listCard}>
          <TouchableOpacity style={[styles.pairRow, styles.pairBorder]} onPress={() => openExternalUrl(CONTACT_MAILTO_URL, CONTACT_EMAIL)}>
            <Text style={styles.pairName}>{t('settings_contact')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pairRow, styles.pairBorder]} onPress={() => openExternalUrl(PRIVACY_POLICY_URL)}>
            <Text style={styles.pairName}>{t('settings_privacy')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pairRow, styles.pairBorder]} onPress={() => openExternalUrl(TERMS_URL)}>
            <Text style={styles.pairName}>{t('settings_terms')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.text3} />
          </TouchableOpacity>
          {TOKUSHOHO_URL && (
            <TouchableOpacity style={[styles.pairRow, styles.pairBorder]} onPress={() => openExternalUrl(TOKUSHOHO_URL as string)}>
              <Text style={styles.pairName}>{t('settings_tokushoho')}</Text>
              <Ionicons name="chevron-forward" size={16} color={C.text3} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.pairRow}
            onPress={() => openExternalUrl(SUBSCRIPTIONS_URL)}
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
    proBanner: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.card, borderRadius: 14, padding: 16,
      borderWidth: 1.5, borderColor: C.yellow + '70', marginBottom: 12,
    },
    proBannerTitle: { fontSize: 15, fontWeight: '800', color: C.text },
    proBannerSub: { fontSize: 12, color: C.text2, marginTop: 2 },
    proRestore: { fontSize: 12, fontWeight: '700', color: C.primary },
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
    noteText: { color: C.text3, fontSize: 12, marginTop: 8, lineHeight: 17 },
    row: { flexDirection: 'row', alignItems: 'center' },
    input: { backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 11, fontSize: 15, color: C.text },
    primaryBtn: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center' },
    primaryBtnText: { color: C.onAccent, fontWeight: '700', fontSize: 14 },
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
    rowTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    proTag: { fontSize: 10, fontWeight: '800', color: C.primary, letterSpacing: 1, backgroundColor: C.primary + '18', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    notifNote: { fontSize: 13, color: C.text2, lineHeight: 20 },
    notifRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    notifLabel: { fontSize: 14, color: C.text },
    notifTimeRow: { marginTop: 4 },
    notifTimeInputs: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    notifTimeTouchable: { backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    notifTimeText: { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: 1 },
    notifSaveBtn: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
    notifSaveBtnText: { color: C.onAccent, fontWeight: '700', fontSize: 13 },
    backupStatus: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 },
    backupStatusTitle: { fontSize: 13, fontWeight: '600', color: C.text },
    backupStatusSub: { fontSize: 12, color: C.text2, marginTop: 2, lineHeight: 17 },
    backupStatusSubAlert: { color: C.text },
    backupBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    backupBtnDisabled: { opacity: 0.5 },
    backupBtnTitle: { fontSize: 14, fontWeight: '600', color: C.text },
    backupBtnSub: { fontSize: 12, color: C.text2, marginTop: 2 },
    backupSep: { height: 1, backgroundColor: C.border },
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

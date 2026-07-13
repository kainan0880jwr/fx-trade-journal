import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Platform, KeyboardAvoidingView, Image
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { saveTradeImages } from '../../src/utils/imageStorage';
import { useTradeStore } from '../../src/store/tradeStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { usePurchaseStore } from '../../src/store/purchaseStore';
import { calcPips } from '../../src/utils/pipsCalc';
import { calcProfitLoss, determineResult } from '../../src/utils/profitCalc';
import { generateId } from '../../src/utils/statsCalc';
import { updateRecordStreak } from '../../src/db/queries';
import { useReviewPrompt } from '../../src/hooks/useReviewPrompt';
import { useTheme } from '../../src/theme/useTheme';
import type { ThemeColors } from '../../src/theme/colors';
import { t } from '../../src/i18n';
import type { Trade, Direction, TradeStyle, TradeResult } from '../../src/types';

type InputMode = 'quick' | 'full';

function toLocalISOString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const STYLES = (): { label: string; value: TradeStyle }[] => [
  { label: t('style_scalp_short'), value: 'scalping' },
  { label: t('style_day_short'), value: 'day' },
  { label: t('style_swing'), value: 'swing' },
  { label: t('style_other'), value: 'other' },
];

function calcPlannedRR(dir: Direction, entry: number, sl: number | null, tp: number | null): number | null {
  if (!sl || !tp || sl <= 0 || tp <= 0) return null;
  const slPips = Math.abs(dir === 'buy' ? entry - sl : sl - entry);
  const tpPips = Math.abs(dir === 'buy' ? tp - entry : entry - tp);
  if (slPips === 0) return null;
  return Math.round((tpPips / slPips) * 100) / 100;
}

export default function NewTradeScreen() {
  const C = useTheme();
  const styles = makeStyles(C);
  const navigation = useNavigation();
  const { addTrade } = useTradeStore();
  const { pairs, settings, entryTags, tradeRules } = useSettingsStore();
  const isPremium = usePurchaseStore(s => s.isPremium);
  const imageLimit = isPremium ? 3 : 1;
  const promptReviewIfNeeded = useReviewPrompt();

  const [mode, setMode] = useState<InputMode>('quick');
  const [saving, setSaving] = useState(false);

  // 共通フィールド
  const [pair, setPair] = useState(pairs[0]?.name ?? 'USD/JPY');
  const [direction, setDirection] = useState<Direction>('buy');

  // クイックモード専用
  const [quickResult, setQuickResult] = useState<TradeResult | null>(null);
  const [quickPips, setQuickPips] = useState('');

  // フルモード専用
  const [dateObj, setDateObj] = useState(new Date());
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const _lp = (n: number) => String(n).padStart(2, '0');
  const date = `${dateObj.getFullYear()}-${_lp(dateObj.getMonth() + 1)}-${_lp(dateObj.getDate())}`;
  const time = `${_lp(dateObj.getHours())}:${_lp(dateObj.getMinutes())}`;

  const handlePickerChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setPickerMode(null);
    if (!selected) return;
    if (pickerMode === 'date') {
      const d = new Date(selected);
      d.setHours(dateObj.getHours(), dateObj.getMinutes(), 0, 0);
      setDateObj(d);
    } else {
      const d = new Date(dateObj);
      d.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setDateObj(d);
    }
  };

  const [entryRate, setEntryRate] = useState('');
  const [exitRate, setExitRate] = useState('');
  const [stopLossStr, setStopLossStr] = useState('');
  const [takeProfitStr, setTakeProfitStr] = useState('');
  const [lotSize, setLotSize] = useState('0.1');
  const [style, setStyle] = useState<TradeStyle>(
    (['scalping', 'day', 'swing', 'other'].includes(settings.defaultStyle)
      ? settings.defaultStyle as TradeStyle : 'day')
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [reflection, setReflection] = useState('');
  const [selfRating, setSelfRating] = useState(3);
  const [mentalFocus, setMentalFocus] = useState<number | null>(null);
  const [mentalCalm, setMentalCalm] = useState<number | null>(null);
  const [mentalFear, setMentalFear] = useState<number | null>(null);
  const [ruleChecks, setRuleChecks] = useState<string[]>([]);
  const [tfWeekly, setTfWeekly] = useState('');
  const [tfDaily, setTfDaily] = useState('');
  const [tf4h, setTf4h] = useState('');
  const [tf1h, setTf1h] = useState('');

  // Progressive Disclosure の開閉状態
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [showTF, setShowTF] = useState(false);

  // フルモード計算
  const selectedPair = pairs.find(p => p.name === pair);
  const pipDigits = selectedPair?.pipDigits ?? 2;
  const isYenPair = selectedPair?.isYenPair ?? false;
  const entry = parseFloat(entryRate);
  const exit = parseFloat(exitRate);
  const _sl = parseFloat(stopLossStr);
  const sl = stopLossStr.trim() && !isNaN(_sl) ? _sl : null;
  const _tp = parseFloat(takeProfitStr);
  const tp = takeProfitStr.trim() && !isNaN(_tp) ? _tp : null;
  const lot = parseFloat(lotSize);
  const canCalc = !isNaN(entry) && !isNaN(exit) && entry > 0 && exit > 0;
  const pips = canCalc ? calcPips(direction, entry, exit, pipDigits) : null;
  const profitLoss = (canCalc && pips != null && isYenPair && !isNaN(lot) && lot > 0)
    ? calcProfitLoss(pips, lot, settings.lotUnit) : null;
  const plannedRR = canCalc ? calcPlannedRR(direction, entry, sl, tp) : null;
  const pipsColor = pips == null ? C.text2 : pips > 0 ? C.win : pips < 0 ? C.loss : C.even;

  // ──────────────────────────────────────────────
  // 未保存破棄ガード
  // クイック: pips入力 or 結果選択済み
  // フル: レート・メモ・画像のいずれか入力済み
  // ──────────────────────────────────────────────
  const isDirty = useMemo(() => {
    if (mode === 'quick') return quickPips !== '' || quickResult !== null;
    return entryRate !== '' || exitRate !== '' || reflection !== '' || imageUris.length > 0;
  }, [mode, quickPips, quickResult, entryRate, exitRate, reflection, imageUris]);

  // 保存成功後、OKタップ→router.back()までの間にsavingがfalseへ戻るため、
  // isDirty判定だけに頼ると保存済みでも破棄確認が誤って出てしまう。そのためのフラグ。
  const justSavedRef = useRef(false);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirty || saving || justSavedRef.current) return; // 未入力・保存中・保存済みは通す
      e.preventDefault();
      Alert.alert(
        t('discard_title'),
        t('discard_message'),
        [
          { text: t('discard_cancel'), style: 'cancel' },
          {
            text: t('discard_confirm'),
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    });
    return unsub;
  }, [navigation, isDirty, saving]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const pickImages = async () => {
    if (imageUris.length >= imageLimit) { Alert.alert(t('max_images_alert')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: imageLimit - imageUris.length,
      quality: 0.8,
    });
    if (!result.canceled) {
      setImageUris(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, imageLimit));
    }
  };

  const saveAndClose = async (trade: Trade) => {
    try {
      await addTrade(trade);
      justSavedRef.current = true;
      const streak = await updateRecordStreak();
      const msg = streak <= 1
        ? t('form_quick_saved_first')
        : `${streak}${t('form_quick_saved_streak')}`;
      Alert.alert('', msg, [{ text: 'OK', onPress: () => router.back() }]);
      // 保存後にレビュー促進チェック（10件・30件・100件マイルストーン）
      await promptReviewIfNeeded();
    } catch {
      Alert.alert(t('save_error'), t('save_error_msg'));
    }
  };

  // ── クイック保存 ──
  const handleQuickSave = async () => {
    if (!quickResult) { Alert.alert(t('input_error'), t('form_result')); return; }
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date();
      const isoDate = toLocalISOString(now);
      const parsedPips = quickPips.trim() ? parseFloat(quickPips) : null;
      const tradeId = generateId();
      const trade: Trade = {
        id: tradeId,
        date: isoDate,
        pair, direction,
        entryRate: null, exitRate: null,
        stopLoss: null, takeProfit: null, plannedRR: null,
        lotSize: 0.1,
        style: settings.defaultStyle as TradeStyle || 'day',
        tags: [], imageUris: [],
        entryMethod: 'quick',
        pips: parsedPips,
        profitLoss: null,
        result: quickResult,
        reflection: '', selfRating: 3,
        bookmarked: false,
        mentalFocus: null, mentalCalm: null, mentalFear: null,
        ruleChecks: [], tfWeekly: '', tfDaily: '', tf4h: '', tf1h: '',
        createdAt: now.toISOString(),
      };
      await saveAndClose(trade);
    } finally {
      setSaving(false);
    }
  };

  // ── フル保存 ──
  const handleFullSave = async () => {
    if (!canCalc) { Alert.alert(t('input_error'), t('rate_error')); return; }
    if (isNaN(lot) || lot <= 0) { Alert.alert(t('input_error'), t('lot_error')); return; }
    if (saving) return;
    setSaving(true);
    try {
      const finalPips = pips ?? calcPips(direction, entry, exit, pipDigits);
      const tradeId = generateId();
      let persistedUris = imageUris;
      try {
        persistedUris = await saveTradeImages(imageUris, tradeId);
      } catch {
        Alert.alert(t('image_save_error'), t('image_save_error_msg'));
      }
      const trade: Trade = {
        id: tradeId,
        date: `${date}T${time}:00`.slice(0, 19),
        pair, direction,
        entryRate: entry, exitRate: exit,
        stopLoss: sl, takeProfit: tp, plannedRR,
        lotSize: lot, style,
        tags: selectedTags, imageUris: persistedUris,
        entryMethod: 'full',
        pips: finalPips, profitLoss,
        result: determineResult(finalPips),
        reflection, selfRating,
        bookmarked: false,
        mentalFocus, mentalCalm, mentalFear, ruleChecks,
        tfWeekly, tfDaily, tf4h, tf1h,
        createdAt: new Date().toISOString(),
      };
      await saveAndClose(trade);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* ── モード切替 ── */}
        <View style={styles.modeBar}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'quick' && styles.modeBtnActive]}
            onPress={() => setMode('quick')}
          >
            <Ionicons name="flash" size={14} color={mode === 'quick' ? '#FFF' : C.text2} />
            <Text style={[styles.modeBtnText, mode === 'quick' && styles.modeBtnTextActive]}>
              {t('form_mode_quick')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'full' && styles.modeBtnActive]}
            onPress={() => setMode('full')}
          >
            <Ionicons name="document-text" size={14} color={mode === 'full' ? '#FFF' : C.text2} />
            <Text style={[styles.modeBtnText, mode === 'full' && styles.modeBtnTextActive]}>
              {t('form_mode_full')}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {mode === 'quick' ? (
            /* ══════════════ クイックモード ══════════════ */
            <>
              {/* 通貨ペア */}
              <Label>{t('form_pair')}</Label>
              <View style={styles.chipRow}>
                {pairs.slice(0, 4).map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chip, pair === p.name && styles.chipActive]}
                    onPress={() => setPair(p.name)}
                  >
                    <Text style={[styles.chipLabel, pair === p.name && styles.chipLabelActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                {pairs.length > 4 && (
                  <TouchableOpacity
                    style={[styles.chip, !pairs.slice(0, 4).some(p => p.name === pair) && styles.chipActive]}
                    onPress={() => setMode('full')}
                  >
                    <Text style={[styles.chipLabel, !pairs.slice(0, 4).some(p => p.name === pair) && styles.chipLabelActive]}>
                      {t('other')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 売買方向 */}
              <Label>{t('form_direction')}</Label>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.dirBtn, direction === 'buy' && styles.buyActive]}
                  onPress={() => setDirection('buy')}
                >
                  <Text style={[styles.dirLabel, direction === 'buy' && { color: C.buy, fontWeight: '700' }]}>
                    {t('buy_label')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dirBtn, direction === 'sell' && styles.sellActive]}
                  onPress={() => setDirection('sell')}
                >
                  <Text style={[styles.dirLabel, direction === 'sell' && { color: C.sell, fontWeight: '700' }]}>
                    {t('sell_label')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 結果 */}
              <Label>{t('form_result')}</Label>
              <View style={styles.row}>
                {(['win', 'loss', 'even'] as TradeResult[]).map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.resultBtn,
                      quickResult === r && (
                        r === 'win' ? styles.resultBtnWin
                        : r === 'loss' ? styles.resultBtnLoss
                        : styles.resultBtnEven
                      ),
                    ]}
                    onPress={() => setQuickResult(r)}
                  >
                    <Text style={[
                      styles.resultBtnText,
                      quickResult === r && { color: '#FFF', fontWeight: '800' },
                    ]}>
                      {r === 'win' ? t('win') : r === 'loss' ? t('loss') : t('even')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* pips（任意） */}
              <Label>{t('form_pips_optional')}</Label>
              <View style={styles.pipsRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={quickPips}
                  onChangeText={setQuickPips}
                  keyboardType="decimal-pad"
                  placeholder="20.5"
                  placeholderTextColor={C.text3}
                />
                <Text style={styles.pipsUnit}>pips</Text>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, (!quickResult || saving) && styles.saveBtnDisabled]}
                onPress={handleQuickSave}
                activeOpacity={0.85}
                disabled={!quickResult || saving}
              >
                <Text style={styles.saveBtnText}>{t('form_save')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ══════════════ フルモード ══════════════ */
            <>
              {/* 日時 */}
              <Label>{t('form_datetime')}</Label>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.input, styles.dateBtn, { flex: 1, marginRight: 8 }]}
                  onPress={() => setPickerMode('date')}
                >
                  <Ionicons name="calendar-outline" size={15} color={C.text2} />
                  <Text style={styles.dateBtnText}>{date}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.input, styles.dateBtn, { width: 90 }]}
                  onPress={() => setPickerMode('time')}
                >
                  <Ionicons name="time-outline" size={15} color={C.text2} />
                  <Text style={styles.dateBtnText}>{time}</Text>
                </TouchableOpacity>
              </View>
              {pickerMode !== null && (
                <>
                  <DateTimePicker
                    value={dateObj}
                    mode={pickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handlePickerChange}
                    locale="ja-JP"
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setPickerMode(null)}>
                      <Text style={styles.pickerDoneText}>{t('picker_done')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* 通貨ペア */}
              <Label>{t('form_pair')}</Label>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={pair} onValueChange={setPair}
                  style={{ color: C.text }} itemStyle={{ color: C.text, backgroundColor: C.card }}>
                  {pairs.map(p => <Picker.Item key={p.id} label={p.name} value={p.name} />)}
                </Picker>
              </View>

              {/* 売買方向 */}
              <Label>{t('form_direction')}</Label>
              <View style={styles.row}>
                <TouchableOpacity style={[styles.dirBtn, direction === 'buy' && styles.buyActive]}
                  onPress={() => setDirection('buy')}>
                  <Text style={[styles.dirLabel, direction === 'buy' && { color: C.buy, fontWeight: '700' }]}>{t('buy_label')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dirBtn, direction === 'sell' && styles.sellActive]}
                  onPress={() => setDirection('sell')}>
                  <Text style={[styles.dirLabel, direction === 'sell' && { color: C.sell, fontWeight: '700' }]}>{t('sell_label')}</Text>
                </TouchableOpacity>
              </View>

              {/* レート */}
              <Label>{t('form_rate')}</Label>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.rateLabel}>{t('form_entry')}</Text>
                  <TextInput style={styles.input} value={entryRate} onChangeText={setEntryRate}
                    keyboardType="decimal-pad" placeholder="155.000" placeholderTextColor={C.text3} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rateLabel}>{t('form_exit')}</Text>
                  <TextInput style={styles.input} value={exitRate} onChangeText={setExitRate}
                    keyboardType="decimal-pad" placeholder="155.200" placeholderTextColor={C.text3} />
                </View>
              </View>

              {/* 計算結果 */}
              <View style={styles.calcBox}>
                <View style={styles.calcItem}>
                  <Text style={styles.calcLabel}>pips</Text>
                  <Text style={[styles.calcValue, { color: pipsColor }]}>
                    {pips != null ? `${pips > 0 ? '+' : ''}${pips}` : '-'}
                  </Text>
                </View>
                {isYenPair && (
                  <View style={styles.calcItem}>
                    <Text style={styles.calcLabel}>{t('form_pl')}</Text>
                    <Text style={[styles.calcValue, { color: pipsColor }]}>
                      {profitLoss != null ? `${profitLoss > 0 ? '+' : ''}${profitLoss.toLocaleString()}¥` : '-'}
                    </Text>
                  </View>
                )}
                {plannedRR != null && (
                  <View style={styles.calcItem}>
                    <Text style={styles.calcLabel}>{t('form_planned_rr')}</Text>
                    <Text style={[styles.calcValue, { color: C.primary }]}>1:{plannedRR}</Text>
                  </View>
                )}
              </View>

              {/* ロット */}
              <Label>{t('form_lot')}</Label>
              <TextInput style={styles.input} value={lotSize} onChangeText={setLotSize}
                keyboardType="decimal-pad" placeholder="0.1" placeholderTextColor={C.text3} />

              {/* ── 詳細セクション（Progressive Disclosure）── */}
              <TouchableOpacity style={styles.sectionToggle} onPress={() => setDetailsOpen(v => !v)}>
                <Text style={styles.sectionToggleText}>
                  {detailsOpen ? t('form_details_collapse') : t('form_details_expand')}
                </Text>
                <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.primary} />
              </TouchableOpacity>

              {detailsOpen && (
                <>
                  {/* SL/TP */}
                  <Label>{t('form_sl_tp')}</Label>
                  <View style={styles.row}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.rateLabel}>{t('form_sl')}</Text>
                      <TextInput style={[styles.input, { borderColor: C.loss + '80' }]}
                        value={stopLossStr} onChangeText={setStopLossStr}
                        keyboardType="decimal-pad" placeholder="154.700" placeholderTextColor={C.text3} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rateLabel}>{t('form_tp')}</Text>
                      <TextInput style={[styles.input, { borderColor: C.win + '80' }]}
                        value={takeProfitStr} onChangeText={setTakeProfitStr}
                        keyboardType="decimal-pad" placeholder="155.600" placeholderTextColor={C.text3} />
                    </View>
                  </View>

                  {/* スタイル */}
                  <Label>{t('form_style')}</Label>
                  <View style={styles.chipRow}>
                    {STYLES().map(s => (
                      <TouchableOpacity key={s.value}
                        style={[styles.chip, style === s.value && styles.chipActive]}
                        onPress={() => setStyle(s.value)}>
                        <Text style={[styles.chipLabel, style === s.value && styles.chipLabelActive]}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* タグ */}
                  {entryTags.length > 0 && (
                    <>
                      <Label>{t('form_tags')}</Label>
                      <View style={styles.chipRow}>
                        {entryTags.map(tag => (
                          <TouchableOpacity key={tag}
                            style={[styles.chip, selectedTags.includes(tag) && styles.tagActive]}
                            onPress={() => toggleTag(tag)}>
                            <Text style={[styles.chipLabel, selectedTags.includes(tag) && styles.chipLabelActive]}>{tag}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {/* 画像 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={styles.label}>{t('form_images')}</Text>
                    {!isPremium && <Text style={styles.proTag}>{t('premium_badge')}</Text>}
                  </View>
                  <View style={styles.imageRow}>
                    {imageUris.map((uri, i) => (
                      <View key={i} style={styles.thumbWrap}>
                        <Image source={{ uri }} style={styles.thumb} />
                        <TouchableOpacity style={styles.thumbRemove} onPress={() => setImageUris(prev => prev.filter((_, j) => j !== i))}>
                          <Ionicons name="close-circle" size={20} color={C.loss} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {imageUris.length < imageLimit && (
                      <TouchableOpacity style={styles.addImageBtn} onPress={pickImages}>
                        <Ionicons name="camera-outline" size={26} color={C.text2} />
                        <Text style={styles.addImageLabel}>{t('add')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* 反省 */}
                  <Label>{t('form_reflection')}</Label>
                  <TextInput style={[styles.input, styles.textArea]}
                    value={reflection} onChangeText={setReflection}
                    multiline numberOfLines={4}
                    placeholder={t('form_reflection_placeholder')}
                    placeholderTextColor={C.text3} textAlignVertical="top" />

                  {/* 自己評価 */}
                  <Label>{t('form_rating')}</Label>
                  <View style={styles.starsRow}>
                    {[1,2,3,4,5].map(n => (
                      <TouchableOpacity key={n} onPress={() => setSelfRating(n)} style={styles.starBtn}>
                        <Ionicons name="star" size={32} color={n <= selfRating ? C.yellow : C.border} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* ── プレミアム機能（Progressive Disclosure）── */}
              {isPremium && (
                <TouchableOpacity style={styles.sectionToggle} onPress={() => setPremiumOpen(v => !v)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="star" size={13} color={C.yellow} />
                    <Text style={styles.sectionToggleText}>{t('form_premium_section')}</Text>
                  </View>
                  <Ionicons name={premiumOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.primary} />
                </TouchableOpacity>
              )}

              {isPremium && premiumOpen && (
                <>
                  {/* MTF メモ */}
                  <TouchableOpacity style={styles.tfHeader} onPress={() => setShowTF(!showTF)}>
                    <Text style={styles.label}>{t('form_tf')}</Text>
                    <Ionicons name={showTF ? 'chevron-up' : 'chevron-down'} size={18} color={C.text2} />
                  </TouchableOpacity>
                  {showTF && (
                    <View style={styles.tfCard}>
                      {([
                        { label: t('tf_weekly'), value: tfWeekly, setter: setTfWeekly, placeholder: t('form_tf_weekly_placeholder') },
                        { label: t('tf_daily'), value: tfDaily, setter: setTfDaily, placeholder: t('form_tf_daily_placeholder') },
                        { label: t('tf_4h'), value: tf4h, setter: setTf4h, placeholder: t('form_tf_4h_placeholder') },
                        { label: t('tf_1h'), value: tf1h, setter: setTf1h, placeholder: t('form_tf_1h_placeholder') },
                      ] as const).map(tf => (
                        <View key={tf.label} style={styles.tfRow}>
                          <Text style={styles.tfLabel}>{tf.label}</Text>
                          <TextInput style={[styles.input, styles.tfInput]} value={tf.value}
                            onChangeText={tf.setter} placeholder={tf.placeholder}
                            placeholderTextColor={C.text3} multiline />
                        </View>
                      ))}
                    </View>
                  )}

                  {/* メンタル */}
                  <Label>{t('form_mental')}</Label>
                  <View style={styles.mentalCard}>
                    <MentalRow label={t('mental_focus')} value={mentalFocus} onChange={setMentalFocus} positiveHigh />
                    <MentalRow label={t('mental_calm')} value={mentalCalm} onChange={setMentalCalm} positiveHigh />
                    <MentalRow label={t('mental_fear')} value={mentalFear} onChange={setMentalFear} positiveHigh={false} />
                  </View>

                  {/* ルール */}
                  {tradeRules.length > 0 && (
                    <>
                      <Label>{t('form_rules')}</Label>
                      <View style={styles.ruleList}>
                        {tradeRules.map(rule => {
                          const checked = ruleChecks.includes(rule);
                          return (
                            <TouchableOpacity key={rule} style={styles.ruleRow}
                              onPress={() => setRuleChecks(prev =>
                                prev.includes(rule) ? prev.filter(r => r !== rule) : [...prev, rule]
                              )}>
                              <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22}
                                color={checked ? C.win : C.text3} />
                              <Text style={[styles.ruleLabel, checked && { color: C.text }]}>{rule}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}
                </>
              )}

              {!isPremium && (
                <TouchableOpacity style={styles.premiumHint} onPress={() => router.push('/paywall')}>
                  <Ionicons name="star" size={14} color={C.yellow} />
                  <Text style={styles.premiumHintText}>{t('form_premium_hint')}</Text>
                  <Ionicons name="chevron-forward" size={14} color={C.primary} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleFullSave}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{t('form_save')}</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  const C = useTheme();
  return (
    <Text style={{
      fontSize: 12, fontWeight: '700', color: C.text3,
      marginTop: 20, marginBottom: 8, letterSpacing: 0.8, textTransform: 'uppercase',
    }}>
      {children}
    </Text>
  );
}

function MentalRow({ label, value, onChange, positiveHigh }: {
  label: string; value: number | null;
  onChange: (v: number | null) => void; positiveHigh: boolean;
}) {
  const C = useTheme();
  const color = (n: number) => {
    if (value !== n) return C.border;
    if (positiveHigh) return n >= 4 ? C.win : n <= 2 ? C.loss : C.yellow;
    return n >= 4 ? C.loss : n <= 2 ? C.win : C.yellow;
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.text2, width: 56 }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity key={n}
            style={{ width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: color(n), backgroundColor: value === n ? color(n) + '30' : 'transparent' }}
            onPress={() => onChange(value === n ? null : n)}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: value === n ? color(n) : C.text3 }}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    scroll: { padding: 14, paddingTop: 10 },
    label: { fontSize: 12, fontWeight: '700', color: C.text3, marginTop: 20, marginBottom: 8, letterSpacing: 0.8, textTransform: 'uppercase' },

    modeBar: {
      flexDirection: 'row', margin: 14, marginBottom: 0,
      backgroundColor: C.card,
      borderRadius: 12, borderWidth: 1, borderColor: C.border,
      padding: 4, gap: 4,
    },
    modeBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 10, borderRadius: 10, gap: 6,
    },
    modeBtnActive: { backgroundColor: C.primary },
    modeBtnText: { fontSize: 13, fontWeight: '700', color: C.text2 },
    modeBtnTextActive: { color: '#FFF' },

    input: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 13, fontSize: 15, color: C.text },
    textArea: { minHeight: 90 },
    row: { flexDirection: 'row' },
    rateLabel: { fontSize: 11, color: C.text2, marginBottom: 5, fontWeight: '600' },
    pickerWrap: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
    dirBtn: { flex: 1, paddingVertical: 15, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', backgroundColor: C.card, marginHorizontal: 4 },
    buyActive: { backgroundColor: C.winBg, borderColor: C.buy },
    sellActive: { backgroundColor: C.lossBg, borderColor: C.sell },
    dirLabel: { fontSize: 14, fontWeight: '700', color: C.text2 },

    resultBtn: { flex: 1, paddingVertical: 18, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', backgroundColor: C.card, marginHorizontal: 4 },
    resultBtnWin: { backgroundColor: C.winBg, borderColor: C.win },
    resultBtnLoss: { backgroundColor: C.lossBg, borderColor: C.loss },
    resultBtnEven: { backgroundColor: C.primary + '20', borderColor: C.primary },
    resultBtnText: { fontSize: 16, fontWeight: '700', color: C.text2 },

    pipsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pipsUnit: { fontSize: 14, color: C.text2, fontWeight: '600' },

    calcBox: { flexDirection: 'row', backgroundColor: C.cardAlt, borderRadius: 14, padding: 16, marginTop: 8, gap: 8, borderWidth: 1, borderColor: C.border },
    calcItem: { flex: 1, alignItems: 'center' },
    calcLabel: { fontSize: 10, color: C.text3, marginBottom: 4, letterSpacing: 0.5 },
    calcValue: { fontSize: 22, fontWeight: '900' },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
    chipActive: { backgroundColor: C.primary, borderColor: C.primary },
    tagActive: { backgroundColor: C.purple, borderColor: C.purple },
    chipLabel: { fontSize: 13, color: C.text2 },
    chipLabelActive: { color: '#FFFFFF', fontWeight: '700' },

    sectionToggle: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 20, paddingVertical: 14, paddingHorizontal: 16,
      backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    },
    sectionToggleText: { fontSize: 14, fontWeight: '700', color: C.primary },

    imageRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    thumbWrap: { position: 'relative' },
    thumb: { width: 90, height: 90, borderRadius: 12, backgroundColor: C.card },
    thumbRemove: { position: 'absolute', top: -6, right: -6 },
    addImageBtn: { width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
    addImageLabel: { fontSize: 11, color: C.text2 },

    starsRow: { flexDirection: 'row', gap: 8 },
    starBtn: { padding: 4 },

    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-start' },
    dateBtnText: { fontSize: 15, color: C.text },
    pickerDoneBtn: { alignSelf: 'flex-end', backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
    pickerDoneText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

    saveBtn: {
      backgroundColor: C.primary, borderRadius: 16, padding: 18,
      alignItems: 'center', marginTop: 32,
      shadowColor: C.primary, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

    mentalCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, gap: 12 },
    ruleList: { backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 4, borderWidth: 1, borderColor: C.border },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
    ruleLabel: { fontSize: 14, color: C.text2, flex: 1 },
    tfHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
    tfCard: { backgroundColor: C.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border, gap: 10, marginTop: 8 },
    tfRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    tfLabel: { width: 44, fontSize: 12, fontWeight: '700', color: C.primary, paddingTop: 13 },
    tfInput: { flex: 1, minHeight: 44 },
    proTag: { fontSize: 10, fontWeight: '800', color: C.primary, letterSpacing: 1, backgroundColor: C.primary + '18', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    premiumHint: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20,
      padding: 14, backgroundColor: C.card, borderRadius: 12,
      borderWidth: 1, borderColor: C.border,
    },
    premiumHintText: { flex: 1, fontSize: 12, color: C.text2 },
  });
}

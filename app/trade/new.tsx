import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Platform, KeyboardAvoidingView, Image, ActivityIndicator
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useNavigation, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { saveTradeImages, resolveImageUri } from '../../src/utils/imageStorage';
import { useTradeStore } from '../../src/store/tradeStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { usePurchaseStore } from '../../src/store/purchaseStore';
import { calcPips, signedQuickPips, signedByResult } from '../../src/utils/pipsCalc';
import { calcProfitLoss, determineResult } from '../../src/utils/profitCalc';
import { generateId } from '../../src/utils/statsCalc';
import { getTradeById, updateRecordStreak, getAllCurrencyPairs } from '../../src/db/queries';
import { useReviewPrompt } from '../../src/hooks/useReviewPrompt';
import { useAppLockPrompt } from '../../src/hooks/useAppLockPrompt';
import { recordFirstTradeSaved } from '../../src/utils/retentionEvents';
import { closeScreen } from '../../src/utils/closeScreen';
import { useTheme } from '../../src/theme/useTheme';
import type { ThemeColors } from '../../src/theme/colors';
import { t } from '../../src/i18n';
import type { Trade, Direction, TradeStyle, TradeResult } from '../../src/types';
import { parseDecimal } from '../../src/utils/parseDecimal';
import { formatMoney, moneySuffix } from '../../src/utils/formatMoney';

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
  const { addTrade, editTrade } = useTradeStore();
  const { pairs, settings, entryTags, tradeRules } = useSettingsStore();
  const isPremium = usePurchaseStore(s => s.isPremium);
  const imageLimit = isPremium ? 3 : 1;
  const promptReviewIfNeeded = useReviewPrompt();
  const promptAppLockIfNeeded = useAppLockPrompt();

  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const isEditMode = !!editId;
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  // 編集対象が見つからない/読めなかった場合。編集を続行させると重複レコードを生む。
  const [loadFailed, setLoadFailed] = useState(false);
  // 編集元トレードのスナップショット。id/createdAt/bookmarkedの保持と、
  // 編集モードでのisDirty判定（初期値との比較）に使う。
  const originalTradeRef = useRef<Trade | null>(null);

  const [mode, setMode] = useState<InputMode>('quick');
  const [saving, setSaving] = useState(false);

  // 共通フィールド
  const [pair, setPair] = useState(pairs[0]?.name ?? 'USD/JPY');
  const [direction, setDirection] = useState<Direction>('buy');

  // クイックモード専用
  const [quickResult, setQuickResult] = useState<TradeResult | null>(null);
  const [quickPips, setQuickPips] = useState('');
  // クイック入力でもロットを受け取り損益を計算する。
  // 以前は lotSize が 0.1 固定・profitLoss が常に null だったため、
  // 「合計pipsは全件、損益合計は詳細入力の数件だけ」という別母集団の
  // 数値が並び、合計pipsがマイナスなのに損益合計がプラス、という
  // 矛盾が実機で発生していた。
  const [quickLot, setQuickLot] = useState('');
  // クロス円以外は円換算できないため、証券会社の画面に出ている実額を
  // そのまま入れてもらう。推定レートで換算すると静かに間違った金額になる。
  const [quickPL, setQuickPL] = useState('');

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

  // 編集モード: 既存トレードを読み込んでフォームへ反映する。
  // クイック/フルの入力構造がそれぞれ異なるため、記録時と同じモードで開く
  // （モード切替UIは編集中は表示しない）。
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    getTradeById(editId).then(tr => {
      if (cancelled) return;
      if (!tr) {
        // 以前はここで return して setLoadingExisting(false) に到達せず、
        // 編集画面がスピナーのまま永久に固まっていた（戻る以外に操作不能）。
        setLoadingExisting(false);
        setLoadFailed(true);
        return;
      }
      originalTradeRef.current = tr;
      setMode(tr.entryMethod === 'quick' ? 'quick' : 'full');
      setPair(tr.pair);
      setDirection(tr.direction);
      setQuickResult(tr.result);
      // 符号は結果セレクタが決めるため、入力欄には絶対値を出す
      setQuickPips(tr.pips != null ? String(Math.abs(tr.pips)) : '');
      setQuickLot(String(tr.lotSize));
      // 符号は結果セレクタが決めるため、入力欄には絶対値を出す（pipsと同じ扱い）
      setQuickPL(tr.profitLoss != null ? String(Math.abs(tr.profitLoss)) : '');
      if (tr.date) {
        const d = new Date(tr.date.length <= 10 ? `${tr.date}T00:00:00` : tr.date);
        if (!isNaN(d.getTime())) setDateObj(d);
      }
      setEntryRate(tr.entryRate != null ? String(tr.entryRate) : '');
      setExitRate(tr.exitRate != null ? String(tr.exitRate) : '');
      setStopLossStr(tr.stopLoss != null ? String(tr.stopLoss) : '');
      setTakeProfitStr(tr.takeProfit != null ? String(tr.takeProfit) : '');
      setLotSize(String(tr.lotSize));
      setStyle(tr.style);
      setSelectedTags(tr.tags ?? []);
      setImageUris(tr.imageUris ?? []);
      setReflection(tr.reflection ?? '');
      setSelfRating(tr.selfRating ?? 3);
      setMentalFocus(tr.mentalFocus ?? null);
      setMentalCalm(tr.mentalCalm ?? null);
      setMentalFear(tr.mentalFear ?? null);
      setRuleChecks(tr.ruleChecks ?? []);
      setTfWeekly(tr.tfWeekly ?? '');
      setTfDaily(tr.tfDaily ?? '');
      setTf4h(tr.tf4h ?? '');
      setTf1h(tr.tf1h ?? '');
      setLoadingExisting(false);
    }).catch(() => {
      // 読み込みに失敗したまま編集を続けると originalTradeRef が null のため
      // 保存時に新しいIDが振られ、**元のトレードはそのままに別レコードが増える**。
      // 月間集計が二重計上になるので、編集を続けさせない。
      setLoadingExisting(false);
      setLoadFailed(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // 新規記録時はロット欄に既定ロットを入れておく（毎回入力させない）
  useEffect(() => {
    if (isEditMode) return;
    setQuickLot(String(settings.defaultLotSize));
  }, [isEditMode, settings.defaultLotSize]);

  useEffect(() => {
    if (isEditMode) navigation.setOptions({ title: t('screen_title_edit_trade') });
  }, [isEditMode, navigation]);

  // Progressive Disclosure の開閉状態
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [showTF, setShowTF] = useState(false);

  // 削除済み（is_active=0）の通貨ペアを持つ既存トレードを編集する場合、
  // settingsStore の pairs（アクティブのみ）では解決できず pipDigits が
  // 既定値2へフォールバックし、何も変更せず保存し直すだけで pips が
  // 1/100 になっていた。編集時は非アクティブを含む全ペアから解決する。
  const [allPairs, setAllPairs] = useState<typeof pairs>([]);
  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    getAllCurrencyPairs()
      .then(ps => { if (!cancelled) setAllPairs(ps); })
      .catch(() => { /* 解決できなければ従来どおり pairs にフォールバック */ });
    return () => { cancelled = true; };
  }, [isEditMode]);

  // フルモード計算
  const selectedPair = (allPairs.length > 0 ? allPairs : pairs).find(p => p.name === pair)
    ?? pairs.find(p => p.name === pair);
  const pipDigits = selectedPair?.pipDigits ?? 2;
  const isYenPair = selectedPair?.isYenPair ?? false;
  // クイック入力でも通貨ペアの種別が必要（損益を自動計算できるか判定するため）
  const quickIsYenPair = isYenPair;
  const entry = parseDecimal(entryRate) ?? NaN;
  const exit = parseDecimal(exitRate) ?? NaN;
  const _sl = parseDecimal(stopLossStr) ?? NaN;
  const sl = stopLossStr.trim() && !isNaN(_sl) ? _sl : null;
  const _tp = parseDecimal(takeProfitStr) ?? NaN;
  const tp = takeProfitStr.trim() && !isNaN(_tp) ? _tp : null;
  const lot = parseDecimal(lotSize) ?? NaN;
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
    // 編集モードは「初期値と何か違うか」で判定する（新規モードの固定デフォルト
    // 比較をそのまま使うと、既存データを読み込んだだけで dirty 判定されてしまう）。
    if (isEditMode) {
      const orig = originalTradeRef.current;
      if (loadingExisting || !orig) return false;
      if (mode === 'quick') {
        return (
          pair !== orig.pair || direction !== orig.direction ||
          quickResult !== orig.result ||
          quickPips !== (orig.pips != null ? String(Math.abs(orig.pips)) : '')
        );
      }
      return (
        pair !== orig.pair || direction !== orig.direction ||
        entryRate !== (orig.entryRate != null ? String(orig.entryRate) : '') ||
        exitRate !== (orig.exitRate != null ? String(orig.exitRate) : '') ||
        stopLossStr !== (orig.stopLoss != null ? String(orig.stopLoss) : '') ||
        takeProfitStr !== (orig.takeProfit != null ? String(orig.takeProfit) : '') ||
        lotSize !== String(orig.lotSize) ||
        style !== orig.style ||
        JSON.stringify(selectedTags) !== JSON.stringify(orig.tags ?? []) ||
        JSON.stringify(imageUris) !== JSON.stringify(orig.imageUris ?? []) ||
        reflection !== (orig.reflection ?? '') ||
        selfRating !== (orig.selfRating ?? 3) ||
        mentalFocus !== (orig.mentalFocus ?? null) ||
        mentalCalm !== (orig.mentalCalm ?? null) ||
        mentalFear !== (orig.mentalFear ?? null) ||
        JSON.stringify(ruleChecks) !== JSON.stringify(orig.ruleChecks ?? []) ||
        tfWeekly !== (orig.tfWeekly ?? '') ||
        tfDaily !== (orig.tfDaily ?? '') ||
        tf4h !== (orig.tf4h ?? '') ||
        tf1h !== (orig.tf1h ?? '')
      );
    }
    if (mode === 'quick') return quickPips !== '' || quickResult !== null;
    return (
      entryRate !== '' || exitRate !== '' || reflection !== '' || imageUris.length > 0 ||
      stopLossStr !== '' || takeProfitStr !== '' || selectedTags.length > 0 ||
      selfRating !== 3 || mentalFocus !== null || mentalCalm !== null || mentalFear !== null ||
      ruleChecks.length > 0 || tfWeekly !== '' || tfDaily !== '' || tf4h !== '' || tf1h !== ''
    );
  }, [
    isEditMode, loadingExisting, mode, pair, direction, lotSize, style,
    quickPips, quickResult, entryRate, exitRate, reflection, imageUris,
    stopLossStr, takeProfitStr, selectedTags, selfRating, mentalFocus, mentalCalm, mentalFear,
    ruleChecks, tfWeekly, tfDaily, tf4h, tf1h,
  ]);

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
    // 保存本体と付帯処理（ストリーク更新・計測・各種プロンプト）を分けて扱う。
    // 以前は同じ try に入っており、addTrade が成功した後に updateRecordStreak 等が
    // 失敗すると「保存に失敗しました」と表示されていた。ユーザーは同じトレードを
    // もう一度入力するため、**同一の取引が2件記録されて勝率とpipsが狂う**。
    try {
      await addTrade(trade);
    } catch {
      Alert.alert(t('save_error'), t('save_error_msg'));
      return;
    }
    try {
      justSavedRef.current = true;
      recordFirstTradeSaved(); // リテンション自前計測、結果は待たない
      const streak = await updateRecordStreak();
      const msg = streak <= 1
        ? t('form_quick_saved_first')
        : `${streak}${t('form_quick_saved_streak')}`;
      await new Promise<void>((resolve) => {
        Alert.alert('', msg, [{ text: 'OK', onPress: () => { closeScreen(); resolve(); } }]);
      });
      // 保存完了ダイアログを閉じた後、初回のみアプリロック提案 → レビュー促進チェック（10件・30件・100件マイルストーン）の順で確認
      await promptAppLockIfNeeded();
      await promptReviewIfNeeded();
    } catch {
      // ここまで来ていれば保存自体は成功している。付帯処理の失敗で
      // 「保存に失敗」と誤解させないよう、画面を閉じるだけにする。
      closeScreen();
    }
  };

  // 編集保存: ストリーク更新・初回記録計測・レビュー促進は新規記録時のみの
  // 施策なので、更新時には呼ばない。
  const saveEditAndClose = async (trade: Trade) => {
    try {
      await editTrade(trade);
      justSavedRef.current = true;
      closeScreen();
    } catch {
      Alert.alert(t('save_error'), t('save_error_msg'));
    }
  };

  /**
   * 入力モードの切り替え。
   *
   * クイック保存は entryRate/tags/imageUris/reflection/ruleChecks を固定値で
   * 書き込むため、詳細入力で入れた内容は保存時にすべて捨てられる。
   * 破棄確認ダイアログ（beforeRemove）は保存操作では発火しないので、
   * 数分かけた入力が無警告で消えていた。切り替え時点で確認する。
   */
  const hasFullOnlyInput = () =>
    entryRate.trim() !== '' || exitRate.trim() !== '' || reflection.trim() !== '' ||
    selectedTags.length > 0 || imageUris.length > 0 || ruleChecks.length > 0 ||
    stopLossStr.trim() !== '' || takeProfitStr.trim() !== '';

  const switchMode = (next: InputMode) => {
    if (next === mode) return;
    if (next === 'quick' && hasFullOnlyInput()) {
      Alert.alert(
        t('discard_title'),
        t('form_mode_switch_discard_msg'),
        [
          { text: t('discard_cancel'), style: 'cancel' },
          { text: t('discard_confirm'), style: 'destructive', onPress: () => setMode('quick') },
        ]
      );
      return;
    }
    setMode(next);
  };

  // ── クイック保存 ──
  const handleQuickSave = async () => {
    if (!quickResult) { Alert.alert(t('input_error'), t('form_result')); return; }
    const quickLotNum = parseDecimal(quickLot);
    if (quickLotNum == null || quickLotNum <= 0) {
      Alert.alert(t('input_error'), t('lot_error'));
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const parsedPips = signedQuickPips(quickPips, quickResult);
      const orig = originalTradeRef.current;
      if (isEditMode && orig) {
        const trade: Trade = { ...orig, pair, direction, pips: parsedPips, result: quickResult };
        await saveEditAndClose(trade);
        return;
      }
      const now = new Date();
      const isoDate = toLocalISOString(now);
      const tradeId = generateId();
      const trade: Trade = {
        id: tradeId,
        date: isoDate,
        pair, direction,
        entryRate: null, exitRate: null,
        stopLoss: null, takeProfit: null, plannedRR: null,
        lotSize: quickLotNum,
        style: settings.defaultStyle as TradeStyle || 'day',
        tags: [], imageUris: [],
        entryMethod: 'quick',
        pips: parsedPips,
        // クロス円は pips とロットから自動計算。それ以外は円換算できないため
        // 手入力された実額を使う（未入力なら null のまま＝カバー率に反映される）。
        profitLoss: quickIsYenPair && parsedPips != null
          ? calcProfitLoss(parsedPips, quickLotNum, settings.lotUnit)
          // 損益も pips と同様に、結果から符号を決める。
          // decimal-pad にマイナスキーが無く、ユーザーは負の値を打てないため。
          : signedByResult(quickPL, quickResult),
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
      const orig = originalTradeRef.current;
      const finalPips = pips ?? calcPips(direction, entry, exit, pipDigits);
      const tradeId = isEditMode && orig ? orig.id : generateId();
      let persistedUris = imageUris;
      try {
        persistedUris = await saveTradeImages(imageUris, tradeId);
      } catch {
        Alert.alert(t('image_save_error'), t('image_save_error_msg'));
      }
      if (isEditMode && orig) {
        const trade: Trade = {
          ...orig,
          date: `${date}T${time}:00`.slice(0, 19),
          pair, direction,
          entryRate: entry, exitRate: exit,
          stopLoss: sl, takeProfit: tp, plannedRR,
          lotSize: lot, style,
          tags: selectedTags, imageUris: persistedUris,
          pips: finalPips, profitLoss,
          result: determineResult(finalPips),
          reflection, selfRating,
          mentalFocus, mentalCalm, mentalFear, ruleChecks,
          tfWeekly, tfDaily, tf4h, tf1h,
        };
        await saveEditAndClose(trade);
        return;
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

  if (loadingExisting) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // 編集対象を読めなかった場合。空のフォームを見せると、ユーザーは編集のつもりで
  // 入力し、保存時に新規レコードが増えて集計が二重計上になる。編集させずに閉じる。
  if (loadFailed) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingBox}>
          <Text style={{ color: C.text2, textAlign: 'center', marginBottom: 16 }}>
            {t('not_found')}
          </Text>
          <TouchableOpacity
            onPress={closeScreen}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: C.primary, fontWeight: '600' }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* ── モード切替（編集モードでは記録時のモードに固定し、切替UIは出さない）── */}
        {!isEditMode && (
          <View style={styles.modeBar}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'quick' && styles.modeBtnActive]}
              onPress={() => switchMode('quick')}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'quick' }}
            >
              <Ionicons name="flash" size={14} color={mode === 'quick' ? '#FFF' : C.text2} />
              <Text style={[styles.modeBtnText, mode === 'quick' && styles.modeBtnTextActive]}>
                {t('form_mode_quick')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'full' && styles.modeBtnActive]}
              onPress={() => switchMode('full')}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'full' }}
            >
              <Ionicons name="document-text" size={14} color={mode === 'full' ? '#FFF' : C.text2} />
              <Text style={[styles.modeBtnText, mode === 'full' && styles.modeBtnTextActive]}>
                {t('form_mode_full')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

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
                    accessibilityRole="button"
                    accessibilityState={{ selected: pair === p.name }}
                  >
                    <Text style={[styles.chipLabel, pair === p.name && styles.chipLabelActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                {pairs.length > 4 && (
                  <TouchableOpacity
                    style={[styles.chip, !pairs.slice(0, 4).some(p => p.name === pair) && styles.chipActive]}
                    onPress={() => { if (!isEditMode) setMode('full'); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !pairs.slice(0, 4).some(p => p.name === pair) }}
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
                  accessibilityRole="button"
                  accessibilityState={{ selected: direction === 'buy' }}
                >
                  <Text style={[styles.dirLabel, direction === 'buy' && { color: C.buy, fontWeight: '700' }]}>
                    {t('buy_label')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dirBtn, direction === 'sell' && styles.sellActive]}
                  onPress={() => setDirection('sell')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: direction === 'sell' }}
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: quickResult === r }}
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

              {/* ロット（必須）。損益を毎回計算できるようにするために必要。
                  既定ロットが初期値として入るので、通常は触らなくてよい。 */}
              <Label>{t('form_lot')}</Label>
              <View style={styles.pipsRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={quickLot}
                  onChangeText={setQuickLot}
                  keyboardType="decimal-pad"
                  placeholder={String(settings.defaultLotSize)}
                  placeholderTextColor={C.text3}
                  accessibilityLabel={t('form_lot')}
                />
                <Text style={styles.pipsUnit}>lot</Text>
              </View>

              {/* 損益。クロス円は pips とロットから自動計算されるので入力欄を出さない。
                  それ以外は円換算できないため、証券会社の実額を手入力してもらう。 */}
              {quickIsYenPair ? (
                <Text style={styles.quickPlHint}>
                  {t('form_pl_auto_note')}
                </Text>
              ) : (
                <>
                  <Label>{t('form_pl_manual')}</Label>
                  <View style={styles.pipsRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={quickPL}
                      onChangeText={setQuickPL}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={C.text3}
                      accessibilityLabel={t('form_pl_manual')}
                    />
                    <Text style={styles.pipsUnit}>{moneySuffix()}</Text>
                  </View>
                  <Text style={styles.quickPlHint}>{t('form_pl_manual_note')}</Text>
                </>
              )}

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
                    locale={t('locale_tag')}
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
                  onPress={() => setDirection('buy')}
                  accessibilityRole="button" accessibilityState={{ selected: direction === 'buy' }}>
                  <Text style={[styles.dirLabel, direction === 'buy' && { color: C.buy, fontWeight: '700' }]}>{t('buy_label')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dirBtn, direction === 'sell' && styles.sellActive]}
                  onPress={() => setDirection('sell')}
                  accessibilityRole="button" accessibilityState={{ selected: direction === 'sell' }}>
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
                {isYenPair ? (
                  <View style={styles.calcItem}>
                    <Text style={styles.calcLabel}>{t('form_pl')}</Text>
                    <Text style={[styles.calcValue, { color: pipsColor }]}>
                      {profitLoss != null ? formatMoney(profitLoss) : '-'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.calcItem}>
                    <Text style={styles.calcLabel}>{t('form_pl')}</Text>
                    <Text style={styles.calcNote}>{t('form_pl_non_yen_note')}</Text>
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
              <TouchableOpacity style={styles.sectionToggle} onPress={() => setDetailsOpen(v => !v)}
                accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }}>
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
                        onPress={() => setStyle(s.value)}
                        accessibilityRole="button" accessibilityState={{ selected: style === s.value }}>
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
                            onPress={() => toggleTag(tag)}
                            accessibilityRole="button" accessibilityState={{ selected: selectedTags.includes(tag) }}>
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
                        {/* DBには相対パス(charts/xxx.jpg)で保存されているため、
                            そのまま渡すと編集画面でサムネイルが表示されない。
                            詳細画面と同様に絶対URIへ解決してから渡す。 */}
                        <Image source={{ uri: resolveImageUri(uri) }} style={styles.thumb} />
                        <TouchableOpacity
                          style={styles.thumbRemove}
                          onPress={() => setImageUris(prev => prev.filter((_, j) => j !== i))}
                          accessibilityLabel={t('a11y_remove_image')}
                          accessibilityRole="button"
                        >
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
                      <TouchableOpacity
                        key={n}
                        onPress={() => setSelfRating(n)}
                        style={styles.starBtn}
                        accessibilityLabel={`${t('form_rating')} ${n}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: n === selfRating }}
                      >
                        <Ionicons name="star" size={32} color={n <= selfRating ? C.yellow : C.border} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* ── プレミアム機能（Progressive Disclosure）── */}
              {isPremium && (
                <TouchableOpacity style={styles.sectionToggle} onPress={() => setPremiumOpen(v => !v)}
                  accessibilityRole="button" accessibilityState={{ expanded: premiumOpen }}>
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
                  <TouchableOpacity style={styles.tfHeader} onPress={() => setShowTF(!showTF)}
                    accessibilityRole="button" accessibilityState={{ expanded: showTF }}>
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
                              )}
                              accessibilityRole="checkbox" accessibilityState={{ checked }}>
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
                <TouchableOpacity
                  style={styles.premiumHint}
                  onPress={() => router.push({ pathname: '/paywall', params: { source: 'trade_form_hint' } })}
                >
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
            onPress={() => onChange(value === n ? null : n)}
            accessibilityLabel={`${label} ${n}`}
            accessibilityRole="button"
            accessibilityState={{ selected: value === n }}>
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
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    quickPlHint: { color: C.text3, fontSize: 12, marginTop: 6, lineHeight: 17 },
  pipsUnit: { fontSize: 14, color: C.text2, fontWeight: '600' },

    calcBox: { flexDirection: 'row', backgroundColor: C.cardAlt, borderRadius: 14, padding: 16, marginTop: 8, gap: 8, borderWidth: 1, borderColor: C.border },
    calcItem: { flex: 1, alignItems: 'center' },
    calcLabel: { fontSize: 10, color: C.text3, marginBottom: 4, letterSpacing: 0.5 },
    calcValue: { fontSize: 22, fontWeight: '900' },
    calcNote: { fontSize: 10, color: C.text3, textAlign: 'center', lineHeight: 13, marginTop: 4 },

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

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSampleDataStore } from '../store/sampleDataStore';
import { useTradeStore } from '../store/tradeStore';
import { useTheme } from '../theme/useTheme';
import type { ThemeColors } from '../theme/colors';
import { t } from '../i18n';

/**
 * 「いま見えている数字は見本です」と常時伝え、1タップで消せるようにする帯。
 *
 * **常設であることが要件。** 一度きりのトーストやダイアログだと、後から開いた
 * 月次や分析の数字を自分の成績だと思い込む余地が残る。ホーム・月次・分析の
 * 3画面（＝見本を入れる目的である「価値が見える画面」）の先頭に置く。
 *
 * 見本が入っていなければ何も描かないので、置きっぱなしでよい。
 */
export default function SampleDataBanner() {
  const present = useSampleDataStore(s => s.present);
  const remove = useSampleDataStore(s => s.remove);
  const currentMonth = useTradeStore(s => s.currentMonth);
  const loadTradesByMonth = useTradeStore(s => s.loadTradesByMonth);
  const [busy, setBusy] = useState(false);
  const C = useTheme();
  const s = makeStyles(C);

  if (!present) return null;

  const doRemove = async () => {
    setBusy(true);
    try {
      await remove();
      // 消した直後に一覧を読み直す。これをしないと、バナーだけ消えて
      // 見本のカードが残って見える（ストアのキャッシュは月単位で保持される）。
      await loadTradesByMonth(currentMonth);
    } catch {
      Alert.alert(t('sample_remove_error_title'), t('sample_remove_error_msg'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    Alert.alert(
      t('sample_remove_confirm_title'),
      t('sample_remove_confirm_msg'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('sample_remove_confirm_ok'), style: 'destructive', onPress: doRemove },
      ]
    );
  };

  return (
    <View style={s.wrap} accessibilityRole="summary">
      <Ionicons name="information-circle" size={18} color={C.primary} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{t('sample_banner_title')}</Text>
        <Text style={s.desc}>{t('sample_banner_desc')}</Text>
      </View>
      <TouchableOpacity
        style={s.btn}
        onPress={confirm}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t('sample_banner_action')}
      >
        {busy
          ? <ActivityIndicator size="small" color={C.onAccent} />
          : <Text style={s.btnText}>{t('sample_banner_action')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: C.primary + '14',
      borderWidth: 1,
      borderColor: C.primary + '40',
    },
    title: { fontSize: 13, fontWeight: '800', color: C.text },
    desc: { fontSize: 11, color: C.text2, marginTop: 2, lineHeight: 15 },
    btn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 9,
      backgroundColor: C.primary,
      minWidth: 64,
      alignItems: 'center',
    },
    btnText: { fontSize: 12, fontWeight: '800', color: C.onAccent },
  });
}

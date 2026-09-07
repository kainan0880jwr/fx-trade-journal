import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTradeStore } from '../../src/store/tradeStore';
import TradeCard from '../../src/components/TradeCard';
import PremiumGate from '../../src/components/PremiumGate';
import { useTheme } from '../../src/theme/useTheme';
import type { ThemeColors } from '../../src/theme/colors';
import { t, lang } from '../../src/i18n';
import type { Trade } from '../../src/types';
import * as Sentry from '@sentry/react-native';

export default function BookmarksScreen() {
  const C = useTheme();
  const styles = makeStyles(C);
  const { loadBookmarked } = useTradeStore();
  const [bookmarks, setBookmarks] = useState<Trade[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = async () => {
    // try が無いと失敗時に未処理rejectionになり、「0件」がエラーではなく
    // 正常な空状態として表示される
    let ts;
    try {
      ts = await loadBookmarked();
    } catch (e) {
      try { Sentry.captureException(e, { tags: { area: 'bookmarks_load' } }); } catch { /* 無視 */ }
      // 黙って return すると bookmarks が [] のままになり、「保存済みがありません」と
      // 区別がつかない。読み込めなかったことを伝えて、やり直せるようにする。
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setBookmarks(ts);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <PremiumGate feature={t('tab_saved')} featureKey="bookmarks">
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={bookmarks}
        keyExtractor={t => t.id}
        renderItem={useCallback(({ item, index }: { item: Trade; index: number }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify().damping(16)}>
            <TradeCard trade={item} />
          </Animated.View>
        ), [])}
        ListHeaderComponent={
          <Text style={styles.header}>{t('bookmarks_title')} ({bookmarks.length}{lang === 'ja' ? '件' : ''})</Text>
        }
        ListEmptyComponent={
          loadFailed ? (
            // 読み込み失敗を「保存済みがありません」と同じ見た目で出さない。
            // やり直せる手段も添える。
            <View style={styles.empty}>
              <Ionicons name="alert-circle-outline" size={52} color={C.yellow} />
              <Text style={styles.emptyText}>{t('trade_load_error')}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={load}
                accessibilityRole="button"
              >
                <Text style={styles.retryBtnText}>{t('retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="bookmark-outline" size={52} color={C.text3} />
              <Text style={styles.emptyText}>{t('bookmarks_empty')}</Text>
              <Text style={styles.emptySubText}>{t('bookmarks_empty_sub')}</Text>
            </View>
          )
        }
        contentContainerStyle={bookmarks.length === 0 ? styles.emptyContainer : { paddingBottom: 40 }}
      />
    </SafeAreaView>
    </PremiumGate>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { fontSize: 13, color: C.text2, paddingHorizontal: 16, paddingVertical: 12 },
    empty: { alignItems: 'center', paddingTop: 60 },
    retryBtn: { marginTop: 16, backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
    retryBtnText: { color: C.onAccent, fontWeight: '700', fontSize: 14 },
    emptyText: { fontSize: 15, color: C.text2, marginTop: 14 },
    emptySubText: { fontSize: 12, color: C.text3, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
    emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  });
}

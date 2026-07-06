import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTradeStore } from '../../src/store/tradeStore';
import TradeCard from '../../src/components/TradeCard';
import PremiumGate from '../../src/components/PremiumGate';
import { useTheme } from '../../src/theme/useTheme';
import type { ThemeColors } from '../../src/theme/colors';
import { t } from '../../src/i18n';
import type { Trade } from '../../src/types';

export default function BookmarksScreen() {
  const C = useTheme();
  const styles = makeStyles(C);
  const { loadBookmarked } = useTradeStore();
  const [bookmarks, setBookmarks] = useState<Trade[]>([]);

  const load = async () => {
    const ts = await loadBookmarked();
    setBookmarks(ts);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <PremiumGate feature={t('tab_saved')}>
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
          <Text style={styles.header}>ブックマーク ({bookmarks.length}件)</Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={52} color={C.text3} />
            <Text style={styles.emptyText}>ブックマークしたトレードはありません</Text>
            <Text style={styles.emptySubText}>トレード詳細でブックマーク登録できます</Text>
          </View>
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
    emptyText: { fontSize: 15, color: C.text2, marginTop: 14 },
    emptySubText: { fontSize: 12, color: C.text3, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
    emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  });
}

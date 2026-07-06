import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, Platform } from 'react-native';
import { useTheme } from '../../src/theme/useTheme';
import { useIsTablet } from '../../src/hooks/useIsTablet';
import { t } from '../../src/i18n';

export default function TabLayout() {
  const C = useTheme();
  const isTablet = useIsTablet();

  return (
    <Tabs
      screenOptions={{
        tabBarPosition: isTablet ? 'left' : 'bottom',
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.text2,
        tabBarStyle: isTablet
          ? {
              backgroundColor: C.tabBg,
              borderRightColor: C.border,
              borderRightWidth: 1,
              width: 200,
              paddingTop: 16,
            }
          : {
              backgroundColor: C.tabBg,
              borderTopColor: C.border,
              borderTopWidth: 1,
              height: Platform.OS === 'ios' ? 62 : 58,
              paddingBottom: Platform.OS === 'ios' ? 10 : 6,
              paddingTop: 6,
            },
        tabBarLabelStyle: isTablet
          ? { fontSize: 13, fontWeight: '600', letterSpacing: 0.2, marginLeft: 4 }
          : { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
        tabBarItemStyle: isTablet
          ? { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 16, height: 52, gap: 8 }
          : {},
        headerStyle: {
          backgroundColor: C.bg,
          shadowColor: 'transparent',
          elevation: 0,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        },
        headerTintColor: C.text,
        headerTitleStyle: { color: C.text, fontWeight: '800', fontSize: 17 },
        headerRight: () => (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/settings')}
            style={{
              marginRight: 16, width: 36, height: 36,
              alignItems: 'center', justifyContent: 'center',
              borderRadius: 10, backgroundColor: C.card,
              borderWidth: 1, borderColor: C.border,
            }}
            accessibilityLabel={t('a11y_settings')}
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={19} color={C.text2} />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab_journal'),
          headerTitle: t('app_name'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'journal' : 'journal-outline'} color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="monthly"
        options={{
          title: t('period_monthly'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('tab_calendar'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tab_analysis'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'analytics' : 'analytics-outline'} color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="yearly"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{ href: null }}
      />
    </Tabs>
  );
}

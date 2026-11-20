import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import {
  ArrowLeftRight,
  LayoutDashboard,
  PieChart,
  Plus,
  SlidersHorizontal,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuickAddModal } from '@/components/QuickAddModal';
import { useResponsiveLayout, useTheme } from '@/theme/theme';

interface TabConfig {
  label: string;
  renderIcon: (color: string, size: number) => React.ReactNode;
}

const TAB_CONFIG: Record<string, TabConfig> = {
  index: {
    label: 'Özet',
    renderIcon: (color, size) => <LayoutDashboard size={size} color={color} />,
  },
  transactions: {
    label: 'İşlemler',
    renderIcon: (color, size) => <ArrowLeftRight size={size} color={color} />,
  },
  reports: {
    label: 'Raporlar',
    renderIcon: (color, size) => <PieChart size={size} color={color} />,
  },
  plan: {
    label: 'Planla',
    renderIcon: (color, size) => <SlidersHorizontal size={size} color={color} />,
  },
};

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

function CustomTabBar({
  state,
  emitter,
  navigateToTab,
  onOpenQuickAdd,
}: TabBarProps & { onOpenQuickAdd: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide, contentMaxWidth } = useResponsiveLayout();

  const renderTabButton = (routeName: string) => {
    const routeIndex = state.routes.findIndex((r) => r.name === routeName);
    if (routeIndex < 0) return null;
    const route = state.routes[routeIndex];

    const isFocused = state.index === routeIndex;
    const config = TAB_CONFIG[route.name];
    const label = config?.label ?? route.name;
    const color = isFocused ? theme.colors.accent : theme.colors.muted;

    const handlePress = () => {
      const event = emitter.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigateToTab(route.key);
      }
    };

    const handleLongPress = () => {
      emitter.emit({
        type: 'tabLongPress',
        target: route.key,
      });
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={({ pressed }) => [
          styles.tabItem,
          { opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <View
          style={[
            styles.iconPill,
            isFocused && { backgroundColor: theme.colors.accentSoft },
          ]}
        >
          {config?.renderIcon(color, 20)}
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            {
              color,
              fontWeight: isFocused ? '700' : '500',
            },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.barOuter,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <View
        style={[
          styles.barInner,
          isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
      >
        {renderTabButton('index')}
        {renderTabButton('transactions')}

        <View style={styles.centerSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hızlı Ekle"
            onPress={onOpenQuickAdd}
            style={({ pressed }) => [
              styles.fabButton,
              {
                backgroundColor: theme.colors.accent,
                borderColor: theme.colors.surface,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
          <Text style={[styles.fabLabel, { color: theme.colors.accent }]}>Hızlı Ekle</Text>
        </View>

        {renderTabButton('reports')}
        {renderTabButton('plan')}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const [quickAddVisible, setQuickAddVisible] = useState(false);

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => (
          <CustomTabBar
            {...props}
            onOpenQuickAdd={() => setQuickAddVisible(true)}
          />
        )}
      >
        <Tabs.Screen name="index" options={{ title: 'Özet' }} />
        <Tabs.Screen name="transactions" options={{ title: 'İşlemler' }} />
        <Tabs.Screen name="reports" options={{ title: 'Raporlar' }} />
        <Tabs.Screen name="plan" options={{ title: 'Planla' }} />
      </Tabs>

      <QuickAddModal
        visible={quickAddVisible}
        onClose={() => setQuickAddVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  barOuter: {
    borderTopWidth: 1,
    paddingTop: 6,
    paddingHorizontal: 8,
  },
  barInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 3,
  },
  iconPill: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tabLabel: {
    fontSize: 11,
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: -22,
    gap: 3,
  },
  fabButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 6px 16px rgba(59, 130, 246, 0.35)' }
      : {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.32,
          shadowRadius: 8,
          elevation: 6,
        }),
  },
  fabLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
});

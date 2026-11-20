import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/theme';

export default function PlanStackLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '700',
          color: theme.colors.text,
        },
        headerShadowVisible: false,
        headerBackTitle: 'Planla',
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen
        name="accounts"
        options={{ title: 'Hesaplarım & Kredi Kartları' }}
      />
      <Stack.Screen
        name="budgets"
        options={{ title: 'Bütçe Limitleri' }}
      />
      <Stack.Screen
        name="installments"
        options={{ title: 'Taksitlerim' }}
      />
      <Stack.Screen
        name="recurring"
        options={{ title: 'Düzenli Ödemeler & Abonelikler' }}
      />
      <Stack.Screen
        name="goals"
        options={{ title: 'Birikim Hedefleri / Kumbara' }}
      />
      <Stack.Screen
        name="debts"
        options={{ title: 'Borç & Alacak Defteri' }}
      />
      <Stack.Screen
        name="shared-reports"
        options={{ title: 'Paylaşılan Raporlarım' }}
      />
      <Stack.Screen
        name="rates"
        options={{ title: 'Döviz & Altın Kurları' }}
      />
      <Stack.Screen
        name="settings"
        options={{ title: 'Ayarlar & Bulut Senkronizasyonu' }}
      />
    </Stack>
  );
}

import { useColorScheme, useWindowDimensions } from 'react-native';
import { useFinanceStore } from '@/store/useFinanceStore';

export interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  income: string;
  expense: string;
  accent: string;
  warning: string;
  danger: string;
  success: string;
  incomeSoft: string;
  expenseSoft: string;
  accentSoft: string;
  warningSoft: string;
  overlay: string;
}

export interface AppTheme {
  mode: 'light' | 'dark';
  isDark: boolean;
  colors: ThemeColors;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
}

const SHARED_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

const SHARED_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const DARK_THEME: AppTheme = {
  mode: 'dark',
  isDark: true,
  colors: {
    background: '#0B1120',
    surface: '#111827',
    card: '#111827',
    elevated: '#1E293B',
    border: '#1F2937',
    text: '#F8FAFC',
    muted: '#94A3B8',
    income: '#10B981',
    expense: '#EF4444',
    accent: '#3B82F6',
    warning: '#F59E0B',
    danger: '#EF4444',
    success: '#10B981',
    incomeSoft: 'rgba(16, 185, 129, 0.16)',
    expenseSoft: 'rgba(239, 68, 68, 0.16)',
    accentSoft: 'rgba(59, 130, 246, 0.18)',
    warningSoft: 'rgba(245, 158, 11, 0.18)',
    overlay: 'rgba(2, 6, 23, 0.78)',
  },
  spacing: SHARED_SPACING,
  radius: SHARED_RADIUS,
};

export const LIGHT_THEME: AppTheme = {
  mode: 'light',
  isDark: false,
  colors: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    elevated: '#F1F5F9',
    border: '#E2E8F0',
    text: '#0F172A',
    muted: '#64748B',
    income: '#10B981',
    expense: '#EF4444',
    accent: '#3B82F6',
    warning: '#F59E0B',
    danger: '#EF4444',
    success: '#10B981',
    incomeSoft: 'rgba(16, 185, 129, 0.12)',
    expenseSoft: 'rgba(239, 68, 68, 0.12)',
    accentSoft: 'rgba(59, 130, 246, 0.12)',
    warningSoft: 'rgba(245, 158, 11, 0.14)',
    overlay: 'rgba(15, 23, 42, 0.55)',
  },
  spacing: SHARED_SPACING,
  radius: SHARED_RADIUS,
};

export const TABULAR_NUMS_STYLE = {
  fontVariant: ['tabular-nums'] as const,
};

/** Resolves the active `AppTheme` from user store preference (`system | light | dark`). */
export function useTheme(): AppTheme {
  const themeSetting = useFinanceStore((s) => s.settings.theme);
  const systemScheme = useColorScheme();

  const resolvedMode =
    themeSetting === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : themeSetting;

  return resolvedMode === 'dark' ? DARK_THEME : LIGHT_THEME;
}

/** Provides responsive layout breakpoints (`>= 768px`) and max content width for Web/tablet. */
export function useResponsiveLayout(): {
  width: number;
  height: number;
  isWide: boolean;
  contentMaxWidth: number;
} {
  const { width, height } = useWindowDimensions();
  const isWide = width >= 768;
  return {
    width,
    height,
    isWide,
    contentMaxWidth: width >= 1200 ? 1120 : 960,
  };
}

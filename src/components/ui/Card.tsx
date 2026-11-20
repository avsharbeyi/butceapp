import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';

export interface CardProps {
  children: React.ReactNode;
  padding?: number;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, padding, elevated = false, style }: CardProps) {
  const theme = useTheme();
  const resolvedPadding = padding ?? theme.spacing.lg;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: elevated ? theme.colors.elevated : theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: resolvedPadding,
        },
        !theme.isDark && shadowStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const shadowStyle: ViewStyle =
  Platform.OS === 'web'
    ? ({
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
      } as ViewStyle)
    : {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      };

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
});

import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { formatMoney } from '@/domain/money';
import type { CurrencyCode } from '@/domain/types';
import { useFinanceStore } from '@/store/useFinanceStore';
import { TABULAR_NUMS_STYLE, useTheme } from '@/theme/theme';

export interface MoneyTextProps {
  amount: number;
  currency: CurrencyCode;
  privacyMode?: boolean;
  sign?: 'auto' | 'always' | 'none';
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export function MoneyText({
  amount,
  currency,
  privacyMode,
  sign = 'auto',
  color,
  style,
  numberOfLines,
}: MoneyTextProps) {
  const theme = useTheme();
  const storePrivacy = useFinanceStore((s) => s.settings.privacyMode);
  const resolvedPrivacy = privacyMode ?? storePrivacy;

  const targetAmount = sign === 'none' ? Math.abs(amount) : amount;
  let formatted = formatMoney(targetAmount, currency, resolvedPrivacy);

  if (!resolvedPrivacy && sign === 'always' && amount > 0) {
    formatted = `+${formatted}`;
  }

  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        TABULAR_NUMS_STYLE,
        {
          color: color ?? theme.colors.text,
        },
        style,
      ]}
    >
      {formatted}
    </Text>
  );
}

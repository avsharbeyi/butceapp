import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  color?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  selected = false,
  color,
  onPress,
  icon,
  disabled = false,
  style,
}: ChipProps) {
  const theme = useTheme();
  const activeColor = color ?? theme.colors.accent;

  const containerStyle: ViewStyle = {
    backgroundColor: selected ? `${activeColor}22` : theme.colors.elevated,
    borderColor: selected ? activeColor : theme.colors.border,
    borderRadius: theme.radius.pill,
  };

  const content = (
    <View style={styles.inner}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            color: selected ? activeColor : theme.colors.text,
            fontWeight: selected ? '700' : '500',
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return <View style={[styles.chip, containerStyle, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        containerStyle,
        { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
  },
});

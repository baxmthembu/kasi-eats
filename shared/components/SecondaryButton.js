import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import theme from '../theme';

/**
 * Secondary button — Warm Yellow background, Charcoal text.
 * Used for: Promotions, Edit Profile, Filters, Optional Actions.
 */
export default function SecondaryButton({ label, onPress, disabled, icon, style, textStyle, size = 'md' }) {
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.base, sizeStyle.btn, disabled && styles.disabled, style]}
    >
      <View style={styles.inner}>
        {icon && <View style={styles.icon}>{icon}</View>}
        <Text style={[styles.label, sizeStyle.text, textStyle]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const SIZE_STYLES = {
  sm: { btn: { paddingVertical: 8,  paddingHorizontal: 14 }, text: { fontSize: 13 } },
  md: { btn: { paddingVertical: 12, paddingHorizontal: 20 }, text: { fontSize: 15 } },
  lg: { btn: { paddingVertical: 14, paddingHorizontal: 24 }, text: { fontSize: 16 } },
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  disabled: { backgroundColor: theme.colors.surface },
  inner:  { flexDirection: 'row', alignItems: 'center' },
  icon:   { marginRight: 8 },
  label:  { color: theme.colors.textPrimary, fontWeight: '700', letterSpacing: 0.2 },
});

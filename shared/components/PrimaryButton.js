import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import theme from '../theme';

/**
 * Primary CTA button — Deep Orange background, white text.
 * Used for: Place Order, Checkout, Accept Order, Login, Register, Confirm Delivery.
 */
export default function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
  size = 'md',
}) {
  const isDisabled = disabled || loading;
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[styles.base, sizeStyle.btn, isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <View style={styles.inner}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text style={[styles.label, sizeStyle.text, textStyle]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const SIZE_STYLES = {
  sm: { btn: { paddingVertical: 10, paddingHorizontal: 16 }, text: { fontSize: 13 } },
  md: { btn: { paddingVertical: 14, paddingHorizontal: 20 }, text: { fontSize: 15 } },
  lg: { btn: { paddingVertical: 16, paddingHorizontal: 24 }, text: { fontSize: 16 } },
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  disabled: {
    backgroundColor: theme.colors.surface,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: { marginRight: 8 },
  label: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

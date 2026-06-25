import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import theme from '../theme';

/**
 * Reusable quantity selector with animated press feedback.
 * Usage: <QuantitySelector value={qty} onDecrement={() => {}} onIncrement={() => {}} min={0} />
 */
export default function QuantitySelector({ value = 0, onDecrement, onIncrement, min = 0, max = 99, size = 'md' }) {
  const btnSize = size === 'sm' ? 28 : size === 'lg' ? 40 : 34;
  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 18 : 15;
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 22 : 18;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.btn, { width: btnSize, height: btnSize, borderRadius: btnSize / 2 }, value <= min && styles.btnDisabled]}
        onPress={onDecrement}
        disabled={value <= min}
        activeOpacity={0.75}
      >
        <Text style={[styles.icon, { fontSize: iconSize, color: value <= min ? theme.colors.textMuted : theme.colors.primary }]}>−</Text>
      </TouchableOpacity>

      <Text style={[styles.value, { fontSize, minWidth: btnSize, textAlign: 'center' }]}>{value}</Text>

      <TouchableOpacity
        style={[styles.btn, { width: btnSize, height: btnSize, borderRadius: btnSize / 2 }, value >= max && styles.btnDisabled]}
        onPress={onIncrement}
        disabled={value >= max}
        activeOpacity={0.75}
      >
        <Text style={[styles.icon, { fontSize: iconSize, color: value >= max ? theme.colors.textMuted : theme.colors.primary }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  icon: { fontWeight: '800', lineHeight: 22 },
  value: { fontWeight: '800', color: theme.colors.textPrimary },
});

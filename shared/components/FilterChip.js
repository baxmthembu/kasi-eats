import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import theme from '../theme';

/**
 * Filter/tag chip — active = orange bg, inactive = surface gray.
 * Usage: <FilterChip label="Pizza" active={selected === 'pizza'} onPress={() => setSelected('pizza')} />
 */
export default function FilterChip({ label, active, onPress, icon, style }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive, style]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5, borderColor: 'transparent',
    gap: 4,
  },
  chipActive: {
    backgroundColor: `${theme.colors.primary}15`,
    borderColor: theme.colors.primary,
  },
  icon:        { fontSize: 14 },
  label:       { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  labelActive: { color: theme.colors.primary, fontWeight: '800' },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import theme from '../theme';

/**
 * Reusable empty state component.
 * Usage:
 *   <EmptyState emoji="🍽" title="No vendors nearby" subtitle="Try a different area" />
 *   <EmptyState emoji="📦" title="No orders" subtitle="..." actionLabel="Browse" onAction={() => nav.navigate('Browse')} />
 */
export default function EmptyState({ emoji = '😕', title, subtitle, actionLabel, onAction, style }) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.emoji}>{emoji}</Text>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.btn} onPress={onAction} activeOpacity={0.85}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emoji:    { fontSize: 60, marginBottom: 16 },
  title:    { fontSize: 20, fontWeight: '800', color: theme.colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 28, paddingVertical: 13,
    borderRadius: 14,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

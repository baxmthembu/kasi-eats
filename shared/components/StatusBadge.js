import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../theme';

const STATUS_CONFIG = {
  pending:   { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  confirmed: { bg: '#DBEAFE', text: '#1E40AF', label: 'Confirmed' },
  preparing: { bg: '#EDE9FE', text: '#5B21B6', label: 'Preparing' },
  ready:     { bg: '#D1FAE5', text: '#065F46', label: 'Ready' },
  picked_up: { bg: '#FFF7ED', text: '#C2410C', label: 'Picked Up' },
  on_the_way:{ bg: '#FFF7ED', text: '#C2410C', label: 'On the Way' },
  delivered: { bg: '#D1FAE5', text: '#065F46', label: 'Delivered' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'Cancelled' },
  failed:    { bg: '#FEE2E2', text: '#991B1B', label: 'Failed' },
  completed: { bg: '#D1FAE5', text: '#065F46', label: 'Completed' },
  active:    { bg: '#FFF7ED', text: theme.colors.primary, label: 'Active' },
  online:    { bg: '#D1FAE5', text: '#065F46', label: 'Online' },
  offline:   { bg: theme.colors.surface, text: theme.colors.textSecondary, label: 'Offline' },
};

export default function StatusBadge({ status, style }) {
  const cfg = STATUS_CONFIG[status?.toLowerCase()] || {
    bg: theme.colors.surface,
    text: theme.colors.textSecondary,
    label: status || 'Unknown',
  };

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }, style]}>
      <Text style={[styles.text, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.round,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
});

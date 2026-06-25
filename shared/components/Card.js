import React from 'react';
import { View, StyleSheet } from 'react-native';
import theme from '../theme';
import shadows from '../theme/shadows';

/**
 * Standard card container — soft gray bg, rounded corners, subtle shadow.
 */
export default function Card({ children, style, padding = true }) {
  return (
    <View style={[styles.card, padding && styles.padding, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    ...shadows.s,
  },
  padding: { padding: theme.spacing.m },
});

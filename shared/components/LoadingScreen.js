import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import theme from '../theme';

export default function LoadingScreen({ message = 'Loading...' }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  text: { fontSize: 14, color: theme.colors.textSecondary },
});

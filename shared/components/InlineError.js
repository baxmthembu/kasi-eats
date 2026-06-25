import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function InlineError({ message }) {
  if (!message) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠</Text>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 8,
  },
  icon: {
    fontSize: 13,
    color: '#DC2626',
    lineHeight: 20,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '500',
    lineHeight: 20,
  },
});

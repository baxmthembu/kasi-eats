import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '../theme';

/**
 * Consistent screen header — white bg, orange back arrow, charcoal title.
 */
export default function ScreenHeader({ title, onBack, rightElement, subtitle }) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.bar}>
        <View style={styles.left}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.backArrow}>←</Text>
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        {rightElement && <View style={styles.right}>{rightElement}</View>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { backgroundColor: theme.colors.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.m,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  left:     { flexDirection: 'row', alignItems: 'center', flex: 1 },
  backBtn:  { marginRight: 12, padding: 4 },
  backArrow:{ fontSize: 22, color: theme.colors.primary, fontWeight: '600' },
  title:    { fontSize: 17, fontWeight: '700', color: theme.colors.textPrimary },
  subtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
  right:    { marginLeft: theme.spacing.m },
});

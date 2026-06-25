import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import theme from '../theme';

/**
 * Displays star rating — either static display or interactive selector.
 *
 * Static:   <RatingStars value={4.5} total={120} />
 * Interactive: <RatingStars value={rating} interactive onChange={setRating} size="lg" />
 */
export default function RatingStars({ value = 0, total, interactive = false, onChange, size = 'sm', showValue = false }) {
  const starSize = size === 'lg' ? 36 : size === 'md' ? 28 : 18;
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={styles.row}>
      {stars.map((star) => {
        const filled = value >= star;
        const half   = !filled && value >= star - 0.5;
        return (
          <TouchableOpacity
            key={star}
            onPress={interactive ? () => onChange?.(star) : undefined}
            disabled={!interactive}
            activeOpacity={interactive ? 0.7 : 1}
            style={{ marginHorizontal: 1 }}
          >
            <Text style={{ fontSize: starSize, color: filled || half ? '#FACC15' : '#D1D5DB' }}>
              {filled ? '★' : half ? '½' : '☆'}
            </Text>
          </TouchableOpacity>
        );
      })}
      {showValue && value > 0 && (
        <Text style={[styles.value, { fontSize: starSize * 0.5 }]}>{parseFloat(value).toFixed(1)}</Text>
      )}
      {total != null && (
        <Text style={[styles.count, { fontSize: starSize * 0.45 }]}>({total})</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  value: { fontWeight: '700', color: theme.colors.textPrimary, marginLeft: 6 },
  count: { color: theme.colors.textSecondary, marginLeft: 3 },
});

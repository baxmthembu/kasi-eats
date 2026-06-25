import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';

/**
 * Animated shimmer skeleton — drop-in loading placeholder.
 * Usage: <SkeletonLoader width={200} height={16} borderRadius={8} />
 */
export default function SkeletonLoader({ width = '100%', height = 16, borderRadius = 8, style }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] });

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

export function VendorCardSkeleton() {
  return (
    <View style={skStyles.card}>
      <SkeletonLoader height={160} borderRadius={0} />
      <View style={skStyles.body}>
        <SkeletonLoader height={18} width="70%" style={{ marginBottom: 8 }} />
        <SkeletonLoader height={14} width="50%" style={{ marginBottom: 12 }} />
        <View style={skStyles.metaRow}>
          <SkeletonLoader height={28} width={90} borderRadius={20} />
          <SkeletonLoader height={28} width={90} borderRadius={20} />
        </View>
      </View>
    </View>
  );
}

export function HomeScreenSkeleton() {
  return (
    <View style={{ padding: 20 }}>
      {/* Search bar */}
      <SkeletonLoader height={52} borderRadius={14} style={{ marginBottom: 20 }} />
      {/* Banner */}
      <SkeletonLoader height={120} borderRadius={20} style={{ marginBottom: 24 }} />
      {/* Category labels */}
      <View style={skStyles.catRow}>
        {[1,2,3,4].map((i) => (
          <View key={i} style={skStyles.catItem}>
            <SkeletonLoader height={56} width={56} borderRadius={18} style={{ marginBottom: 6 }} />
            <SkeletonLoader height={10} width={50} borderRadius={4} />
          </View>
        ))}
      </View>
      {/* Cards */}
      <VendorCardSkeleton />
      <VendorCardSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: '#E5E7EB' },
});

const skStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
  body: { padding: 14 },
  metaRow: { flexDirection: 'row', gap: 8 },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  catItem: { alignItems: 'center', width: 68 },
});

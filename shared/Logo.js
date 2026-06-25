import React from 'react';
import { Image, View, StyleSheet, useWindowDimensions } from 'react-native';

/**
 * Kasi Eats Logo component — responsive across all screen sizes.
 *
 * Each app passes its own local `source` prop so the shared module
 * doesn't need to bundle an asset from a fixed path.
 *
 * Size presets:
 *   "splash" (280px)  — Login & onboarding screens
 *   "header" (120×44) — Navigation bar / home header
 *   "small"  (60px)   — Icon badge, drawer avatar
 *
 * Usage:
 *   <Logo size="splash" source={require('../../../assets/logo.png')} />
 *   <Logo size="header" source={require('../../../assets/logo.png')} />
 *   <Logo width={120} height={48} source={require('../../../assets/logo.png')} />
 */

const PRESETS = {
  splash: { widthPct: 0.60, maxWidth: 280, aspectRatio: 1 },
  header: { widthPct: 0.36, maxWidth: 140, aspectRatio: 2.5 },
  small:  { widthPct: 0.15, maxWidth: 60,  aspectRatio: 1 },
};

export default function Logo({ size = 'splash', width, height, source, style }) {
  const { width: screenWidth } = useWindowDimensions();
  const preset = PRESETS[size] || PRESETS.splash;

  const resolvedWidth  = width  ?? Math.min(screenWidth * preset.widthPct, preset.maxWidth);
  const resolvedHeight = height ?? resolvedWidth / preset.aspectRatio;

  return (
    <View style={[styles.wrapper, style]}>
      <Image
        source={source}
        style={{ width: resolvedWidth, height: resolvedHeight }}
        resizeMode="contain"
        accessibilityLabel="Kasi Eats"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
});

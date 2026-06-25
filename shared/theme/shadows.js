/**
 * Kasi Eats — Shadow System
 * Cross-platform: elevation for Android, shadow* props for iOS
 */
const { Platform } = require('react-native');

const makeShadow = (elevation, opacity = 0.12) =>
  Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: elevation * 0.5 },
      shadowOpacity: opacity,
      shadowRadius: elevation * 0.8,
    },
    android: { elevation },
    default: {},
  });

const shadows = {
  none:   makeShadow(0),
  xs:     makeShadow(1, 0.08),
  s:      makeShadow(2, 0.10),
  m:      makeShadow(4, 0.12),
  l:      makeShadow(8, 0.14),
  xl:     makeShadow(16, 0.16),
};

module.exports = shadows;

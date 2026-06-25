/**
 * Kasi Eats — Typography Scale
 * System fonts via Platform.OS — no custom font deps required
 */
const { Platform } = require('react-native');

const fontFamily = Platform.select({
  ios:     'System',
  android: 'Roboto',
  default: 'System',
});

const typography = {
  // Display
  display: { fontFamily, fontSize: 36, fontWeight: '800', lineHeight: 44, letterSpacing: -0.5 },

  // Headings
  h1: { fontFamily, fontSize: 28, fontWeight: '800', lineHeight: 34 },
  h2: { fontFamily, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  h3: { fontFamily, fontSize: 18, fontWeight: '600', lineHeight: 24 },
  h4: { fontFamily, fontSize: 16, fontWeight: '600', lineHeight: 22 },

  // Body
  body:      { fontFamily, fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontFamily, fontSize: 13, fontWeight: '400', lineHeight: 18 },

  // UI
  label:   { fontFamily, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  caption: { fontFamily, fontSize: 12, fontWeight: '400', lineHeight: 16 },
  button:  { fontFamily, fontSize: 15, fontWeight: '700', lineHeight: 20, letterSpacing: 0.2 },

  // Numeric / price
  price: { fontFamily, fontSize: 17, fontWeight: '700', lineHeight: 22 },
};

module.exports = { typography, fontFamily };

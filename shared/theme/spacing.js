/**
 * Kasi Eats — Spacing Scale (4-pt base grid)
 */
const spacing = {
  xs:  4,
  s:   8,
  m:  16,
  l:  24,
  xl: 32,
  xxl:48,
  xxxl:64,
};

/** Touch targets — minimum 44pt per Apple HIG / Material */
const touchTarget = { minHeight: 48, minWidth: 48 };

module.exports = { spacing, touchTarget };

/**
 * Kasi Eats — Master Design System
 *
 * All apps import from here:
 *   import theme from '../../../../shared/theme';
 *
 * Sub-modules are also exported for granular imports:
 *   import { typography } from '../../../../shared/theme/typography';
 */
const colors       = require('./theme/colors');
const { spacing }  = require('./theme/spacing');
const { typography } = require('./theme/typography');
const shadows      = require('./theme/shadows');
const borderRadius = require('./theme/borderRadius');

const theme = {
  colors: {
    // ── Brand ──────────────────────────────────────
    primary:       colors.primary,
    secondary:     colors.secondary,

    // ── Backgrounds ────────────────────────────────
    background:    colors.background,
    surface:       colors.surface,
    surfaceAlt:    colors.surfaceAlt,

    // ── Text ───────────────────────────────────────
    textPrimary:   colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted:     colors.textMuted,
    textInverse:   colors.textInverse,

    // ── Semantic ───────────────────────────────────
    success:       colors.success,
    warning:       colors.warning,
    error:         colors.error,
    info:          colors.info,

    // ── UI ─────────────────────────────────────────
    border:        colors.border,
    borderFocus:   colors.borderFocus,
    overlay:       colors.overlay,

    // ── Legacy aliases (keeps old references working)
    accent:        colors.primary,       // was D4845A burnt orange → now primary orange
  },

  spacing,
  typography,
  shadows,
  borderRadius,

  // ── Navigation theme objects ────────────────────
  navigationTheme: {
    dark: false,
    colors: {
      primary:    colors.primary,
      background: colors.background,
      card:       colors.background,
      text:       colors.textPrimary,
      border:     colors.border,
      notification: colors.primary,
    },
  },

  // ── Header preset ──────────────────────────────
  headerStyle: {
    backgroundColor: colors.background,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleStyle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  headerTintColor: colors.primary,
};

module.exports = theme;

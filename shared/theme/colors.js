/**
 * Kasi Eats — Brand Color System
 * Deep Orange × Warm Yellow × Charcoal
 */
const colors = {
  // ── Brand ──────────────────────────────────────────────────
  primary:   '#F97316',   // Deep Orange  — action, hunger, speed
  secondary: '#FACC15',   // Warm Yellow  — community, warmth, kasi energy

  // ── Neutrals ───────────────────────────────────────────────
  background: '#FFFFFF',  // White        — main screen background
  surface:    '#F3F4F6',  // Soft Gray    — cards, containers, inputs
  surfaceAlt: '#E9EAEC',  // Slightly darker gray — dividers

  // ── Text ───────────────────────────────────────────────────
  textPrimary:   '#1F2937',  // Charcoal Black — headings, body
  textSecondary: '#6B7280',  // Medium Gray    — captions, hints
  textMuted:     '#9CA3AF',  // Light Gray     — placeholders
  textInverse:   '#FFFFFF',  // White          — text on dark/orange bg

  // ── Semantic ───────────────────────────────────────────────
  success: '#16A34A',   // Green
  warning: '#D97706',   // Amber
  error:   '#DC2626',   // Red
  info:    '#2563EB',   // Blue

  // ── UI Elements ────────────────────────────────────────────
  border:       '#E5E7EB',  // Card/input borders
  borderFocus:  '#F97316',  // Focused input border (primary orange)
  shadow:       '#000000',  // Shadow base color (use with opacity)
  overlay:      'rgba(31,41,55,0.55)', // Modal overlays

  // ── Dark Mode ──────────────────────────────────────────────
  dark: {
    background:    '#111827',
    surface:       '#1F2937',
    surfaceAlt:    '#374151',
    textPrimary:   '#F9FAFB',
    textSecondary: '#D1D5DB',
    textMuted:     '#9CA3AF',
    border:        '#374151',
    overlay:       'rgba(0,0,0,0.7)',
  },
};

module.exports = colors;

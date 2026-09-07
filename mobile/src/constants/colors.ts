// constants/colors.ts
// Inspired by IDFC First Bank (clarity, trust, #0C6B99 -> #1A6FD6) + Jupiter Neo (delight, bold indigo #4F46E5)

export const Colors = {
  // Primary (bridges IDFC #0C6B99 → Telepoint #1A6FD6)
  primary:      '#1A6FD6',   // vibrant blue — main brand action
  primaryDark:  '#1557B0',   // pressed state
  primaryLight: '#EFF5FF',   // light tint backgrounds

  // Accent (Jupiter influence — indigo gradient partner)
  accent:       '#4F46E5',   // indigo — gradient endpoint
  accentLight:  '#EEF2FF',   // indigo tint

  // Hero gradient (IDFC teal meets Jupiter indigo)
  gradientStart: '#1A6FD6',  // left: blue
  gradientMid:   '#2563EB',  // mid: royal blue
  gradientEnd:   '#4F46E5',  // right: indigo

  // Backgrounds (LIGHT — pure and clean)
  bgBase:        '#F5F8FF',  // very light blue-white page bg
  bgCard:        '#FFFFFF',  // card surfaces
  bgSurface:     '#F0F4FF',  // subtle section bg

  // Status colours
  success:       '#10B981',  // EMI paid, collected
  successLight:  '#ECFDF5',
  warning:       '#F59E0B',  // due soon
  warningLight:  '#FFFBEB',
  danger:        '#EF4444',  // overdue / alert
  dangerLight:   '#FEF2F2',

  // Text
  textPrimary:   '#0F172A',  // slate-900 — main text
  textSecondary: '#475569',  // slate-600 — subheadings
  textTertiary:  '#94A3B8',  // slate-400 — labels
  textOnGrad:    '#FFFFFF',  // text on gradient cards

  // Borders
  border:        '#E2E8F0',
  borderFocus:   '#1A6FD6',
  borderSubtle:  'rgba(15, 23, 42, 0.06)',

  // Special
  white:         '#FFFFFF',
  transparent:   'transparent',
} as const;

export type ColorType = typeof Colors;

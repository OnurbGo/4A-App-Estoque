/** As cores do Gestão 4A. Os mesmos valores estão no `tailwind.config.js`, para as classes. */
export const colors = {
  primary: '#047857',
  primaryDark: '#065f46',
  primarySoft: '#ecfdf5',
  background: '#f4f7f2',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  white: '#ffffff',
} as const;

export type ColorToken = keyof typeof colors;

import { colors } from '@/theme';

// O tailwind.config.js não importa TypeScript, então as cores ficam nos dois lugares.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwind = require('../tailwind.config.js') as {
  theme: { extend: { colors: Record<string, string | Record<string, string>> } };
};

describe('tema', () => {
  const classes = tailwind.theme.extend.colors;

  it('usa o verde e o fundo do Gestão 4A', () => {
    expect(colors.primary).toBe('#047857');
    expect(colors.background).toBe('#f4f7f2');
  });

  it('tem os mesmos valores nas classes do Tailwind', () => {
    expect(classes).toMatchObject({
      primary: {
        DEFAULT: colors.primary,
        dark: colors.primaryDark,
        soft: colors.primarySoft,
      },
      background: colors.background,
      surface: { DEFAULT: colors.surface, muted: colors.surfaceMuted },
      border: colors.border,
      ink: {
        DEFAULT: colors.text,
        secondary: colors.textSecondary,
        muted: colors.textMuted,
      },
      danger: { DEFAULT: colors.danger, soft: colors.dangerSoft },
      warning: { DEFAULT: colors.warning, soft: colors.warningSoft },
    });
  });
});

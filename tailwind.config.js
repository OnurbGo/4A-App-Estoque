/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#047857',
          dark: '#065f46',
          soft: '#ecfdf5',
        },
        background: '#f4f7f2',
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f8fafc',
        },
        border: '#e2e8f0',
        ink: {
          DEFAULT: '#0f172a',
          secondary: '#475569',
          muted: '#64748b',
        },
        danger: {
          DEFAULT: '#dc2626',
          soft: '#fee2e2',
        },
        warning: {
          DEFAULT: '#b45309',
          soft: '#fef3c7',
        },
      },
      fontFamily: {
        sans: ['DMSans_400Regular'],
        'sans-medium': ['DMSans_500Medium'],
        'sans-bold': ['DMSans_700Bold'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};

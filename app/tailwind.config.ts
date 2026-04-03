import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Finrate Design System — Prussian Blue + Turquoise
        prussian: {
          950: '#001829',
          900: '#003153',
          800: '#004070',
          700: '#005080',
        },
        turquoise: {
          300: '#7aeee6',
          400: '#40E0D0',
          500: '#2dd4bf',
        },
        // Dashboard light surface
        surface: {
          100: 'rgba(255,255,255,0.85)',
          50:  'rgba(255,255,255,0.72)',
        },
      },
      backgroundImage: {
        // Diagonal hero gradient (index.html'den)
        'hero-diagonal': 'linear-gradient(118deg, #003153 0%, #003153 38%, #40E0D0 58%, #ffffff 75%, #ffffff 100%)',
        // Turquoise accent gradient
        'tq-gradient': 'linear-gradient(135deg, #40E0D0 0%, #2dd4bf 100%)',
        // Dark sidebar gradient
        'dark-gradient': 'linear-gradient(135deg, #003153 0%, #001829 100%)',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glass-light': '0 2px 0 rgba(255,255,255,0.9) inset, 0 24px 60px rgba(0,49,83,0.18)',
        'glass-dark':  '0 8px 32px rgba(0,0,0,0.4)',
        'tq':          '0 0 24px rgba(64,224,208,0.55)',
        'tq-lg':       '0 0 40px rgba(64,224,208,0.4)',
        'card':        '0 2px 8px rgba(0,49,83,0.08)',
      },
      backdropBlur: {
        glass: '20px',
      },
      animation: {
        float:        'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}

export default config

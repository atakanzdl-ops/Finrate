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
        // Finrate Design System
        navy: {
          950: '#020b18',
          900: '#040D1E',
          800: '#071428',
          700: '#0a1c35',
          600: '#0d2444',
        },
        cyan: {
          400: '#22d3ee',
          500: '#0ECEAD',
          600: '#0EA5E9',
        },
        glass: 'rgba(255,255,255,0.07)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'cyan-gradient': 'linear-gradient(135deg, #0ECEAD 0%, #0EA5E9 100%)',
        'hero-gradient': 'linear-gradient(135deg, #040D1E 0%, #071428 60%, #0a1c35 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.37)',
        cyan: '0 0 30px rgba(14,206,173,0.3)',
        'cyan-lg': '0 0 60px rgba(14,206,173,0.2)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
    },
  },
  plugins: [],
}

export default config

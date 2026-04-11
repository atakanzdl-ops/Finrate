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
        navy: {
          900: '#060e1a',
          800: '#0a1628',
          700: '#0f2040',
        },
        prussian: {
          900: '#0B3C5D', // Brand Primary
          800: '#07263d',
        },
        turquoise: {
          500: '#2EC4B6', // Brand Secondary
          400: '#26af9f',
        },
        surface: {
          50: '#F8FAFC',  // Main background (off-white)
          100: '#FFFFFF', // Card background
        },
        border: {
          light: '#E5E9F0',
        },
        text: {
          primary: '#1E293B',
          secondary: '#6B7280',
          muted: '#8DA4BF',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        'premium': 'none',
        'card': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'elevated': '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
      },
      borderRadius: {
        'xl': '4px',
        '2xl': '6px',
        '3xl': '8px',
      }
    },
  },
  plugins: [],
}

export default config

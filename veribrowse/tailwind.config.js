/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './renderer/pages/**/*.{js,ts,jsx,tsx}',
    './renderer/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Clean, minimal color palette inspired by Fellou.ai
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        neutral: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        accent: {
          purple: '#8b5cf6',
          pink: '#ec4899',
          orange: '#f97316',
          green: '#10b981',
        },
        forest: {
          50: '#CFFFDC',  // Mint / Glass
          100: '#B8F7CB',
          200: '#9BE4B0',
          300: '#82D197',
          400: '#68BA7F', // Sage
          500: '#4D9B65',
          600: '#2E6F40', // Forest Green
          700: '#265C35',
          800: '#1E492A',
          900: '#253D2C', // Obsidian Forest
          950: '#1A2B1F',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh-gradient': 'radial-gradient(at 40% 20%, hsla(210, 100%, 70%, 0.15) 0px, transparent 50%), radial-gradient(at 80% 0%, hsla(189, 100%, 56%, 0.15) 0px, transparent 50%), radial-gradient(at 0% 50%, hsla(355, 100%, 93%, 0.15) 0px, transparent 50%)',
        'forest-gradient': 'linear-gradient(135deg, #2E6F40 0%, #68BA7F 100%)',
        'canopy-glow': 'radial-gradient(circle at top, #CFFFDC 0%, transparent 70%)',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'soft-lg': '0 10px 30px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
        'glow': '0 0 20px rgba(104, 186, 127, 0.3)',
        'forest-glow': '0 0 15px rgba(207, 255, 220, 0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'sway': 'sway 6s ease-in-out infinite',
        'growth': 'growth 0.5s ease-out forwards',
        'sunlight': 'sunlight 4s ease-in-out infinite',
        'loading-bar': 'loadingBar 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        sway: {
          '0%, 100%': { transform: 'rotate(-1deg) translateX(0)' },
          '50%': { transform: 'rotate(1deg) translateX(2px)' },
        },
        growth: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        sunlight: {
          '0%, 100%': { opacity: '0.3', filter: 'brightness(1)' },
          '50%': { opacity: '1', filter: 'brightness(1.2)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        loadingBar: {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(-20%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}

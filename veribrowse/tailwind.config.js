/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './renderer/app/**/*.{js,jsx}',
    './renderer/components/**/*.{js,jsx}',
    // fallback for pages if user decides to use them later or for structure consistency
    './renderer/pages/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#050505',
        metallic: '#d1d5db',
        glass: 'rgba(255, 255, 255, 0.05)',
        'glass-border': 'rgba(255, 255, 255, 0.1)',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.8)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        float: 'float 3s ease-in-out infinite',
      },
      // GPU acceleration utilities (Fellou.ai style)
      willChange: {
        'transform': 'transform',
        'opacity': 'opacity',
        'transform-opacity': 'transform, opacity',
      },
      backfaceVisibility: {
        'hidden': 'hidden',
        'visible': 'visible',
      }
    },
  },
  plugins: [],
}

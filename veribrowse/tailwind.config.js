/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './renderer/pages/**/*.{js,jsx}',
    './renderer/components/**/*.{js,jsx}',
    './renderer/app/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#050505',
        metallic: '#d1d5db',
        aurora: '#8b5cf6',
        cosmic: '#0ea5e9',
        glass: 'rgba(255,255,255,0.05)',
        'glass-border': 'rgba(255,255,255,0.1)',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0,0,0,0.8)',
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        float: 'float 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};

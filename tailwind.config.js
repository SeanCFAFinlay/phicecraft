/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'app-bg': '#06101a',
        'app-surface': '#0c1d2d',
        'app-border': 'rgba(0, 185, 230, 0.16)',
        'app-cyan': '#00c8f0',
        'app-cyan-dark': '#007fa8',
        'app-text': '#daf0f8',
        'app-dim': 'rgba(150, 210, 230, 0.42)',
        'app-gold': '#ffd60a',
        'app-red': '#e63946',
        'app-blue': '#3a86ff',
        'app-green': '#00e676',
        'app-orange': '#ff6b0f',
        'home': '#e63946',
        'away': '#3a86ff',
      },
      fontFamily: {
        'sans': ['-apple-system', 'SF Pro Display', 'Helvetica Neue', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

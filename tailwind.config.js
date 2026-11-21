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
      // Opacity steps the components use that Tailwind's default scale (0, 5,
      // 10 ... 95, 100) lacks. Without them a class like `bg-[#07131e]/98`
      // generates NO CSS at all - menus and panels rendered with no
      // background, white text straight over the white ice.
      opacity: {
        2: '0.02',
        8: '0.08',
        12: '0.12',
        88: '0.88',
        92: '0.92',
        94: '0.94',
        97: '0.97',
        98: '0.98',
      },
      fontFamily: {
        'sans': ['-apple-system', 'SF Pro Display', 'Helvetica Neue', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

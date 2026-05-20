/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A1628',
        muted: '#6B7280',
        faint: '#9CA3AF',
        hair: '#E5E7EB',
        surfacealt: '#F5F6F7',
        handle: '#D1D5DB',
      },
      fontFamily: {
        system: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        hand: [
          '"Permanent Marker"',
          '"Bradley Hand"',
          'cursive',
        ],
      },
    },
  },
  plugins: [],
};

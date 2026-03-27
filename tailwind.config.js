/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        blue:   { DEFAULT: '#1a56db', light: '#93c5fd', bg: '#eff6ff' },
        green:  { DEFAULT: '#0d7c3d', light: '#6ee7b7', bg: '#f0fdf4' },
        amber:  { DEFAULT: '#b45309', light: '#fcd34d', bg: '#fffbeb' },
        red:    { DEFAULT: '#dc2626', light: '#fca5a5', bg: '#fef2f2' },
        gray:   { DEFAULT: '#6b7280' },
        navy:   { DEFAULT: '#1a1a2e' },
        coral:  { DEFAULT: '#E85D3A' },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}

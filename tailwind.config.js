/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",           // Root'taki App.tsx ve index.tsx için
    "./components/**/*.{js,ts,jsx,tsx}", // Components klasörü için
    "./src/**/*.{js,ts,jsx,tsx}"     // İlerde src kullanırsan diye
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: { 850: '#151f2e', 900: '#0f172a' },
        jira: { blue: '#0052CC', darkBlue: '#172B4D' }
      },
      animation: { 'spin-slow': 'spin 3s linear infinite' }
    },
  },
  plugins: [],
}
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
    screens: {
      'xs': '375px',   // Extra small devices
      'sm': '640px',   // Small devices
      'md': '768px',   // Medium devices
      'lg': '1024px',  // Large devices
      'xl': '1280px',  // Extra large devices
      '2xl': '1536px', // 2X large devices
    },
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
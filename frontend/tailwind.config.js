/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}', // Esto le dice a Tailwind que escanee tus archivos de Vue
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

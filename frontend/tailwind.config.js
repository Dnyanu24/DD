/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // White and Blue-Green Theme
        clay: {
          50: '#F0FDFA',  // Light teal/white
          100: '#CCFBF1', // Very light teal
          200: '#99F6E4', // Light teal
          300: '#5EEAD4', // Teal accent
          400: '#2DD4BF', // Medium teal
          500: '#14B8A6', // Primary teal
          600: '#0D9488', // Dark teal
          700: '#0F766E', // Darker teal
          800: '#115E59', // Deep teal
          900: '#134E4A', // Darkest teal
        },
        // Additional blue-green tones
        teal: {
          DEFAULT: '#14B8A6',
          light: '#5EEAD4',
          dark: '#0D9488',
        },
        cyan: {
          light: '#CCFBF1',
          DEFAULT: '#06B6D4',
          dark: '#0891B2',
        },
        // Dark mode specific
        dark: {
          slate: '#0F172A',
          blue: '#1E293B',
          teal: '#134E4A',
        },
        // Light mode backgrounds
        cream: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "0.9" },
        },
      },
      animation: {
        "fade-up": "fade-up 700ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "float-slow": "float-slow 7s ease-in-out infinite",
        "pulse-soft": "pulse-soft 4.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}

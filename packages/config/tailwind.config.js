/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#FFF1F1",
          100: "#FFE0E0",
          200: "#FFC0C0",
          300: "#FF8A8A",
          400: "#FF6B6B",
          500: "#FF2C2C",
          600: "#E01B1B",
          700: "#B91414",
          800: "#8E0F0F",
          900: "#5C0A0A",
        },
        secondary: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#16a34a",
          700: "#15803d",
        },
        accent: {
          50: "#fffbeb",
          100: "#fef3c7",
          500: "#f59e0b",
          700: "#b45309",
        },
      },
      fontFamily: {
        telugu: ['"Noto Sans Telugu"', '"NTR"', "sans-serif"],
        heading: ['"Anek Telugu"', '"Noto Sans Telugu"', "sans-serif"],
        body: ['"Noto Sans Telugu"', '"NTR"', "sans-serif"],
      },
      fontSize: {
        "telugu-sm": ["0.875rem", { lineHeight: "1.7", fontWeight: "500" }],
        "telugu-base": ["1rem", { lineHeight: "1.8", fontWeight: "500" }],
        "telugu-lg": ["1.2rem", { lineHeight: "1.7", fontWeight: "700" }],
        "telugu-xl": ["1.4rem", { lineHeight: "1.5", fontWeight: "800" }],
        "telugu-2xl": ["1.75rem", { lineHeight: "1.4", fontWeight: "800" }],
        "telugu-3xl": ["2.1rem", { lineHeight: "1.35", fontWeight: "900" }],
      },
    },
  },
  plugins: [],
};

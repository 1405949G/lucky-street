/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Cinzel", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      colors: {
        obsidian: "#0a0f1c",
        "obsidian-2": "#0f172a",
        parchment: "#f8f6f0",
        gold: "#fbbf24",
        "gold-dim": "#d97706"
      }
    }
  },
  plugins: []
}

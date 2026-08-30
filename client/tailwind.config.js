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
        "parchment-2": "#f3ecd8",
        gold: "#fbbf24",
        "gold-dim": "#d97706",
        midnight: {
          950: "#070b14",
          900: "#0a1629",
          800: "#0f2231",
          700: "#132a3d",
          600: "#1e3a4f",
          500: "#254a63",
        },
        lantern: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
        fog: "#e2e8f0",
        "fog-muted": "#94a3b8",
      },
      boxShadow: {
        lantern: "0 0 32px rgba(251,191,36,0.35), 0 0 64px rgba(245,158,11,0.18)",
        "lantern-soft": "0 8px 32px rgba(251,191,36,0.22)",
        glass: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
      },
      animation: {
        flicker: "flicker 3.2s ease-in-out infinite",
        drift: "drift 18s ease-in-out infinite",
        shimmer: "shimmer 2.2s ease-in-out infinite",
        slideUp: "slideUp 0.35s ease-out",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%": { opacity: "0.92", filter: "brightness(1.08)" },
          "25%": { opacity: "0.96", filter: "brightness(0.98)" },
        },
        drift: {
          "0%, 100%": { transform: "translateX(0) translateY(0)" },
          "50%": { transform: "translateX(10px) translateY(-6px)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      backgroundImage: {
        "lantern-gradient": "radial-gradient(ellipse at top, rgba(251,191,36,0.18), transparent 58%)",
        "street-gradient": "linear-gradient(180deg, #070b14 0%, #0a1629 22%, #0f2231 48%, #132a3d 100%)",
      },
    }
  },
  plugins: []
}

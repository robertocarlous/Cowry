import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cowry: {
          green:   "#00D437",   // primary brand accent (new design)
          blue:    "#00D4FF",   // chat bubble accent (keep)
          purple:  "#7B2FBE",
          mint:    "#4AF8E4",
          dark:    "#0B0B0B",   // near-pure black background
          darker:  "#070707",
          card:    "#141414",   // dark gray card
          border:  "#242424",   // subtle gray border
          muted:   "#888888",   // gray muted text
          // Chat app palette
          primary:   "#35D07F",
          secondary: "#1A3C2E",
          surface:   "#F4F9F6",
          bubble:    "#E6F7EF",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "glow-green":  "radial-gradient(ellipse at 50% 0%, rgba(0,212,55,0.12) 0%, transparent 60%)",
        "glow-blue":   "radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.15) 0%, transparent 60%)",
        "glow-purple": "radial-gradient(ellipse at 80% 50%, rgba(123,47,190,0.12) 0%, transparent 50%)",
      },
      animation: {
        "float": "float 6s ease-in-out infinite",
        "glow":  "glow 3s ease-in-out infinite alternate",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-10px)" },
        },
        glow: {
          "0%":   { boxShadow: "0 0 20px rgba(0,212,255,0.3)" },
          "100%": { boxShadow: "0 0 40px rgba(0,212,255,0.6)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

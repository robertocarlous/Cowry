import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cowry: {
          // Landing page palette — matches logo
          blue:    "#00D4FF",
          purple:  "#7B2FBE",
          mint:    "#4AF8E4",
          dark:    "#0A0F1E",
          darker:  "#060A14",
          card:    "#0F1729",
          border:  "#1A2744",
          muted:   "#8FA3BF",
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

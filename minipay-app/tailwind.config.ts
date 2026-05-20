import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        celo: {
          green: "#35D07F",
          gold:  "#FBCC5C",
          dark:  "#1E2428",
        },
        cowry: {
          primary:   "#35D07F",
          secondary: "#1A3C2E",
          surface:   "#F4F9F6",
          bubble:    "#E6F7EF",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        spawn: {
          green: "#16a34a",
          "green-light": "#dcfce7",
          yellow: "#d97706",
          red: "#dc2626",
        },
      },
      fontFamily: {
        mono: ["'GeistMono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

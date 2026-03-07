import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0a0a0f",
          surface: "#12121a",
          border: "#1e1e2e",
        },
        accent: {
          indigo: "#6366f1",
          cyan: "#22d3ee",
          green: "#22c55e",
          red: "#ef4444",
          amber: "#f59e0b",
        },
        text: {
          primary: "#f1f5f9",
          secondary: "#94a3b8",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

// TravelSafe design system — original, deliberately calm.
// Per the anti-pattern guardrail spec, default styling is neutral / sand /
// sage; amber is reserved for "attention," dusk-red is used sparingly and
// never as the base palette of an everyday screen.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: {
          50:  "#FAF7F2",
          100: "#F2EBDD",
          200: "#E5D9BF",
          300: "#D2C19A",
          500: "#A48E63",
          700: "#6B5A38",
        },
        slate2: {
          50:  "#F1F3F5",
          200: "#C3CAD2",
          500: "#5D6A78",
          700: "#3A4654",
          900: "#1C232C",
        },
        sage: {
          200: "#CCDCC8",
          500: "#6C8B62",
          700: "#3F5C3B",
        },
        amber2: {
          200: "#F3D9A1",
          500: "#C18A2A",
          700: "#7E5C18",
        },
        dusk: {
          // Used only for genuinely severe-tier indicators. Never the dominant color.
          500: "#B95049",
          700: "#7D2A24",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;

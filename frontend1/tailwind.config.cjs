/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../desktop/src/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        current: "currentColor",
        transparent: "transparent",
        white: "#ffffff",
        black: "#050505",
        background: "#050505",
        surface: "#0a0a0f",
        "surface-bright": "#12121a",
        "surface-container": "#110b1a",
        "surface-container-high": "#1a1228",
        primary: "#2E183D",
        "primary-bright": "#C87CFF", // Neon purple glow highlight
        secondary: "#183E31",
        "secondary-bright": "#00FFC2", // Teal glow highlight
        tertiary: "#142838",
        "tertiary-bright": "#38BDF8", // Blue glow highlight
        "on-background": "#e2e8f0",
        "on-surface": "#cbd5e1",
        "on-surface-variant": "#94a3b8",
        "on-primary": "#ffffff",
        "on-secondary": "#ffffff",
        error: "#ef4444",
        "on-error": "#ffffff",
        outline: "#334155",
        "outline-variant": "#1e293b",
        glow: "rgba(200, 124, 255, 0.4)", // Primary glow base
      },
      fontFamily: {
        headline: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
        label: ["JetBrains Mono", "monospace", "Inter"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "1rem",
        full: "9999px",
      },
      letterSpacing: {
        widest: "0.2em",
      },
      animation: {
        "glow-pulse": "glowPulse 3s ease-in-out infinite alternate",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        glowPulse: {
          "0%": { textShadow: "0 0 10px rgba(200, 124, 255, 0.2)" },
          "100%": { textShadow: "0 0 20px rgba(200, 124, 255, 0.8), 0 0 30px rgba(200, 124, 255, 0.6)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};

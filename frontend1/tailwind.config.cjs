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
        background: "var(--background)",
        "background-secondary": "var(--background-secondary)",
        surface: "var(--surface)",
        "surface-bright": "var(--surface-bright)",
        "surface-container": "var(--surface-container)",
        "surface-container-high": "var(--surface-container-high)",
        primary: "var(--primary)",
        "primary-bright": "var(--primary-bright)",
        secondary: "var(--secondary)",
        "secondary-bright": "var(--secondary-bright)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-variant": "var(--text-variant)",
        "on-primary": "var(--text-on-primary)",
        "on-secondary": "var(--text-on-secondary)",
        error: "var(--error)",
        "on-error": "#ffffff",
        outline: "var(--outline)",
        border: "var(--border)",
        glow: "var(--glow)",
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

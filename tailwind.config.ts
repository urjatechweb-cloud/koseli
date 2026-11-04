import type { Config } from "tailwindcss";

const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        ink: c("ink"),
        muted: c("muted"),
        line: c("line"),
        marigold: c("marigold"),
        gurans: c("gurans"),
        leaf: c("leaf"),
        "marigold-soft": c("marigold-soft"),
        "gurans-soft": c("gurans-soft"),
        "leaf-soft": c("leaf-soft"),
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;

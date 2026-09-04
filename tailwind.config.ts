import type { Config } from "tailwindcss";

/**
 * Design tokens for the app. Deliberately not the default SaaS palette: no
 * indigo-600 primary, no rounded-card-on-everything. Ink/paper neutrals with
 * a single teal accent spent only on primary actions and active states;
 * amber and green are used functionally (urgent priority / tool success),
 * never decoratively.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFAF9",
        surface: "#FFFFFF",
        ink: "#1C1917",
        muted: "#78716C",
        hairline: "#E7E5E4",
        accent: {
          DEFAULT: "#0F6B62",
          hover: "#0B5048",
          subtle: "#E6F2F0",
        },
        urgent: {
          DEFAULT: "#B45309",
          subtle: "#FDF1E3",
        },
        success: {
          DEFAULT: "#15803D",
          subtle: "#EAF6EE",
        },
        danger: {
          DEFAULT: "#B91C1C",
          subtle: "#FCEAEA",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "6px",
      },
    },
  },
  plugins: [],
} satisfies Config;

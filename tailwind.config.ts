import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#101820",
        copper: "#d77a35",
        moss: "#6b8f71",
        aqua: "#3ab7bf",
        violet: "#7c5cff"
      }
    }
  },
  plugins: []
};

export default config;

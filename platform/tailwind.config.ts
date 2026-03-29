import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: { 50: "#EBF5FB", 100: "#D4E6F1", 200: "#AED6F1", 500: "#2E86C1", 600: "#2471A3", 700: "#1B4F72", 900: "#0D2B3E" },
      },
    },
  },
  plugins: [],
};

export default config;

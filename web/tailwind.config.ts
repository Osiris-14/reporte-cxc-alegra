import type { Config } from "tailwindcss";

// El diseño se porta con CSS fijo (globals.css) para clavar los hex del HTML de
// referencia. Tailwind queda disponible para utilidades puntuales.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;

import { defineConfig } from "vitest/config";

// Config aparte para el reporte de KPIs (lee la data real del repo por fs).
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
  },
});

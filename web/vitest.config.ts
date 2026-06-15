import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `npm test` corre solo los tests de lógica; el reporte de KPIs va aparte.
    include: ["lib/**/*.test.ts"],
  },
});

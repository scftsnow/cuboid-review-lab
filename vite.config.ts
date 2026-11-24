import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  test: {
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/e2e/**/*.spec.ts", "node_modules/**", "dist/**"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
  },
});

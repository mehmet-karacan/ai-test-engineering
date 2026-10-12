import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/retired/**", "**/node_modules/**", "**/.git/**"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

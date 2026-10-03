import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "./",
  build: { assetsInlineLimit: 0 },
  test: { include: ["tests/*.test.ts"] },
});

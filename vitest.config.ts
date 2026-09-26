import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Components are rendered straight from TSX in `tests/render.test.ts`, so the
  // test pass needs the same automatic runtime Next compiles with.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the app's pure modules (src/lib); screens are checked by
// bundling (`pnpm export:*`), not here.
export default defineConfig({
  resolve: {
    alias: {
      "@web": fileURLToPath(new URL("../web/lib", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.ts"] },
});

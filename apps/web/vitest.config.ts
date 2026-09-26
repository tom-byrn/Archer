import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

// The app's `@/` alias, and Next's empty `server-only` (it only exists inside Next's bundler).
// JSX compiles to React's automatic runtime, as Next compiles it, so tests can render components.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": require.resolve("next/dist/compiled/server-only/empty.js"),
    },
  },
});

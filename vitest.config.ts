import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Test config. Deliberately does not load `vite.config.ts` (which pulls in the
 * vly/React plugins) — the `@` alias and esbuild JSX handling are configured
 * here directly. Default environment stays `node` for the pure logic tests;
 * component tests opt into jsdom via a `@vitest-environment jsdom` docblock.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    setupFiles: ["src/test/setup.ts"],
  },
});

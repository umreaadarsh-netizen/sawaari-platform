import { defineConfig } from "vitest/config";

/**
 * Unit-test config. Deliberately does not load `vite.config.ts` (which pulls
 * in the vly/React plugins) — these are pure node-side logic tests.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
});

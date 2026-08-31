import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * First Vitest config in this repository (tasks 16.1-16.4).
 *
 * WHY IT EXISTS: route handlers and most `lib/` modules import through the `@/`
 * alias declared in `tsconfig.json` (`"@/*": ["./*"]`). Vitest does not read
 * `tsconfig` paths, so before this file existed no handler could be imported by
 * a test at all. That is why Phase 1 had to assert route contracts from SOURCE
 * and why the Phase 10 migrations shipped with no executing coverage.
 *
 * ENVIRONMENT SPLIT: `environmentMatchGlobs` was REMOVED in Vitest 4, so the
 * per-glob environment is expressed with `projects` instead — the only
 * declarative mechanism left. `node` is the default for pure modules and route
 * handlers; `jsdom` is scoped to `tests/hooks/**` and `tests/components/**`,
 * which is where the Phase 17/18 client tests will land.
 *
 * IMPORT CONVENTION (decision recorded for task 16.4): the 18 pre-existing test
 * files STAY on relative imports. `@/` is additive and is used only by new
 * tests. Mass-migrating existing imports in the same change that introduces
 * module resolution would put the only safety net at risk for no benefit.
 */

const alias = {
  "@": resolve(import.meta.dirname, "."),
};

const jsdomGlobs = ["tests/hooks/**/*.{test,spec}.{ts,tsx}", "tests/components/**/*.{test,spec}.{ts,tsx}"];

export default defineConfig({
  resolve: { alias },
  test: {
    restoreMocks: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.{test,spec}.{ts,tsx}"],
          exclude: ["**/node_modules/**", ...jsdomGlobs],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: jsdomGlobs,
          exclude: ["**/node_modules/**"],
          setupFiles: ["./tests/setup/jsdom-setup.ts"],
        },
      },
    ],
  },
});

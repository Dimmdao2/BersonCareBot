import { defineConfig } from "vitest/config";
import path from "node:path";

const sharedEnv = { DOTENV_CONFIG_QUIET: "true" } as const;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    globalSetup: ["./vitest.globalSetup.ts"],
    setupFiles: ["./vitest.setup.ts"],
    env: sharedEnv,
    /** Кэш модулей между прогонами (путь по умолчанию: node_modules/.experimental-vitest-cache) */
    experimental: {
      fsModuleCache: true,
    },
    projects: [
      {
        extends: true,
        name: "fast",
        test: {
          name: "fast",
          environment: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "e2e/**/*.test.ts"],
          exclude: ["node_modules", ".next", "**/e2e/*inprocess*.test.ts"],
          testTimeout: 20_000,
          hookTimeout: 25_000,
        },
      },
      {
        extends: true,
        name: "inprocess",
        test: {
          name: "inprocess",
          environment: "node",
          include: ["e2e/*inprocess*.test.ts"],
          exclude: ["node_modules", ".next"],
          /** Отдельные `it` без холодного графа — как в `fast`; долгий прогрев только в `beforeAll` со своим timeout */
          testTimeout: 20_000,
          hookTimeout: 25_000,
        },
      },
    ],
  },
});

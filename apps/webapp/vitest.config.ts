import { defineConfig } from 'vitest/config';
import path from 'node:path';

const sharedEnv = { DOTENV_CONFIG_QUIET: 'true' } as const;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    globalSetup: ['./vitest.globalSetup.ts'],
    setupFiles: ['./vitest.setup.ts'],
    env: sharedEnv,
    // §owner 28.06: КАП ВОРКЕРОВ — тесты не форкаются на все ядра (вешали коробку и голодили мозг — инцидент #214).
    // Дефолт 2 (~25% от 8 vCPU). Полная мощность ОСОЗНАННО: VITEST_MAX_WORKERS=8 pnpm test.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
    /** Кэш модулей между прогонами (путь по умолчанию: node_modules/.experimental-vitest-cache) */
    experimental: {
      fsModuleCache: true,
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'fast',
          environment: 'node',
          include: [
            'src/**/*.test.ts',
            'src/**/*.test.tsx',
            'e2e/**/*.test.ts',
          ],
          exclude: [
            'node_modules',
            '.next',
            'src/**/*.unit.test.ts',
            'src/**/*.route.test.ts',
            'src/**/*.ui.test.tsx',
            'src/**/*.postgres.integration.test.ts',
            'src/**/*.devDb.integration.test.ts',
          ],
          testTimeout: 20_000,
          hookTimeout: 25_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.unit.test.ts'],
          exclude: ['node_modules', '.next'],
          testTimeout: 20_000,
          hookTimeout: 25_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'route',
          environment: 'node',
          include: ['src/**/*.route.test.ts'],
          exclude: ['node_modules', '.next'],
          testTimeout: 20_000,
          hookTimeout: 25_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.ui.test.tsx'],
          exclude: ['node_modules', '.next'],
          setupFiles: ['./vitest.setup.ts', './vitest.ui.setup.ts'],
          testTimeout: 20_000,
          hookTimeout: 25_000,
        },
      },
    ],
  },
});

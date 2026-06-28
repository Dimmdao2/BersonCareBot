import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'e2e/**/*.test.ts'],
    // §owner 28.06: кап воркеров — тесты не вешают коробку/мозг. Дефолт 2; полная: VITEST_MAX_WORKERS=8.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
  },
});

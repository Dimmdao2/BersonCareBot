import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Disposable-PostgreSQL integration project (block Б1, #1081). Deliberately NOT one of the
 * `projects` entries in the main `vitest.config.ts`: `pnpm --dir apps/webapp test` (plain
 * `vitest --run`, no --project filter) must stay untouched by this -- these tests build a real
 * database from the migration chain per run and are not part of the fast PR shard. Run explicitly
 * via `pnpm --dir apps/webapp test:postgres`.
 *
 * Own named project ("postgres-integration") so `vitest list --config vitest.postgres.config.ts`
 * shows every file matching the suffix below, satisfying "тесты видны раннеру" for this harness
 * without pulling them into the default `vitest --run` sweep.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    name: 'postgres-integration',
    environment: 'node',
    include: ['src/**/*.postgres.integration.test.ts'],
    exclude: ['node_modules', '.next'],
    globalSetup: ['./vitest.postgres.globalSetup.ts'],
    setupFiles: ['./vitest.postgres.setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One clone per test file; do not fan this out wide against a single local PG16 instance.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
  },
});

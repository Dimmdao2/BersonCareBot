import { fileURLToPath } from 'node:url';
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
  resolve: {
    alias: {
      // Тесты интегратора резолвят workspace-пакет в ИСХОДНИК, а не в собранный dist. dist гитигнорится
      // и собирается только в `build`, который в `ci` идёт ПОСЛЕ `test`; импорт пакета в тесте иначе грузил
      // бы устаревший артефакт. Находка #54: тест messengerBindAuditEnrichment падал на протухшем dist с
      // `public.telegram_users`, хотя src уже был исправлен. Алиас на src делает тесты независимыми от сборки.
      '@bersoncare/platform-merge': fileURLToPath(
        new URL('../../packages/platform-merge/src/index.ts', import.meta.url),
      ),
    },
  },
});

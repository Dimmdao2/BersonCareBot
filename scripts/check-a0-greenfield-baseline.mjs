#!/usr/bin/env node

import { assertCleanRefreshSource, validatePackage } from './a0-greenfield-baseline-lib.mjs';

try {
  // Сверка идёт через `git show HEAD:<файл>`, то есть против КОММИТА. Правка миграции, лежащая в
  // рабочем дереве, ей поэтому не видна: гейт зелёный, а на диске уже другая схема. Отказываем, пока
  // источник грязный, — «не могу проверить» обязано быть красным, а не зелёным.
  assertCleanRefreshSource();
  const result = validatePackage();
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        schemaSha256: result.manifest.baseline.schemaSha256,
        census: result.schemaScan.census,
        manifestEntries: {
          integrator: result.manifest.ledgers.integrator.entries.length,
          drizzle: result.manifest.ledgers.drizzle.entries.length,
        },
        pendingCurrentMigrations: {
          integrator: result.pending.integrator.length,
          drizzle: result.pending.drizzle.length,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `check-a0-greenfield-baseline: ${error instanceof Error ? error.message : 'unknown_error'}`,
  );
  process.exit(1);
}

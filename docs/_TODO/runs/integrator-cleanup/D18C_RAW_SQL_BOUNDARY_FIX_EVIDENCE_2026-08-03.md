# Track D D18c — evidence фикса raw SQL boundary

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D18/D18c;
oracle: `D18C_FINAL_RAW_SQL_INDEPENDENT_AUDIT_2026-08-03.md`, MUST FIX class 5.

## Исправление

`scripts/check-no-new-raw-sql.mjs` больше не считает весь
`apps/webapp/src/infra/db/` low-level boundary. Вместо directory-wide prefix там
явный список 15 существующих низкоуровневых DB-файлов; новый production-файл не
может расширить эту границу сам размещением в каталоге.

В `projectionHealthCore.test.ts` добавлена проверка Drizzle-компиляции с
`retryThreshold: 4`: запрос содержит placeholder и параметр `[4]`, поэтому
подмена порога значением default не проходит тест.

## Проверки

- `node scripts/check-no-new-raw-sql.mjs --self-test` — OK; synthetic arbitrary
  `apps/webapp/src/infra/db/rawSqlD18cBoundaryFixture.ts` rejected.
- Fault injection: временный
  `apps/webapp/src/infra/db/__d18c_fault_injection.ts` с `pool.query('SELECT 1')`;
  `node scripts/check-no-new-raw-sql.mjs --census` завершился exit 1 и назвал файл
  `production debt`. Инъекция удалена до итогового census.
- Итоговые targeted tests, raw-SQL census/self-test, typecheck, scoped lint и
  `git diff --check` приведены в коммитном evidence этой правки.

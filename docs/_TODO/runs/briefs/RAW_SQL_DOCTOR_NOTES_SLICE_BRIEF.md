# Сырой SQL-текст — doctor notes list slice (#1082)

Прочитать `AGENTS.md` §5/§10a/§24. Authority:
`docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md` и принятый census audit `300772f3d`.

Источник оракула: `AGENTS.md` §5 «Доступ к базе — оба приложения, без исключений» — «К базе — только через
порт своего приложения на drizzle»; census `RAW_SQL_TEXT_CENSUS.md` фиксирует этот вызов в live-tier.

## Последствие

Врач открывает карточку пациента и список клинических заметок. `pgDoctorNotes.listForUser` всё ещё отправляет
legacy SQL строкой с `$1..$2`; рядом с принятой Drizzle-дверью остаётся рабочий обход на реальном read-path.

## Scope

Изменить только `apps/webapp/src/infra/repos/pgDoctorNotes.ts`: заменить единственный `runWebappPgText` в
`listForUser` на существующий `getWebappSqlDb().select()` по существующей Drizzle schema `doctorNotes`.

Сохранить без изменения:

- обязательный фильтр `user_id = userId`;
- условный фильтр организации: при `organizationId` фильтровать её, без значения сохранять all-org чтение;
- порядок `created_at DESC`;
- существующие `DoctorNotesPort`, `mapRow`, callers и типы результата.

Не создавать helper/port/schema/migration/DB test/harness; не менять другие методы/файлы и не возвращать удалённый
source-shape test. DB/DEV/TEST/PROD не трогать.

## Приёмка и сдача

Это разовая transport-конверсия: итоговый diff/AST должен показать в файле `runWebappPgText` 1→0 без
`webappSqlFromPgText`/`sql.raw`, а Drizzle query — exact user predicate, conditional organization predicate и
descending created-at order. Запустить `git diff --check`, scoped eslint, webapp typecheck и
`node scripts/check-no-new-raw-sql.mjs`. Коммитить только product-файл и короткий evidence report рядом с census;
checkbox/DB/taskdb не трогать, не пушить. После worker нужен один независимый inspection audit.

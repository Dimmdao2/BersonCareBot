# STAGE_A — Inventory & Risk Map (Composer)

## Цель

Подготовить точную карту текущего состояния миграций webapp: что находится в legacy SQL, что уже покрыто Drizzle, и где есть runtime-critical пробелы.

## Шаги

1. Собрать список всех файлов `apps/webapp/migrations/*.sql`.
2. Собрать список всех файлов `apps/webapp/db/drizzle-migrations/*.sql`.
3. Для каждого legacy-файла отметить:
   - покрыт ли он Drizzle-аналогом;
   - обязателен ли он для runtime сейчас;
   - риск повторного применения.
4. Отдельно отметить "critical for runtime" (например, колонки, участвующие в SELECT в проде).
5. Подготовить компактную таблицу соответствия в `LOG.md` или отдельным блоком.

## Решения по классификации

### Runtime-critical

DDL считать runtime-critical, если таблица/колонка/constraint/index используется текущим runtime-кодом webapp или host-процессом, который работает с webapp/public schema:

- `apps/webapp/src/**` (routes, pages, modules, infra repos, internal API);
- `apps/webapp/scripts/**`, если скрипт используется в production/deploy/backfill/reconcile flow;
- `apps/media-worker/**`, если он читает/пишет таблицы public schema;
- deploy/ops checks, если они напрямую проверяют или используют объект БД.

Если связь с runtime неочевидна, помечать как `unknown` и выносить в risk list для Codex на Stage B. Composer не должен делать окончательное решение "удалить/игнорировать" для `unknown`.

### Drizzle coverage

Legacy DDL считается покрытым Drizzle только по фактическому schema-смыслу, а не по номеру/имени миграции:

- `exact` — тот же объект и совместимые тип/default/nullability/check/index есть в Drizzle schema и migration SQL;
- `logical` — рантайм-инвариант покрыт, но формулировка DDL отличается безопасно;
- `partial` — покрыта часть объекта или есть расхождения;
- `missing` — аналога нет;
- `unknown` — Composer не может уверенно сопоставить без Codex review.

Для `partial`, `missing`, `unknown` обязательно указать, чем это опасно для Stage B.

### Ledger / повторное применение

Composer должен отметить, где риск связан не с самим DDL, а с разными ledger-механизмами:

- legacy runner: `public.webapp_schema_migrations`;
- Drizzle runner: `drizzle.__drizzle_migrations` (или фактическая Drizzle metadata table в текущей конфигурации).

Stage A только фиксирует риск и контекст. Решение о repair/compat/удалении ledger остается Stage B (Codex).

## Выход этапа

- список legacy DDL, требующих переноса/закрытия;
- список legacy DDL, которые можно архивировать;
- список рисков для Stage B.

## Gate закрытия

- инвентаризация завершена;
- нет "неразмеченных" legacy-миграций;
- все `partial` / `missing` / `unknown` вынесены в risk list;
- в `LOG.md` есть итог этапа A.

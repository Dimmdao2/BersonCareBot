# Тест или взгляд: Track D D30 online-index deploy boundary

Смешанный независимый pass: реальный PostgreSQL lifecycle и fault injection — тест; полнота четырёх deploy
маршрутов, transaction contract и отсутствие расширения scope — взгляд.

Источник оракула: `AGENTS.md` § «Миграции: индекс на горячую колонку — в том же PR» — «На уже большой — только `CREATE INDEX CONCURRENTLY` вне транзакции миграции (при раннере, оборачивающем всё в транзакцию — отдельный online-шаг)».

## Scope

Кандидат: `9f125017f` поверх принятого D30-P1 в `wt/trackd-d30-specialist`.
Authority/finding: `TRACK_D_D30_ONLINE_INDEX_FIX_BRIEF.md` и audit queue row for `316342d7b`/`9f125017f`.

Один независимый аудит, без правок продукта. DEV/TEST/PROD, сервисы, порты и реальные env не трогать.

## Обязательный kill-set

1. Доказать по установленному `drizzle-orm`, что pending PostgreSQL migrations действительно идут внутри одной
   транзакции, и что исходный `CREATE INDEX CONCURRENTLY` был достижимым deploy-failure, а не теорией.
2. На одноразовом PostgreSQL применить standalone artifact к небольшой совместимой таблице либо эквивалентному
   exact fixture: первый запуск создаёт valid/ready exact index, повтор идемпотентен, invalid/unready residue
   удаляется и восстанавливается; same-name valid, но несовместимый index не удаляется молча и финальный gate
   падает.
3. Проверить каждый wrapper отдельно: `migrate-dev.sh`, `deploy-test.sh`, `deploy-test-saas.sh`, `deploy-prod.sh`.
   Artifact обязан выполняться после успешного Drizzle и до restart, отдельным autocommit `psql`, с уже
   существующими target/env/role conventions и fail-closed missing-file behavior.
4. Временными обратимыми поломками доказать, что structural gate ловит минимум:
   - `CREATE INDEX CONCURRENTLY` обратно внутри любого Drizzle SQL;
   - отсутствие reference в каждом из четырёх wrappers;
   - вызов artifact до migrate;
   - неверное имя/таблицу/порядок колонок или отсутствие valid/ready/non-partial assertions.
   Для каждой поломки записать команду и exit; восстановить byte-identically.
5. Повторить shell syntax, migration self-test/journal gate, D30 targeted tests, оба typecheck, scoped lint,
   raw-SQL/queue gates и `git diff --check` в разумном объёме. Full CI не запускать.

## Verdict

`PASS` только если kill-set полностью убит и рабочее дерево чистое. Иначе один `MUST FIX` с достижимым сценарием,
impact и точным нарушенным требованием. Записать отчёт в `docs/_TODO/runs/integrator-cleanup/` и обновить audit
queue отдельным audit-коммитом; продуктовый код не менять, push не выполнять.

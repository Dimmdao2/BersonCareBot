# Rubitime retirement agent README

> **АРХИВ:** Rubitime выведено `2026-07-27`. Документ сохранён только для аудита завершённого retirement и
> воспроизведения старых fresh-copy прогонов; это не текущий runtime или operator runbook.

Статус: единая операционная точка входа для агентов, рабочая ветка `feat/doctor-ui-rebuild`, обновлено 2026-07-19.

Цель: один понятный порядок действий для агента, которому нужно продолжать Rubitime retirement или
подготовить свежий prod dump к canonical booking proof. Не начинать с нового SQL и не придумывать новые
backfill/data-fix скрипты: в рабочей ветке уже есть выверенные scripts, deploy-wrappers и audit docs.

Последний green proof: owner-authorized full-chain replay на `bersoncarebot_test` 2026-07-19 через единственный
destructive entrypoint `deploy/host/deploy-test-full-reset.sh --confirm-full-reset`: data-fix → migrations →
Rubitime/history normalization → reviewed FIO → strict closure → five-unit health/locked smoke PASS. Он использовал
уже защищённый локальный fresh dump и не тянул production повторно. Предыдущий disposable proof 2026-07-14 также
сохраняется как независимое подтверждение. Подробный агрегатный отчет:
`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md`.

Главный execution plan: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md`.
Этот README отвечает на вопрос "что читать и что делать сначала". Execution plan отвечает на вопрос
"какие phase-gates еще не закрыты".

## Быстрый ответ для следующего агента

1. Работай в `feat/doctor-ui-rebuild`, не в `main`.
2. Сначала прочитай этот README, потом execution plan и перечисленные ниже runbook/script-файлы.
3. Для состава Rubitime-записей канон — свежая выгрузка Rubitime CSV, а не `integrator.rubitime_records`.
4. Записи, которых нет в свежем CSV, не импортировать и не воскресать в canonical только из-за integrator raw state.
5. Если свежий CSV есть, integrator-led reconciliation запрещен: `integrator.rubitime_records` не может расширить
   preservation set, создать новый backfill backlog или заблокировать R1/R2/R6/R7 по строкам, которых нет в CSV.
6. Числа `legacy-only=290/312` означают расхождение архивов `appointment_records` и `integrator.rubitime_records`.
   Это не список видимых грязных записей и не самостоятельный blocker, если CSV-present rows закрыты.
7. Для clean dump уже есть валидный путь: owner doctor/admin pre-fix → `scripts/deploy-saas-667.sh` или
   `deploy/host/deploy-test-full-reset.sh` (internal engine: `deploy-test-saas.sh`) → placeholder booking purge → specialist consolidation → canonical backfill
   → R1 aggregate audits → doctor UI smoke.
8. Остаточные R5/R6/R7 owner/prod решения собраны в
   `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md`.
9. Перед handoff запускай `pnpm run check:rubitime-retirement-current`; финальный
   `pnpm run check:rubitime-retirement-complete` обязан оставаться красным до R5/R6/R7 proof-файлов.
10. R6 route/code removal нельзя принимать или разворачивать до owner-approved cutoff/drain proof из
    `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`. В ветке уже есть преждевременно
    применённые removal-артефакты; они считаются только repository provenance, не закрывают R6 и сами по себе не
    разрешают ни deploy, ни дальнейшее удаление, ни восстановление маршрутов.
11. R7 archive/drop нельзя делать до полного R1-R6 proof и отдельного owner archive/drop решения.
12. После успешного rehearsal TEST-БД считается подготовленной постоянной рабочей базой. Обычный code deploy идёт
    только через `deploy-test.sh`; повторный full reset запрещён без нового явного решения владельца.

## Что сказал Sol / что из этого следует

Sol-проверка старого локального dump была полезным FAIL: простой путь "restore + plain migrate + новый backfill"
не является валидным rehearsal. Причина не в Rubitime как каноне, а в неполной/устаревшей копии и отсутствии
обязательных входов текущего процесса.

После этого свежий current prod dump прошел корректный approved sequence. Поэтому текущий вывод такой:

- R1 clean-copy proof закрывается существующими wrapper/scripts, а не новым SQL.
- Replay годится только для свежей текущей копии с тем же owner CSV и resolver decisions.
- При наличии свежего Rubitime CSV `integrator.rubitime_records` остается diagnostic/audit source.
- Следующие фазы должны идти по execution plan; нельзя перескакивать через R6 cutoff/drain и R7 archive/drop gates.

## Главный инвариант данных

Для R1/R2/Rubitime retirement канон состава записей — свежая выгрузка Rubitime CSV.

- Есть в свежем CSV — запись нужна: она должна быть сохранена, импортирована, смэпплена в canonical или явно
  owner-waived.
- Нет в свежем CSV — запись не нужна для preservation gate и не должна воскресать в canonical только потому, что
  она нашлась в старом integrator raw/projection state.
- `integrator.rubitime_records` — только audit/diagnostic material, когда свежий CSV есть. Он не источник истины
  для импорта, удаления или блокировки R1/R2.
- Даже если в `integrator.rubitime_records` лежат дополнительные строки, они не расширяют preservation set:
  без подтверждения свежим Rubitime CSV это не нужные записи и не повод для нового backfill.
- Любое расхождение `integrator.rubitime_records` с CSV решается в пользу CSV. Integrator-only строки, которых нет
  в CSV, не импортировать, не восстанавливать и не считать cleanup blocker.
- Текущий owner-approved экспорт сопоставляется через существующие city/branch mappings и относится к одному
  специалисту владельца, идентифицированному по телефону `89643805480` / tail `9643805480`.
- Не заводить отдельный reconciliation against integrator: если CSV есть, integrator raw нужен только для audit
  deltas и не может расширять состав записей сверх CSV.
- Не делать новый cleanup/backfill только потому, что integrator raw отличается от CSV. Отличие integrator от CSV
  описывается как архивная дельта, а не как рабочий список для импорта.
- Счетчики вида `legacy-only=290` означают разницу архивов `public.appointment_records` vs
  `integrator.rubitime_records`, а не список грязных видимых записей. Live rows уже должны быть представлены в
  canonical; unmapped residue должен быть soft-deleted или owner-waived. Решение принимает CSV, не integrator.

## 0. Абсолютные правила

- Работать в той ветке, которую явно назвал владелец. Для этой инструкции это `feat/doctor-ui-rebuild`.
- Не трогать production DB, `/opt/env`, live services или реальные каналы без отдельной прямой команды владельца.
- Не запускать rehearsal на `bcb_webapp_prod`, `bcb_webapp_test` или `bcb_webapp_dev`.
- Не запускать plain `pnpm migrate` на fresh prod dump как самостоятельное доказательство.
- Не писать ad hoc SQL, пока не доказано, что существующие скрипты ниже не покрывают задачу.
- Любой R1 отчет должен быть aggregate-only: без пациентских ФИО, телефонов, email, raw payloads и внешних ids.
- R2/R3/R4 Rubitime retirement запрещены, пока R1 clean-copy proof не закрыт и не принят владельцем.
- Не превращать `integrator.rubitime_records` anti-join в blocker, если свежий CSV и canonical proof уже закрывают
  состав данных.
- Не требовать `appointment_records` vs `integrator.rubitime_records` delta = 0. Требовать только, чтобы каждая
  CSV-present запись была imported/mapped/owner-waived.
- Не объяснять остатки `legacy-only` как "активные проблемы", пока не сверены CSV-present buckets. Понятный язык:
  "это архивная разница между источниками; живой канон решает свежий CSV".
- Не снимать Rubitime runtime routes до R6 cutoff/drain proof. Если proof не готов, фиксируй это как gate, а не
  делай преждевременное удаление.

## 1. Что читать на старте

Сначала агент читает базовые правила репозитория:

1. `AGENTS.md`
2. `README.md`
3. `docs/README.md`
4. `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
5. `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`
6. `deploy/HOST_DEPLOY_README.md`
7. `docs/AGENT_AUTORUN_SCHEME.md`
8. `.cursor/rules/unified-task-db.mdc`
9. `.cursor/rules/test-execution-policy.md`
10. `.cursor/rules/pre-push-ci.mdc`
11. `.cursor/rules/dev-prod-isolation-no-real-creds.mdc`

Затем агент читает booking/Rubitime операционные документы в рабочей ветке:

1. `docs/archive/2026-07-rubitime-retirement/BOOKING_CANONICAL_CUTOVER.md`
2. `docs/OPERATIONS/SPECIALIST_IDENTITY_CONSOLIDATION.md`
3. `docs/archive/2026-07-rubitime-retirement/APPOINTMENTS_PARITY_S0.md`
4. `docs/archive/2026-07-rubitime-retirement/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`
5. `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts`
6. `apps/webapp/scripts/purge-placeholder-bookings.ts`
7. `apps/webapp/scripts/consolidate-specialist-identity.ts`

Затем агент читает R1 execution-пакет:

1. `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md`
2. `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`
3. `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md`
4. `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BLOCKER_CLASSIFICATION.md`
5. `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md`
6. `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-clean-dump-preflight.mjs`
7. `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs`
8. `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs`

Эти файлы лежат в исторической папке инициативы, но для текущей задачи это не повод начинать новую
инициативу. Это уже существующий R1 package, который надо исполнять и уточнять.

## 2. Что уже есть

| Задача                                                                                        | Скрипт/документ                                                      | Статус |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| Canonical backfill из legacy/Rubitime appointment data                                        | `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` | Есть   |
| Удалить тест/блок-записи, включая Дмитрия Берсона как patient placeholder, не удаляя аккаунты | `apps/webapp/scripts/purge-placeholder-bookings.ts`                  | Есть   |
| Свести дубли специалистов в одного активного специалиста                                      | `apps/webapp/scripts/consolidate-specialist-identity.ts`             | Есть   |
| Операционный cutover canonical booking                                                        | `docs/archive/2026-07-rubitime-retirement/BOOKING_CANONICAL_CUTOVER.md`                       | Есть   |
| Инструкция по specialist consolidation                                                        | `docs/OPERATIONS/SPECIALIST_IDENTITY_CONSOLIDATION.md`               | Есть   |
| Pre-migration doctor/admin/client identity data-fix                                           | `deploy/postgres/p0-data-fix-doctor-admin-split.sql`                 | Есть   |
| Fresh TEST restore + migrate + data-fix entrypoint                                            | `deploy/host/deploy-test-full-reset.sh`                              | Есть   |
| Full fresh prod-copy migration chain                                                          | `scripts/deploy-saas-667.sh`                                         | Есть   |
| R1 preflight/audit scripts                                                                    | `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-*.mjs`               | Есть   |

## 3. Пользователи, роли, копии, тесты

Канонические источники для этого раздела:

- `docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md`
- `docs/_TODO/SAAS_FOUNDATION/DEPLOY_667_SEQUENCE.md`
- `docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md`
- `deploy/host/deploy-test-saas.sh`
- `scripts/deploy-saas-667.sh`

### 3.1. OS users

| OS user    | Где используется                                          | Что делает                                                                                       | Что не делает                                        |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `dev`      | рабочий checkout `/home/dev/dev-projects/BersonCareBot`   | запускает агентские проверки, читает repo docs, запускает wrapper scripts из repo                | не лезет в prod DB/env самовольно, не правит crontab |
| `postgres` | локальный PostgreSQL host                                 | создает/восстанавливает disposable DB, читает dump TOC, делает local grants                      | не является app runtime user                         |
| `deploy`   | `/opt/projects/bersoncarebot-test` и prod deploy checkout | строит/запускает app под env target-среды, читает test/prod env только в owner-approved ops flow | не имеет произвольного sudo; root ops отдельно       |

Обычный Linux user `dev` не обязан существовать как PostgreSQL role. Если `psql` от `dev` падает
`role "dev" does not exist`, это нормально: использовать `sudo -u postgres` для локальной disposable DB
или target runtime-owner URL из env/wrapper.

### 3.2. PostgreSQL role classes

| Role class               | Пример в TEST/PROD                      | Назначение                                                                                       | Инвариант                                                                                   |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Runtime owner / migrator | `bersoncarebot_test`, `bcb_webapp_prod` | владелец существующих таблиц, под ним идет `migrate-all.sh`                                      | временно получает `BYPASSRLS` только внутри deploy-chain и потом обязан стать `NOBYPASSRLS` |
| Superuser/operator       | `postgres` или `SUPERUSER_URL`          | создает dormant roles/schema, включает/снимает временную эскалацию, делает post-state assertions | не подставляется как app runtime                                                            |
| App owner                | `app_owner`                             | `NOLOGIN` owner для protected helpers/schema после P2-B                                          | membership у migrator только временная и снимается trap-ом                                  |
| Staff runtime            | `app_staff`                             | будущий runtime staff role                                                                       | `NOBYPASSRLS`, не owner                                                                     |
| Patient runtime          | `app_patient`                           | будущий runtime patient role                                                                     | `NOBYPASSRLS`, не owner                                                                     |
| Disposable read-only     | например `bcb_rubitime_rehearsal_ro`    | только локальные aggregate preflight/audits на restored copy                                     | `SELECT` only, не мигратор, не runtime                                                      |

Главное правило #667: migration chain идет под runtime-owner role, потому что webapp migrations делают
owner-only DDL. Но integrator backfill под включенным/FORCE RLS требует временный `BYPASSRLS`. Поэтому
`scripts/deploy-saas-667.sh` временно эскалирует runtime-owner через `SUPERUSER_URL`, а затем снимает
`BYPASSRLS` и `app_owner` membership через `EXIT` trap.

`p0-data-fix-doctor-admin-split.sql` также до миграций архивирует identifier-less active admin stubs
без login/channel/oauth/password/pin/token anchors. Это нужно, чтобы `0143_seed_staff_organization_members.sql`
не создавал активные organization admin memberships для пустых stub-строк. Скрипт fail-loud: после фикса
должен остаться ровно один active admin.

### 3.3. Какие DB можно использовать

| DB/copy                                                                             | Можно?                               | Для чего                                                                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Fresh hourly dump `/opt/backups/postgres/hourly/unified_bcb_webapp_prod_*.dump`     | Да                                   | источник clean prod-copy; брать newest                                                                                       |
| TEST restore через `deploy/host/deploy-test-full-reset.sh --confirm-full-reset ...` | Да, только owner/test-host operation | полный from-zero прогон: fresh dump -> data-fix -> migrations -> Rubitime/history -> reviewed FIO -> strict closure -> units |
| Disposable DB с именем `bcb_*_dev_*` или `*_rehearsal_*`                            | Да                                   | isolated restore/preflight/audit без трогания dev/test/prod                                                                  |
| `bcb_webapp_prod`                                                                   | Нет для агентского rehearsal         | только отдельная production operation                                                                                        |
| `bersoncarebot_test` / `bcb_webapp_test`                                            | Нет без явной команды                | это live TEST, wrapper может его пересоздать только в разрешенном TEST-flow                                                  |
| `bcb_webapp_dev`                                                                    | Только read-only aggregate SELECT    | dev содержит реальные ПДн; не писать и не делать cleanup commits                                                             |

Dump проверяется без восстановления так:

```bash
pg_restore --list /opt/backups/postgres/hourly/unified_bcb_webapp_prod_YYYYMMDD_HHMMSS.dump | sed -n '1,80p'
```

Ожидаемый свежий unified dump содержит `dbname: bcb_webapp_prod`, schemas `public`, `integrator`, `drizzle`
и Rubitime/canonical tables (`appointment_records`, `be_appointments`, `be_external_entity_mappings`,
`integrator.rubitime_records`, `integrator.rubitime_events`).

### 3.4. Какой wrapper когда запускать

| Сценарий                        | Команда                                                                                                                                                                               | Что внутри                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Обычный TEST code deploy        | `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`                                                                                                                              | build + только pending migrations текущей TEST-БД; dump/restore отсутствуют                                                                      |
| TEST from-zero                  | `bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset <hash-bound inputs> feat/doctor-ui-rebuild`                                                                          | сам тянет fresh prod dump, пересоздает TEST DB, выполняет полную data chain и только затем запускает units; без явного подтверждения не стартует |
| Prod-copy/disposable #667 chain | `SUPERUSER_URL=... DATABASE_URL=... bash scripts/deploy-saas-667.sh`                                                                                                                  | роли `app_*`, `app_ext.pgcrypto`, temp migrator elevation, data-fix, `migrate-all.sh`, P2-B, consolidation, post-assertions, auto-revoke         |
| Только read-only R1 preflight   | `DATABASE_URL='<loopback rehearsal URL>' node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-clean-dump-preflight.mjs --csv=<csv>`                                                    | schema/current-state gate; не пишет                                                                                                              |
| Только R1 aggregate audit       | `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs --csv=<csv>` и `node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs --sample-size=0` | dev/rehearsal aggregate-only proof; не пишет                                                                                                     |

Нельзя заменять `deploy-test-full-reset.sh` и `deploy-saas-667.sh` на “restore + pnpm migrate”: это уже
зафиксированный невалидный путь.

Также нельзя использовать `deploy-test-full-reset.sh` как обычный деплой кода. Для UI/code изменений используется
только `deploy-test.sh`; повторное создание TEST-БД выполняется только для отдельной owner-authorized full migration rehearsal.
`deploy-test-saas.sh` — внутренний engine; его прямой destructive-вызов заблокирован.

### 3.5. Обязательные тесты/gates

1. Dump TOC check: `pg_restore --list` видит unified prod DB и нужные schemas/tables.
2. Pre-migration identity data-fix: `deploy/postgres/p0-data-fix-doctor-admin-split.sql` прошел до Drizzle migrations.
   В notice ожидается `active admins = 1`; если есть `archived empty admin stubs`, это допустимая нормализация
   пустых stub-строк, не удаление аккаунтов.
3. Migration chain: `migrate-all.sh` прошел в порядке integrator predeclare -> webapp all -> integrator SaaS.
4. Post-state assertions из wrapper:
   - Drizzle migration count достаточный;
   - `system_settings.organization_id` и другие org columns есть;
   - runtime-owner больше не `BYPASSRLS`;
   - один active specialist;
   - appointments не висят на `NULL`/inactive specialist;
   - owner doctor role держится, `admin_phones=[]` в TEST override.
5. R1 preflight: `rubitime-r1-clean-dump-preflight.mjs` возвращает `PASS`.
6. R1 cleanup/backfill/audits: только существующий `backfill-canonical-from-legacy-appointments.ts` и R1 scripts, сначала dry-run, commit только owner-approved.
7. Doctor UI smoke: schedule calendar, appointments list, Today/KPI на той же DB/copy.
8. Никакого R2, пока R1 clean-copy proof не закрыт и owner не принял исключения/остатки.

## 4. Канонический порядок для fresh prod dump

Это порядок, а не предложение. Если нужный скрипт кажется отсутствующим, сначала проверь текущую ветку и
git history. Не писать замену, пока не доказано, что существующего script/doc реально нет.

На TEST эти шаги исполняет одна команда `deploy-test-full-reset.sh --confirm-full-reset ...`; подпункты ниже объясняют её
внутренний порядок, а не разрешают запускать ручные SQL/cleanup между шагами. Writers остаются остановленными от
restore до завершения FIO apply и strict closure.

### Шаг 1. Подготовить отдельную fresh-copy DB

Допустимые цели:

- одноразовая rehearsal DB с отдельным именем;
- TEST fresh restore только если это прямо разрешено владельцем;
- другой явно документированный non-prod target.

Запрещено для агентского rehearsal:

- production DB;
- постоянная dev DB с реальными ПДн;
- live TEST без явной команды владельца;
- реальные delivery каналы.

### Шаг 2. Перед миграциями нормализовать owner doctor/admin/client identity

Смысл уже существующего data-fix:

- все админские/врачебные роли владельца приводятся к одному doctor principal;
- отдельный admin principal создается/сохраняется отдельно;
- patient placeholder Дмитрий Берсон не должен ломать doctor/admin split;
- записи пациента не удаляются этим шагом.

На TEST этот SQL нельзя запускать вручную: его выполняет `deploy-test-full-reset.sh` в правильном месте единой
цепочки, до миграций и при остановленных writers. Для disposable DB тот же порядок уже встроен в
`scripts/deploy-saas-667.sh`. Не отделяй этот шаг от соответствующего wrapper.

### Шаг 3. Запустить migration chain через существующий deploy-wrapper

Для TEST fresh restore публичный owner-gated wrapper уже есть. Явно передавай подтверждение, защищённые входы и
рабочую ветку:

```bash
bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset <hash-bound-owner-inputs> feat/doctor-ui-rebuild
```

Для disposable prod-copy DB используй sequence/model из:

```bash
bash scripts/deploy-saas-667.sh
```

Смысл chain:

1. fresh restore;
2. pre-migration doctor/admin data-fix;
3. миграции;
4. временная migrator escalation только на время миграций;
5. specialist consolidation;
6. post-state assertions;
7. revoke temporary elevation.

Rehearsal, который делает только restore + plain migrate, недействителен.

### Шаг 4. Удалить placeholder/test bookings, не аккаунты

Это внутренний этап `deploy-test-full-reset.sh` / `rubitime-db-cleanup-one-pass.mjs`: сначала dry-run, затем commit
на той же проверенной цели. На TEST его не запускают отдельной командой и не source-ят env вручную.

Что делает скрипт:

- удаляет bookings/projections/mappings для `+70000000000`;
- удаляет bookings/projections/mappings для `+79189000782`;
- не удаляет `platform_users`;
- исключает admin accounts.

### Шаг 5. Свести specialists

Это следующий внутренний dry-run/commit этап того же one-pass wrapper. На TEST его нельзя отделять от полной
цепочки или запускать с вручную выбранным env.

Скрипт сводит duplicate specialists в одного active specialist, remap-ит FK/mappings и опционально
назначает `NULL` historical appointments на primary specialist.

### Шаг 6. Выполнить canonical appointment backfill/cleanup

One-pass последовательно выполняет pre-import cleanup, owner-CSV historical import/projection, обязательный второй
non-confirmed cleanup и stale-vs-CSV cleanup. Рабочие флаги описаны в самом скрипте и
`docs/archive/2026-07-rubitime-retirement/BOOKING_CANONICAL_CUTOVER.md`; для Rubitime R1 не писать новый cleanup SQL и не запускать отдельный
backfill мимо wrapper.

### Шаг 7. Запустить R1 aggregate audits

R1 classifier и dual-source audit завершают тот же one-pass этап и работают только с aggregate/PII-free выводом.
На TEST не подменять их отдельными командами с вручную составленным `DATABASE_URL`.

### Шаг 8. Применить owner-reviewed FIO manifest

После identity/specialist consolidation и полного Rubitime cleanup/import, но до fixtures и запуска сервисов,
full-reset wrapper выполняет TEST-only `fio:owner-reviewed-test:apply`. Manifest не строится parser-ом заново: он содержит exact
expected-before/desired-after и точные исключения для ранее отсутствующей и changed-after-review identity.

Гейты: exact `127.0.0.1/bersoncarebot_test`, live `current_database()`, separately confirmed review/manifest hashes,
одна conditional transaction, unique durable rollback `0600` до первой записи, aggregate-only stdout. Любой
непредусмотренный drift останавливает full reset.

### Шаг 9. Doctor UI smoke

Проверить на той же fresh-copy DB:

- doctor schedule calendar;
- doctor appointments list;
- doctor Today/KPI;
- aggregate canonical counts;
- отсутствие test/stale rows в видимых doctor surfaces.

Правила dev-bypass и browser/headless проверки: `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`.
PII в чат и отчеты не печатать.

## 5. Что считать ошибкой агента

- Агент начал с `rg` по всему репо, не прочитав `AGENTS.md` и этот README.
- Агент сделал новый SQL для Дмитрия Берсона, не проверив `purge-placeholder-bookings.ts`.
- Агент удалил account вместо bookings/projections/mappings.
- Агент запустил migration rehearsal без pre-migration owner doctor/admin data-fix.
- Агент сослался на R1 scripts как на отсутствующие, не проверив `feat/doctor-ui-rebuild`.
- Агент начал новый reconciliation/backfill от `integrator.rubitime_records`, хотя свежий Rubitime CSV уже есть.
- Агент запустил R2 до закрытого R1 proof.

## 6. Минимальный отчет после прогона

Отчет должен содержать только агрегаты:

- branch/commit;
- target DB alias без credential-bearing URL;
- dump timestamp/source;
- какие существующие scripts запускались;
- dry-run или commit mode;
- counts changed / remaining blockers;
- UI smoke status;
- ссылка на commit с документацией/правками.

`accepted` в taskdb не ставить: это делает только владелец.

## 7. Порядок после R1

После R1 агент не начинает новую миграцию наугад. Он сверяет execution plan и двигается по phase-gates.

| Phase | Что считается gate                                                                                                      | Что нельзя делать раньше                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| R2    | doctor calendar/list/KPI читают canonical, старый doctor read-source не нужен                                           | не удалять raw/provider tables                                         |
| R3    | patient/public slots/create canonical-only, tenant exact, catalog decisions закрыты                                     | не использовать `booking_default_organization_id` как booking fallback |
| R4    | GCal, reminders, notifications, payment/package side effects идут из provider-neutral lifecycle                         | не удалять lifecycle alias, если webapp еще зовет старый путь          |
| R5    | legacy v1 Rubitime profile resolve disabled and monitored                                                               | не считать non-prod proof production approval                          |
| R6    | owner cutoff timestamp, disabled provider ingress/outbound bridge, drained queues, fresh post-cutoff CSV reconciliation | не unmount Rubitime webhook/M2M routes and raw runtime code            |
| R7    | archive/drop decision, export/backup, fresh restore+migrate proof, no runtime refs                                      | не drop/archive tables                                                 |

Текущая рабочая позиция по execution plan: R1/R2 и узкие R3/R4 code/proof артефакты сохранены, но incident `#839`
держит runtime acceptance открытым; кроме того, R3-CATALOG снова открыт из-за истёкшего срока удаления живого
`branchServiceId` compatibility. R5 закрыт только в коде/non-prod proof, а monitoring/approval не закрыты. R6 имеет
repository removal provenance, но phase acceptance остаётся gated до `RR-PROOF-09`; R7 также gated. Полная матрица:
`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_R7_PROVENANCE_RECONCILIATION.md`. Если пользователь не дал
прямую команду на production cutoff, агент работает только с repo docs/code/tests и не трогает prod DB/env/services.

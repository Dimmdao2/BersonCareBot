# Rubitime R1 fresh prod-dump agent README

Статус: операционный старт для агентов, рабочая ветка `feat/doctor-ui-rebuild`, 2026-07-14.

Цель: один понятный порядок действий для агента, которому нужно подготовить свежий prod dump к
Rubitime R1 retirement / canonical booking proof. Не начинать с нового SQL и не придумывать новые
backfill/data-fix скрипты: в рабочей ветке уже есть выверенные scripts, deploy-wrappers и R1 audit docs.

## 0. Абсолютные правила

- Работать в той ветке, которую явно назвал владелец. Для этой инструкции это `feat/doctor-ui-rebuild`.
- Не трогать production DB, `/opt/env`, live services или реальные каналы без отдельной прямой команды владельца.
- Не запускать rehearsal на `bcb_webapp_prod`, `bcb_webapp_test` или `bcb_webapp_dev`.
- Не запускать plain `pnpm migrate` на fresh prod dump как самостоятельное доказательство.
- Не писать ad hoc SQL, пока не доказано, что существующие скрипты ниже не покрывают задачу.
- Любой R1 отчет должен быть aggregate-only: без пациентских ФИО, телефонов, email, raw payloads и внешних ids.
- R2/R3/R4 Rubitime retirement запрещены, пока R1 clean-copy proof не закрыт и не принят владельцем.

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

1. `docs/OPERATIONS/BOOKING_CANONICAL_CUTOVER.md`
2. `docs/OPERATIONS/SPECIALIST_IDENTITY_CONSOLIDATION.md`
3. `docs/DOCTOR_UI_REBUILD_REVIEW/APPOINTMENTS_PARITY_S0.md`
4. `docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`
5. `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts`
6. `apps/webapp/scripts/purge-placeholder-bookings.ts`
7. `apps/webapp/scripts/consolidate-specialist-identity.ts`

Затем агент читает R1 execution-пакет:

1. `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md`
2. `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`
3. `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md`
4. `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_BLOCKER_CLASSIFICATION.md`
5. `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md`
6. `docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-clean-dump-preflight.mjs`
7. `docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs`
8. `docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs`

Эти файлы лежат в исторической папке инициативы, но для текущей задачи это не повод начинать новую
инициативу. Это уже существующий R1 package, который надо исполнять и уточнять.

## 2. Что уже есть

| Задача | Скрипт/документ | Статус |
| --- | --- | --- |
| Canonical backfill из legacy/Rubitime appointment data | `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` | Есть |
| Удалить тест/блок-записи, включая Дмитрия Берсона как patient placeholder, не удаляя аккаунты | `apps/webapp/scripts/purge-placeholder-bookings.ts` | Есть |
| Свести дубли специалистов в одного активного специалиста | `apps/webapp/scripts/consolidate-specialist-identity.ts` | Есть |
| Операционный cutover canonical booking | `docs/OPERATIONS/BOOKING_CANONICAL_CUTOVER.md` | Есть |
| Инструкция по specialist consolidation | `docs/OPERATIONS/SPECIALIST_IDENTITY_CONSOLIDATION.md` | Есть |
| Pre-migration doctor/admin/client identity data-fix | `deploy/postgres/p0-data-fix-doctor-admin-split.sql` | Есть |
| Fresh TEST restore + migrate + data-fix wrapper | `deploy/host/deploy-test-saas.sh` | Есть |
| Full fresh prod-copy migration chain | `scripts/deploy-saas-667.sh` | Есть |
| R1 preflight/audit scripts | `docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-*.mjs` | Есть |

## 3. Канонический порядок для fresh prod dump

Это порядок, а не предложение. Если нужный скрипт кажется отсутствующим, сначала проверь текущую ветку и
git history. Не писать замену, пока не доказано, что существующего script/doc реально нет.

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

Запускать на выбранной fresh-copy DB до миграций:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f deploy/postgres/p0-data-fix-doctor-admin-split.sql
```

Не запускай миграции до этого шага.

### Шаг 3. Запустить migration chain через существующий deploy-wrapper

Для TEST fresh restore wrapper уже есть. Явно передавай рабочую ветку:

```bash
bash deploy/host/deploy-test-saas.sh feat/doctor-ui-rebuild
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

```bash
set -a && source <env-for-the-selected-fresh-copy-db> && set +a
pnpm --dir apps/webapp run purge-placeholder-bookings
```

`--commit` разрешен только после dry-run на той же DB:

```bash
pnpm --dir apps/webapp run purge-placeholder-bookings -- --commit
```

Что делает скрипт:

- удаляет bookings/projections/mappings для `+70000000000`;
- удаляет bookings/projections/mappings для `+79189000782`;
- не удаляет `platform_users`;
- исключает admin accounts.

### Шаг 5. Свести specialists

```bash
set -a && source <env-for-the-selected-fresh-copy-db> && set +a
pnpm --dir apps/webapp run consolidate-specialist-identity
```

`--commit` разрешен только после dry-run:

```bash
pnpm --dir apps/webapp run consolidate-specialist-identity -- --commit
```

Скрипт сводит duplicate specialists в одного active specialist, remap-ит FK/mappings и опционально
назначает `NULL` historical appointments на primary specialist.

### Шаг 6. Выполнить canonical appointment backfill/cleanup

```bash
set -a && source <env-for-the-selected-fresh-copy-db> && set +a
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- --summary-only
```

Рабочие флаги описаны в самом скрипте и `docs/OPERATIONS/BOOKING_CANONICAL_CUTOVER.md`.
Для Rubitime R1 не писать новый cleanup SQL: использовать существующий backfill script и R1 run artifacts
из execution-пакета.

### Шаг 7. Запустить R1 aggregate audits

```bash
DATABASE_URL='<fresh-copy-url>' \
node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-clean-dump-preflight.mjs \
  --csv=<fresh-rubitime-csv>

node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-classify-blockers.mjs \
  --csv=<fresh-rubitime-csv>

node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs \
  --threshold-minutes=5 --sample-size=0
```

### Шаг 8. Doctor UI smoke

Проверить на той же fresh-copy DB:

- doctor schedule calendar;
- doctor appointments list;
- doctor Today/KPI;
- aggregate canonical counts;
- отсутствие test/stale rows в видимых doctor surfaces.

Правила dev-bypass и browser/headless проверки: `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`.
PII в чат и отчеты не печатать.

## 4. Что считать ошибкой агента

- Агент начал с `rg` по всему репо, не прочитав `AGENTS.md` и этот README.
- Агент сделал новый SQL для Дмитрия Берсона, не проверив `purge-placeholder-bookings.ts`.
- Агент удалил account вместо bookings/projections/mappings.
- Агент запустил migration rehearsal без pre-migration owner doctor/admin data-fix.
- Агент сослался на R1 scripts как на отсутствующие, не проверив `feat/doctor-ui-rebuild`.
- Агент запустил R2 до закрытого R1 proof.

## 5. Минимальный отчет после прогона

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

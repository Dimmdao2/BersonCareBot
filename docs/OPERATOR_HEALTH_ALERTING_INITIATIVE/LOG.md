# Execution log — Operator Health & Alerting

Журнал исполнения инициативы. Записи добавляются по мере работы.

## Записи

### 2026-05-03 — Декомпозиция фаз

- Добавлены детальные планы **PHASE_A** … **PHASE_G** (шаги, checklist, scope, DoD по фазе); `MASTER_PLAN.md` §5 заменён на таблицу ссылок.
- Код не менялся.

### 2026-05-13 — MVP implementation plan

- Добавлен [`MVP_IMPLEMENTATION_PLAN.md`](MVP_IMPLEMENTATION_PLAN.md): уточнения после проверки кода (дедуп GCal **без** `recordId` в ключе, хуки в **postCreate + webhook**, таблица в **`public`**, защита probe, resolution MVP A/B, риски).
- Cursor: единый трекер `~/.cursor/plans/mvp_operator_health_alerting_9310cffe.plan.md` (дубликат `mvp_operator_health_alerting_638ba46f.plan.md` снят); канон по шагам — `MVP_IMPLEMENTATION_PLAN.md` в репо.
- План дополнительно усилен до исполняемого формата: fixed decisions, строгие scope boundaries, data contract (`public.operator_incidents`), `error_class` taxonomy, пошаговые локальные проверки и явный минимальный auto-resolve для probe-инцидентов.

### 2026-05-14 — Cursor plans: слияние

- Оставлен один трекер `mvp_operator_health_alerting_9310cffe.plan.md`; удалён дубликат `638ba46f`; статусы todos и DoD в `MVP_IMPLEMENTATION_PLAN.md` синхронизированы с кодом (host cron/systemd для probe + unit `openOrTouch` закрыты в репо).

### 2026-05-13 — Integrator: Drizzle для новых operator-таблиц

- Введён workspace-пакет **`@bersoncare/operator-db-schema`**: единая Drizzle-схема `operator_incidents` / `operator_job_status` для **webapp** (реэкспорт из `apps/webapp/db/schema/operatorHealth.ts`) и **integrator**.
- Integrator: `getIntegratorDrizzle()` (`apps/integrator/src/infra/db/drizzle.ts`) на общем `pg` pool + репозиторий `operatorHealthDrizzle.ts` (insert/onConflict/update через Drizzle, без сырого SQL в коде приложения).
- `scripts/ensure-booking-sync-built.sh` и цепочки `build`/`typecheck` дополнены сборкой пакета схемы.

### 2026-05-13 — Webapp system-health + backup script (MVP D1 / E1–E2)

- Webapp: порт `OperatorHealthReadPort`, `pgOperatorHealthRead` / in-memory, `buildAppDeps().operatorHealthRead`; `GET /api/admin/system-health` — поля **`operatorIncidentsOpen`**, **`backupJobs`**, пробы **`meta.probes.operatorIncidents`** / **`operatorBackupJobs`**; UI в `SystemHealthSection` + тесты (`route.test`, `SystemHealthSection.operatorIncidents.test.tsx`).
- Integrator: `POST /internal/operator-health-probe` в `routes.ts`; тесты `operatorHealthProbeRoute.test.ts`, мок **`reportOperatorFailure`** в `postCreateProjection.test.ts`.
- Deploy: `postgres-backup.sh` — **`weekly`**, **`prune`**, один `pg_dump` при совпадении `DATABASE_URL`, retention и тики **`public.operator_job_status`** через `psql`; обновлены `deploy/postgres/README.md`, `deploy/HOST_DEPLOY_README.md`, `apps/webapp/src/app/api/api.md`.

### 2026-05-13 — Аудит MVP: backup family + тесты + доки

- **Контракт БД для бэкапов:** `job_family=backup`, `job_key` = `backup.hourly` | `backup.daily` | `backup.weekly` | `backup.pre_migrations` | `backup.manual` | `backup.prune`; скрипт `postgres-backup.sh` и чтение в webapp выровнены; миграция **`0058_operator_job_status_backup_family`** приводит legacy-строки (`postgres_backup`, короткие ключи).
- **Webapp:** порт чтения — метод **`listBackupJobStatus`** (фильтр `job_family = 'backup'`).
- **Integrator:** unit-тесты **`operatorHealthDrizzle.resolve.test.ts`** (resolve по префиксу), **`operatorHealthProbeRunner.test.ts`** (MAX/Rubitime ok/fail/skip), **`webhook.operatorIncident.test.ts`** (GCal sync fail → `reportOperatorFailure`).

### 2026-05-13 — Хвост MVP: openOrTouch unit + host probe

- Добавлен unit [`operatorHealthDrizzle.openOrTouch.test.ts`](../../apps/integrator/src/infra/db/repos/operatorHealthDrizzle.openOrTouch.test.ts) (цепочка insert/onConflict + sequential touch).
- Добавлен [`deploy/host/operator-health-probe.sh`](../../deploy/host/operator-health-probe.sh); операционное описание cron/systemd в [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) и [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md).



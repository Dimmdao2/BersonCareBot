# Execution log — Operator Health & Alerting

Журнал исполнения инициативы. Записи добавляются по мере работы.

## Записи

### 2026-05-03 — Декомпозиция фаз

- Добавлены детальные планы **PHASE_A** … **PHASE_G** (шаги, checklist, scope, DoD по фазе); `MASTER_PLAN.md` §5 заменён на таблицу ссылок.
- Код не менялся.

### 2026-05-13 — MVP implementation plan

- Добавлен [`MVP_IMPLEMENTATION_PLAN.md`](MVP_IMPLEMENTATION_PLAN.md): уточнения после проверки кода (дедуп GCal **без** `recordId` в ключе, хуки в **postCreate + webhook**, таблица в **`public`**, защита probe, resolution MVP A/B, риски).
- Обновлён Cursor plan `mvp_operator_health_alerting_9310cffe.plan.md` — ссылка на канон в репо; todos: объединён шаг GCal в оба файла.
- План дополнительно усилен до исполняемого формата: fixed decisions, строгие scope boundaries, data contract (`public.operator_incidents`), `error_class` taxonomy, пошаговые локальные проверки и явный минимальный auto-resolve для probe-инцидентов.

### 2026-05-13 — Integrator: Drizzle для новых operator-таблиц

- Введён workspace-пакет **`@bersoncare/operator-db-schema`**: единая Drizzle-схема `operator_incidents` / `operator_job_status` для **webapp** (реэкспорт из `apps/webapp/db/schema/operatorHealth.ts`) и **integrator**.
- Integrator: `getIntegratorDrizzle()` (`apps/integrator/src/infra/db/drizzle.ts`) на общем `pg` pool + репозиторий `operatorHealthDrizzle.ts` (insert/onConflict/update через Drizzle, без сырого SQL в коде приложения).
- `scripts/ensure-booking-sync-built.sh` и цепочки `build`/`typecheck` дополнены сборкой пакета схемы.

### 2026-05-13 — Webapp system-health + backup script (MVP D1 / E1–E2)

- Webapp: порт `OperatorHealthReadPort`, `pgOperatorHealthRead` / in-memory, `buildAppDeps().operatorHealthRead`; `GET /api/admin/system-health` — поля **`operatorIncidentsOpen`**, **`backupJobs`**, пробы **`meta.probes.operatorIncidents`** / **`operatorBackupJobs`**; UI в `SystemHealthSection` + тесты (`route.test`, `SystemHealthSection.operatorIncidents.test.tsx`).
- Integrator: `POST /internal/operator-health-probe` в `routes.ts`; тесты `operatorHealthProbeRoute.test.ts`, мок **`reportOperatorFailure`** в `postCreateProjection.test.ts`.
- Deploy: `postgres-backup.sh` — **`weekly`**, **`prune`**, один `pg_dump` при совпадении `DATABASE_URL`, retention и тики **`public.operator_job_status`** через `psql`; обновлены `deploy/postgres/README.md`, `deploy/HOST_DEPLOY_README.md`, `apps/webapp/src/app/api/api.md`.



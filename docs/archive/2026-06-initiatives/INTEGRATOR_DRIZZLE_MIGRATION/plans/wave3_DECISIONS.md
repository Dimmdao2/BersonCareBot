# Wave 3 — решения перед стартом (зафиксировано)

**Дата снимка:** 2026-06-05  
**Канон порядка:** [wave3_INDEX.md](./wave3_INDEX.md), [../DRIZZLE_TRANSITION_PLAN.md](../../../../INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md)

## Три класса (не «убрать pg навсегда»)

| Класс | Цель Wave 3 | Пример |
|-------|-------------|--------|
| **A** | Убрать необъяснённый `pool.query` / `client.query` / `DbPort.query` из runtime | `pgOnlineIntake.ts` → `runWebappSql` / Drizzle builder |
| **B** | SQL-текст остаётся, выполнение только через `runWebappSql` / `runIntegratorSql` / `execute(sql)` | `projectionHealthCore.ts`, claim-CTE |
| **C** | Осознанный permanent `pg` (транспорт TX, мигратор, ops, merge engine) | `migrate.ts`, `platform-merge`, `claim.ts` |

---

## Цель качества Wave 3

1. Максимально убрать хвост raw SQL из runtime-кода (прямые `pool.query` / `client.query` / `DbPort.query`).
2. Убрать практическую потребность в `migrate:legacy` для webapp, если после фаз 09–15 не остаётся runtime/raw-SQL причин держать legacy runner в регулярном потоке. Если такая причина остаётся, фаза 16 фиксирует её как явный blocker/backlog, а не отключает legacy «любой ценой».
3. Для новых/переносимых DB-участков в фазах Wave 3: выполнение через Drizzle и валидация входов/JSON/row-shape через **Zod**.
4. До миграции хвостов integrator на Drizzle провести **сокращение integrator-схемы**: не мигрировать на Drizzle код/таблицы, которые после unified DB должны читать/писать `public`.

## Owner decisions (2026-06-05)

- `public` — главный источник бизнес-данных.
- `integrator` должен остаться технической схемой: очереди, locks/claims, throttle, outbox, delivery logs, внешние события и channel identity state.
- Дубли в `integrator` можно удалять/отключать, если те же бизнес-данные уже есть в `public`.
- Отдельно хранить историю в `integrator` не нужно, если она уже покрыта `public`.
- Нужные справочники переносим/канонизируем в `public`, чтобы webapp не зависел от `integrator`-зеркал.
- Любой `drop/deprecate` требует проверки старшим агентом и owner approval; production-операции требуют backup/rollback/окно выката.
- Staging smoke подтверждает owner по чеклисту агента; также может подтвердить ops/dev lead/senior agent с доступом к staging/prod logs, очередям, БД и внешним сервисам.
- Живые интеграции Rubitime / Telegram / MAX / Google Calendar проверяются перед закрытием соответствующих фаз.

## Ответы из кода (уверенно)

### Permanent Class C — не мигрировать на Drizzle builder

| Артефакт | Доказательство | Действие Wave 3 |
|----------|----------------|-----------------|
| `packages/platform-merge` | **88** `query()` в `pgPlatformUserMerge.ts` + 4 в `mergeContactFallback.ts`; полиморфная merge-TX | Только ADR в LOG + RAW_SQL §4 (Wave 2 P8 уже зафиксировал) |
| `packages/booking-rubitime-sync` | **4** `query()`; единый `SqlExecutor`; **27** unit-тестов | Permanent pg executor; не shared schema |
| `apps/media-worker/src/jobs/claim.ts` | `FOR UPDATE SKIP LOCKED`; **4** теста в `claim.test.ts` | Class C permanent pg |
| `apps/integrator/src/infra/db/migrate.ts` | **11** `db.query` (schema, ledger, BEGIN/COMMIT) | Class C |
| `apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts` | SAVEPOINT batch ops | Class C one-off |
| `apps/integrator/src/infra/scripts/resync-rubitime-records.ts` | динамический `UPDATE` | Class C ops |
| `apps/integrator/src/infra/db/client.ts` | `DbPort` + health `SELECT 1` | Class C транспорт |
| `apps/webapp/src/infra/db/client.ts` | healthcheck | Class C транспорт |

### Permanent Class B — SQL остаётся, канал унифицирован

| Артефакт | Доказательство | Действие Wave 3 |
|----------|----------------|-----------------|
| `projectionHealthCore.ts` | 5 параллельных агрегатов; Wave 2 P2: «builder не в DoD» | Формализовать Class B в RAW_SQL; не переписывать в `groupBy` |
| Integrator claim paths | `projectionOutbox`, `jobQueue`, `outgoingDeliveryQueue` уже `runIntegratorSql` | Без изменений |
| media-worker post-claim | `runMediaWorkerSql.ts` + `runMediaWorkerPgText` (фаза **10 done**) | Class B; qualified `public.*`; без shared schema |
| Webapp media TX transport | `s3MediaStorage.ts`: **7** `client.query` — только BEGIN/COMMIT/ROLLBACK; домен на `runWebappSql` | Документировать Class C transport на dedicated client |
| `channelLink.ts` | **6** вызовов — только BEGIN/COMMIT/ROLLBACK вокруг портов | Class C; не считать «незакрытым auth SQL» |

### Wave 2 закрыта

- Планы `wave2_phase_01` … `wave2_phase_08`: **`status: completed`** (2026-06-05).
- Webapp reminders, media (enqueue), LFK, auth ports — на `runWebappSql` / Drizzle (см. grep `runWebappSql` в `pgLfk*`, `pgReminder*`, `pgAuth*`).

### Integrator P1+ — точный backlog (prod `await db.query`)

**20 файлов** (без `migrate.ts` / scripts):

| Файл | Вызовов `db.query` (оценка) | Сложн. |
|------|------------------------------|--------|
| `repos/idempotencyKeys.ts` | 2 | С (динамический whitelist) |
| `repos/platformUserDeliveryPhone.ts` | 1 | Н |
| `repos/patientHomeMorningPing.ts` | 3 | С |
| `kernel/.../patientHomeMorningPing.ts` (handler) | 1 | Н |
| `repos/adminStats.ts` | 3 | С |
| `repos/linkedPhoneSource.ts` | 1 | Н |
| `repos/resolvePlatformUserIdForRubitimeBooking.ts` | 2 | Н |
| `repos/canonicalUserId.ts` | 2 | Н |
| `repos/integrationDataQualityIncidents.ts` | 1 | С |
| `infra/db/branchTimezone.ts` | 1 | С (cross-schema `public.booking_branches`) |
| `infra/db/messengerStaffIds.ts` | 1 | Н |
| `infra/db/adminIncidentAlertRelay.ts` | 1 | Н |
| `config/smtpOutbound.ts` | 1 | Н |
| `repos/operationalVerboseLog.ts` | 1 | Н |
| `config/appBaseUrl.ts` | 1 | Н |
| `config/appTimezone.ts` | 1 | Н |
| `integrations/google-calendar/calendarDescription.ts` | 1 | Н |
| `integrations/google-calendar/resolvePackageCalendarContext.ts` | 3 | С |
| `integrations/google-calendar/runtimeConfig.ts` | 1 | Н |
| `integrations/rubitime/rubitimeApiThrottle.ts` | 2 (`client.query` на dedicated connection) | С (session + advisory уже P3) |

**Не в списке P1+:** всё, что уже на `runIntegratorSql` (Wave 2 P1).

### Media-worker фаза IX

| Файл | `pool.query` | Решение |
|------|--------------|---------|
| `processTranscodeJob.ts` | 10 | Мигрировать статусы/джойны → minimal `execute(sql)` или Drizzle без shared schema package |
| `processProgramSubmissionTranscode.ts` | 7 | то же |
| `watermarkEnabled.ts` | 1 | чтение `system_settings` → `execute` |
| `pipelineEnabled.ts` | 1 | то же |
| `jobs/claim.ts` | 8 | **Class C** |

### Webapp — масштаб (prod, без `*.test.ts`)

- **78** файлов с `pool.query` / `client.query` (2026-06-05 `rg`).
- Топ по объёму SQL: `pgSupportCommunication` (46), `pgUserProjection` (43), `platformUserFullPurge` (40), `pgBookingCatalog` (37), `pgOnlineIntake` (33), `pgDoctorAnalyticsMetricAccounts` (25).
- **Treatment program:** `pgTreatmentProgramInstance.ts`, `Events`, `TestAttempts` — **без** `pool.query`; остаток: `pgTreatmentProgram.ts` (3), `pgTreatmentProgramItemSnapshot.ts` (1).
- **`integratorPushOutbox.ts`:** `db.query` на `Pool|PoolClient` (**не** попадает в grep `pool.query`) — включить в фазу 15.

### Auth allowlist (eslint)

Файлы в `eslint.config.mjs` §legacy modules — **не** означают «есть сырой SQL»; после P7 многие уже на портах. `channelLink.ts` — только TX transport.

---

## Вопросы агента — ответы перед стартом

### 1) Scope webapp

**Ответ:** берём **полный closeout** по `apps/webapp/src` для runtime-файлов (без `*.test.ts`) в фазах 11–15.  
Критерий: после фазы 15 остаются только Class B/C исключения, явно записанные в `RAW_SQL_INVENTORY.md`.

### 2) `apps/webapp/src/app-layer/integrator/messengerPhoneHttpBindExecute.ts`

**Ответ:** включаем в **миграцию Wave 3** (фаза 15), не оставляем permanent C.  
Подход: сохранить текущую SQL-семантику bind-TX, но убрать прямой `pool.query` в пользу Drizzle executor + Zod-валидации критичных payload/rows.

### 3) Shared Drizzle schema для media-worker

**Ответ:** **не делаем shared package** в Wave 3.  
Используем minimal executor (`sql` tagged fragments на существующем `pg.Pool`) в фазе 10.

### 4) Staging smoke (LOG L182)

**Ответ:** staging smoke обязателен перед финальным closeout (фаза 17), не `cancelled`.  
Owner подтверждает smoke по чеклисту агента. Если нет доступа к стенду или подтверждающего человека с доступом к logs/очередям/БД/внешним сервисам — статус Wave 3: `blocked`, не `completed`.

### 5) PR-стратегия

**Ответ:** строго **1 PR = 1 фаза**. Исключение `00+09` было допустимо только до закрытия фазы 00; в текущем состоянии не применяется.
Перед merge каждого PR — `pnpm run ci`.

### 6) `rubitimeApiThrottle` throttle row

**Ответ:** в фазе 09 переводим read/update throttle row на Drizzle session **на том же `PoolClient`** (Class B), advisory semantics сохраняем.

### 7) Google Calendar SQL

**Ответ:** все 3 файла (`calendarDescription`, `resolvePackageCalendarContext`, `runtimeConfig`) входят в фазу 09 и не выносятся отдельно.

### 8) Legacy migrations webapp

**Ответ:** добавляем отдельную фазу cutover (фаза 16) с целью снять зависимость runtime/deploy от `migrate:legacy`, но только если после фаз 09–15 больше нет raw-SQL/migration причин держать legacy runner в regular flow:
- закрепить Drizzle-only bootstrap для `public` в runbook и CI policy;
- убрать упоминания `migrate:legacy` из регулярных путей;
- legacy runner оставить только как ручной аварийный recovery path с явным gate.

Если после фаз 09–15 остаётся сырой SQL, который может потребовать изменения legacy SQL-migrations, фаза 16 не отключает `migrate:legacy`; она фиксирует blocker, список причин и критерии повторного cutover.

**Итог фазы 16 (2026-06-06):** blocker не выявлен; regular flow закреплён как Drizzle-only. `migrate:legacy` оставлен как manual/emergency путь с guardrails (`WEBAPP_LEGACY_MIGRATIONS_MODE` + CI block для regular/manual сценария).

### 9) Zod-политика для DB-слоя

**Ответ:** в фазах 09–15 для всех затронутых DB-модулей обязательны:
- Zod-схемы для JSON из БД (`system_settings`, payload/jsonb);
- Zod-валидация внешних входов в репозиторий/adapter (где shape не гарантирован TS-типом);
- запрет на новый код вида `JSON.parse(raw) as unknown` без `safeParse`.

### 10) Избыточность integrator-схемы после unified DB

**Ответ:** перед фазой 09 добавляется фаза **08**: audit/delete/move decision по integrator-таблицам и репозиториям.  
Правило порядка: если данные являются каноном webapp (`public.platform_users`, `public.patient_bookings`, `public.booking_*`, `public.system_settings`, `public.reminder_*`), то **сначала** решаем move/read-from-public/delete, и только потом мигрируем оставшийся runtime-код на Drizzle.

Owner decision: `public` — canonical source of truth; `integrator` — только technical state. Дубли, покрытые `public`, можно отключать/удалять после senior-agent review + owner approval.

Предварительная классификация:

| Группа | Решение по умолчанию |
|--------|----------------------|
| `integrator.system_settings` + `settingsSyncRoute` | удалить зеркало / читать `public.system_settings` напрямую |
| `rubitime_branches/services/cooperators/booking_profiles` | сверить с `public.booking_*`; если покрыто — перевести reads на `public`, затем deprecate integrator tables |
| `rubitime_records` vs `public.appointment_records` / `public.patient_bookings` | оставить только если это непокрытый technical/raw external event log; если история уже покрыта `public`, не хранить отдельный бизнес-дубль |
| `integrator.user_reminder_*` | проверить возможность dispatch напрямую из `public.reminder_*`; не расширять зеркало |
| `integrator.users/identities/contacts` | оставить только channel/integration identity state, но не дублировать профиль пациента |
| `projection_outbox` / retry jobs / delivery logs | оставить как техническую интеграторную state |

---

## Definition of Ready (обязателен перед фазой 09)

- [x] `rg` baseline → таблица Class A/B/C в `RAW_SQL_INVENTORY.md` (дата снимка **2026-06-05**, фаза 00)
- [x] В `LOG.md` записаны фиксированные решения 1–10 из этого файла
- [x] Permanent zones ADR (platform-merge, booking-sync, claim, migrate, projection health)
- [x] PR map: фаза → ветка → expected tests и owner — [`wave3_INDEX.md`](./wave3_INDEX.md)
- [x] В `wave3_INDEX.md` указаны зависимости фаз (08 → 09/10 parallel, 11→12→13→14→15→16→17 sequence)

# AGENT EXECUTION LOG - TIMEZONE UTC NORMALIZATION

Назначение: единый журнал выполнения этапов авто-агентами (Composer 1.5 / аудит-агент), с evidence для gate-решений.

Правило заполнения:

- Каждая запись с timestamp (UTC), исполнителем и этапом.
- Фиксировать только факты: что сделано, какие проверки, какой результат.
- Для каждого Stage нужен явный статус: `PASS` или `REWORK_REQUIRED`.

---

## Метаданные запуска

- Initiative: `TIMEZONE_UTC_NORMALIZATION`
- Master plan: `docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md`
- Log owner: `AI agent + reviewer`
- Started at (UTC): `2026-04-03` (Stage 1 execution)
- Current branch: `main` (working tree; see git status at execution time)

---

## Шаблон записи

```text
[UTC timestamp] [Stage X] [EXEC|AUDIT|FIX] [agent]
Tasks done:
- ...
Changed files:
- ...
Checks:
- tests: ...
- ci: ...
Evidence:
- ...
Gate verdict:
- PASS | REWORK_REQUIRED
Notes:
- ...
```

---

## Stage 1 - IANA timezone в БД

- Status: `PASS` (Stage 1 AUDIT findings critical/major закрыты FIX 2026-04-03; deploy: миграции 056–058 на целевой БД)
- Last update: `2026-04-03` (UTC)

### Stage 1 - AUDIT (зафиксировано до FIX)

- Verdict: `REWORK_REQUIRED` (аудит по `STAGE_1` / `MASTER_PLAN` / этому логу)
- Critical: админка писала `booking_branches.timezone`, integrator `getBranchTimezone` читал только `branches.timezone` — рассинхрон источника истины.
- Major: `upsertBranch` — `ON CONFLICT (rubitime_branch_id) DO UPDATE` не обновлял `timezone`.
- Minor (вне scope FIX): seed только для `branches` по offset; нет post-migrate SQL evidence на хосте без `DATABASE_URL`; опциональный тест нечислового branch id в integrator.

### Stage 1 - FIX (post-audit)

```text
[2026-04-03] [Stage 1] [FIX] [agent]
Tasks done:
- Critical: после успешного `upsertBranch` / `updateBranchById` синхронизация `branches.timezone` по связке numeric `rubitime_branch_id` → `branches.integrator_branch_id` (нечисловой id → sync пропускается).
- Major: в `upsertBranch` добавлено `timezone = EXCLUDED.timezone` в `DO UPDATE`.
Changed files:
- apps/webapp/src/infra/repos/pgBookingCatalog.ts — sync helper + правки upsert/update
- apps/webapp/src/infra/repos/pgBookingCatalog.test.ts — покрытие upsert (conflict TZ + sync + non-numeric), updateBranchById + sync
Checks:
- tests: vitest webapp `pgBookingCatalog.test.ts`; полный suite через `pnpm run ci`
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-03)
Gate verdict:
- PASS (для Stage 1 после закрытия critical/major; integrator по-прежнему читает `branches`, админка теперь поддерживает ту же колонку при сохранении каталога)
Notes:
- SHA на момент прогона CI: см. `git rev-parse HEAD` после коммита FIX.
```

### Entries

```text
[2026-04-03] [Stage 1] [EXEC] [agent]
Tasks done:
- S1.T01 -> done: `apps/webapp/migrations/056_branches_timezone.sql` — `branches.timezone TEXT NOT NULL DEFAULT 'Europe/Moscow'`.
- S1.T02 -> done: `apps/webapp/migrations/057_booking_branches_timezone.sql` — `booking_branches.timezone` same default.
- S1.T03 -> done: `apps/webapp/migrations/058_branch_timezone_seed.sql` — explicit `Europe/Moscow` for integrator branch `17356` and booking `rubitime_branch_id = '17356'`; idempotent offset seed from `branches.meta_json->>'rubitime_local_time_offset'` (-1..+9 → IANA) only when `timezone` still default; mapping also in `apps/webapp/src/shared/rubitime/rubitimeLocalTimeOffsetToIana.ts`.
- S1.T04 -> done: booking-catalog admin API + `RubitimeSection` — POST/PATCH `timezone`, IANA validation (Intl), placeholder `Europe/Moscow`; per-branch TZ editor + create form field; `pgBookingCatalog` / types / joins updated.
- S1.T05 -> done: `apps/integrator/src/infra/db/branchTimezone.ts` — `getBranchTimezone(branchId)` reads `branches.integrator_branch_id`, 60s TTL in-memory cache, fallback `Europe/Moscow` + `logger.warn` on DB miss/invalid; tests `branchTimezone.test.ts`.
Changed files:
- apps/webapp/migrations/056_branches_timezone.sql (new)
- apps/webapp/migrations/057_booking_branches_timezone.sql (new)
- apps/webapp/migrations/058_branch_timezone_seed.sql (new)
- apps/webapp/src/shared/rubitime/rubitimeLocalTimeOffsetToIana.ts (new)
- apps/webapp/src/app/api/admin/booking-catalog/_branchTimezone.ts (new)
- apps/webapp/src/app/api/admin/booking-catalog/branches/route.ts
- apps/webapp/src/app/api/admin/booking-catalog/branches/[id]/route.ts
- apps/webapp/src/app/app/settings/RubitimeSection.tsx
- apps/webapp/src/modules/booking-catalog/types.ts, ports.ts
- apps/webapp/src/infra/repos/pgBookingCatalog.ts
- apps/webapp/src/modules/booking-catalog/service.test.ts
- apps/webapp/src/modules/patient-booking/service.test.ts
- apps/integrator/src/infra/db/branchTimezone.ts (new)
- apps/integrator/src/infra/db/branchTimezone.test.ts (new)
Checks:
- tests: `pnpm --dir apps/integrator test` (includes branchTimezone.test.ts); `pnpm --dir apps/webapp test` — all green in CI run.
- ci: `pnpm run ci` — PASS (lint, typecheck, integrator+webapp tests, builds, `pnpm audit --prod`).
Evidence:
- Migration files: 056, 057, 058 as above.
- SQL manual checks on agent host: not run (`DATABASE_URL` unset — document expected statements post-migrate: `\d+ branches` / `\d+ booking_branches`; `SELECT COUNT(*) FROM branches WHERE timezone IS NULL` → 0; same for `booking_branches`).
- getBranchTimezone: unit tests cover TTL, refetch after 61s, missing row fallback, invalid IANA fallback, string id.
- Fallback path: warn logged on cache miss when falling back (see implementation).
Gate verdict:
- PASS (code + CI). **Deploy note:** run webapp migration runner against prod/staging so columns + seed exist before relying on integrator DB reads.
Notes:
- Working tree SHA at log time (HEAD): `ff342066bfe0a35630b2f7e6bb4969c579577586` — changes may be uncommitted; re-run `git rev-parse HEAD` after commit.
```

---

## Stage 2 - normalizeToUtcInstant

- Status: `PASS`
- Last update: `2026-04-03` (UTC)

### Entries

```text
[2026-04-03] [Stage 2] [EXEC] [agent]
Tasks done:
- S2.T01 -> done: `apps/integrator/src/shared/normalizeToUtcInstant.ts` — `normalizeToUtcInstant(raw, sourceTimezone)`; наивные строки только через Luxon + IANA (`DateTime.fromISO` с `{ zone }`); строки с Z/offset через `Date.parse` + `toISOString()`; пустой raw/tz или невалидная IANA (`Intl.DateTimeFormat`) → `null`; без хардкода ±offset для наивных дат.
- S2.T02 -> done: `apps/integrator/src/shared/normalizeToUtcInstant.test.ts` — полный набор кейсов (см. test matrix ниже).
- S2.T03 -> done: `apps/webapp/src/shared/normalizeToUtcInstant.ts` — re-export из integrator shared (одна реализация); `apps/webapp/next.config.ts` — `experimental.externalDir: true` для сборки Next; зависимости `luxon` + dev `@types/luxon` в integrator и webapp.
Changed files:
- apps/integrator/src/shared/normalizeToUtcInstant.ts (new)
- apps/integrator/src/shared/normalizeToUtcInstant.test.ts (new)
- apps/integrator/package.json — luxon, @types/luxon
- apps/webapp/src/shared/normalizeToUtcInstant.ts (new)
- apps/webapp/next.config.ts — experimental.externalDir
- apps/webapp/package.json — luxon, @types/luxon
- pnpm-lock.yaml
Checks:
- tests: integrator vitest including `normalizeToUtcInstant.test.ts` (18 `it` на normalize); full integrator + webapp suites via `pnpm run ci` — см. запись [FIX] для `tryNormalize` и актуального счёта
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-03)
Evidence:
- Test matrix (все в `normalizeToUtcInstant.test.ts`): Stage2 обязательные (Moscow/Samara наивные, Z, +03:00, T-наивная, "", abc, невалидная дата); trim raw/tz; дробные секунды + `Etc/UTC`; невалидная IANA при Z и при наивной; `+0300`; lowercase `z`; date-only через Date.parse; `America/New_York` летнее; spring-forward gap (Luxon mapping); два IANA с одним wall-clock (Moscow vs Kaliningrad); отрицательный offset.
- Наивные строки: только если совпадают regex наивной стенной даты (без суффикса зоны), иначе путь `Date.parse` — не используется TZ процесса для наивных форматов из контракта.
- Нет хардкода `+03:00` / фиксированного offset в normalizer; сравнение Moscow/Samara/Kaliningrad доказывает разницу через IANA.
Gate verdict:
- PASS
Notes:
- После коммита: `git rev-parse HEAD` для актуального SHA.

[2026-04-03] [Stage 2] [FIX] [agent] (вход: `AUDIT_STAGE_2.md` + carry-over MANDATORY)
Tasks done:
- BLOCKER: `tryNormalizeToUtcInstant(raw, sourceTimezone)` → `{ ok, utcIso } | { ok: false, reason }` с `invalid_datetime` | `invalid_timezone` | `unsupported_format`; `normalizeToUtcInstant` — тонкая обёртка.
- LOW: guard для нестроковых `raw`/`sourceTimezone` в `tryNormalizeToUtcInstant` (без throw на `.trim()`).
- Экспорт `NAIVE_WALL_CLOCK_REGEX` + re-export из `apps/webapp/src/shared/normalizeToUtcInstant.ts`.
- Доки: `STAGE_2_NORMALIZE_TO_UTC_INSTANT.md` (контракт наивного формата + семантика причин), `MASTER_PLAN.md` (S2.T04/Gate, Stage 3 Gate + Variant A), `STAGE_3_INGEST_NORMALIZATION.md` (Gate Variant A, S3.T01 уточнение), `STAGE_1_BRANCH_TIMEZONE_DB.md` (S1.T05 ↔ S1.T06), `STAGE_4_INTEGRATOR_DISPLAY_TIMEZONE_FROM_DB.md` (кросс-политика fallback), `AUDIT_STAGE_2.md` → Verdict PASS + Remediation.
Changed files:
- apps/integrator/src/shared/normalizeToUtcInstant.ts
- apps/integrator/src/shared/normalizeToUtcInstant.test.ts
- apps/webapp/src/shared/normalizeToUtcInstant.ts
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_2_NORMALIZE_TO_UTC_INSTANT.md
- docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_1_BRANCH_TIMEZONE_DB.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_3_INGEST_NORMALIZATION.md
- docs/TIMEZONE_UTC_NORMALIZATION/STAGE_4_INTEGRATOR_DISPLAY_TIMEZONE_FROM_DB.md
- docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_2.md
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Checks:
- tests: `pnpm --dir apps/integrator test -- src/shared/normalizeToUtcInstant.test.ts` — 24 кейса `it(` (18 normalize + 6 tryNormalize);
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-03): lint, typecheck, integrator+webapp tests, builds, `pnpm audit --prod`.
Gate verdict:
- PASS (post-`AUDIT_STAGE_2` FIX)
```

---

## Stage 3 - Ingest normalization

- Status: `PASS` (post `AUDIT_STAGE_3` FIX 2026-04-04; BLOCKER + HIGH закрыты)
- Last update: `2026-04-04` (UTC)

### Stage 3 - AUDIT Stage 3 (до FIX)

- Verdict: `REWORK_REQUIRED` (`docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_3.md`, 2026-04-04)
- BLOCKER: при fallback / невалидной IANA для филиала не было инцидента + Telegram (`branchTimezone.ts`).
- HIGH: `booking.upsert` принимал любой непустой `recordAt` → риск наивной строки в `::timestamptz`.

### Entries

#### Stage 3 - FIX (AUDIT Stage 3)

```text
[2026-04-04] [Stage 3] [FIX] [agent] (вход: AUDIT_STAGE_3.md MANDATORY 1–2)
Tasks done:
- BLOCKER: `createGetBranchTimezoneWithDataQuality({ db, dispatchPort })` — на каждый fallback (`invalid_branch_id`, `query_failed`, `missing_or_empty`, `invalid_iana`) вызывается общий `recordDataQualityIncidentAndMaybeTelegram` с `integration=rubitime`, `entity=branch`, `field=branch_timezone`, dedup + Telegram при `occurrences === 1`; Rubitime webhook использует одну `db` + эту фабрику в `prepareRubitimeWebhookIngress`.
- Миграция `20260404_0001_integration_data_quality_branch_tz_reasons.sql` — расширение CHECK `error_reason` для четырёх причин филиала.
- HIGH: `isExplicitZonedIsoInstant` + отбраковка наивных/безявных offset в `booking.upsert` для `recordAt` и `dateTimeEnd` (warn + `null` в SQL/проекции).
- Общий хелпер `dataQualityIncidentAlert.ts`; `ingestNormalization.ts` переведён на него (без смены поведения ingest).
Changed files:
- apps/integrator/src/infra/db/branchTimezone.ts, branchTimezone.dataQuality.test.ts (new)
- apps/integrator/src/infra/db/dataQualityIncidentAlert.ts (new)
- apps/integrator/src/infra/db/migrations/core/20260404_0001_integration_data_quality_branch_tz_reasons.sql (new)
- apps/integrator/src/infra/db/writePort.ts, writePort.appointments.test.ts
- apps/integrator/src/shared/explicitZonedIsoInstant.ts, explicitZonedIsoInstant.test.ts (new)
- apps/integrator/src/shared/integrationDataQuality/types.ts
- apps/integrator/src/integrations/rubitime/ingestNormalization.ts, webhook.ts, webhook.test.ts
Checks:
- tests: `pnpm --dir apps/integrator test -- src/integrations/rubitime/ingestNormalization.test.ts src/infra/db/branchTimezone.test.ts` (и полный integrator suite)
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-04): lint, typecheck, integrator 553 passed | 6 skipped, webapp 1144 passed | 5 skipped, builds, `pnpm audit --prod`
Evidence:
- Новые тесты: `branchTimezone.dataQuality.test.ts` (incident + dispatch на fallback; кэш TTL без повторного alert), `explicitZonedIsoInstant.test.ts`, naive `recordAt` в `writePort.appointments.test.ts`.
Gate verdict:
- PASS для закрытия MANDATORY п.1–2 AUDIT_STAGE_3 (MEDIUM webapp / LOW runbook вне scope).
Notes:
- Рабочий SHA на момент прогона CI: `ff342066bfe0a35630b2f7e6bb4969c579577586` (uncommitted changes — перезапустить `git rev-parse HEAD` после коммита).
```

#### Stage 3 implementation (S3.T01–S3.T08)

- **Fixture (Rubitime webhook body, naive wall clock):** `from: 'rubitime'`, `event: 'event-update-record'`, `data.record: { id, datetime: '2026-04-07 11:00:00', branch_id }`.
- **Before / after (Europe/Moscow):** raw `2026-04-07 11:00:00` → internal `incoming.recordAt` = `2026-04-07T08:00:00.000Z`; **Europe/Samara** same wall → `2026-04-07T07:00:00.000Z`.
- **SQL:** `rubitime_records` upsert uses `$3::timestamptz` for `record_at` (`apps/integrator/src/infra/db/repos/bookingRecords.ts`); evidence test: `bookingRecords.sql.test.ts`.
- **Variant A (invalid raw time):** `recordAt` / `dateTimeEnd` cleared on payload, row still ingests with `record_at` NULL when upsert passes null; incident upsert into `integration_data_quality_incidents` (dedup unique on integration+entity+external_id+field+error_reason); Telegram admin alert on **first** occurrence (`occurrences === 1` after insert).
- **Projection:** `appointment.record.upserted` payload includes `timeNormalizationStatus` (`ok` | `degraded`) and optional `timeNormalizationFieldErrors` (`field` + `reason`); `dateTimeEnd` passed from scripts when present.
- **Files (integrator):**
  - `apps/integrator/src/integrations/rubitime/ingestNormalization.ts` — branch TZ + `tryNormalizeToUtcInstant`, incidents, admin dispatch
  - `apps/integrator/src/integrations/rubitime/connector.ts` — exported `toRubitimeIncoming`, optional `incoming` on `rubitimeIncomingToEvent`, GCal sync on normalized payload
  - `apps/integrator/src/integrations/rubitime/webhook.ts` — `prepareRubitimeWebhookIngress` + `dispatchPort` deps
  - `apps/integrator/src/shared/integrationDataQuality/types.ts`, `apps/integrator/src/infra/db/repos/integrationDataQualityIncidents.ts`, `apps/integrator/src/infra/db/migrations/core/20260403_0001_integration_data_quality_incidents.sql`
  - `apps/integrator/src/infra/db/writePort.ts` — в `booking.upsert` пустые строки от `{{input.recordAt}}` / `dateTimeEnd` приводятся к `NULL` (`asNonEmptyString`), иначе Variant A давал бы `''` в SQL
  - `apps/integrator/src/content/rubitime/scripts.json`
- **Tests:** `ingestNormalization.test.ts`, `connector.test.ts`, `webhook.test.ts`, `writePort.appointments.test.ts`, `bookingRecords.sql.test.ts`
- **CI:** `pnpm install --frozen-lockfile && pnpm run ci` — **PASS** (2026-04-03): lint, typecheck, integrator+webapp tests, builds, `pnpm audit --prod`.

---

## Stage 4 - Display timezone from DB

- Status: `PASS` (post `AUDIT_STAGE_4` FIX 2026-04-04; HIGH + MEDIUM + LOW из MANDATORY закрыты)
- Last update: `2026-04-04` (UTC)

### Stage 4 - AUDIT (до FIX)

- Verdict: `REWORK_REQUIRED` (`docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_4.md`, 2026-04-04)
- HIGH: GCal sync и `createRemindersReadsPort` вызывали `getAppDisplayTimezone` без `dispatchPort` → при fallback не было гарантированного Telegram.
- MEDIUM: webapp принимал только regex IANA без ICU; `getAppDisplayTimezoneSync` без явного `logger.warn` на legacy env.
- LOW: пробелы в тестах (`invalid_iana`, `query_failed`, цепочка dispatch); устарел раздел «Текущее состояние» в `MASTER_PLAN.md`.

### Entries

#### Stage 4 - FIX (AUDIT Stage 4)

```text
[2026-04-04] [Stage 4] [FIX] [agent] (вход: AUDIT_STAGE_4.md MANDATORY 1–5)
Tasks done:
- HIGH: `SyncDeps.dispatchPort` + проброс в `mapRubitimeEventToGoogleEvent` / `syncAppointmentToCalendar`; `syncRubitimeWebhookBodyToGoogleCalendar(incoming, { db, dispatchPort })` из Rubitime webhook; `createRemindersReadsPort({ db, getDispatchPort })` + слот в `buildDeps` после создания `dispatchPort`.
- MEDIUM: `getAppDisplayTimezoneSync` — однократный `logger.warn` при непустых legacy env; webapp `normalizeAppDisplayTimeZone` — `Intl.DateTimeFormat` как в integrator.
- LOW: `appTimezone.test.ts` — `invalid_iana`, `query_failed`, assert `missing_or_empty`; `appTimezone.dataQualityDispatch.test.ts` — fallback + `dispatchPort` → `dispatchOutgoing`; `appDisplayTimezone.test.ts` — ICU-invalid id; `MASTER_PLAN.md` — актуализирован источник display TZ.
Changed files:
- apps/integrator/src/integrations/google-calendar/sync.ts
- apps/integrator/src/integrations/rubitime/connector.ts, webhook.ts
- apps/integrator/src/infra/adapters/remindersReadsPort.ts
- apps/integrator/src/app/di.ts
- apps/integrator/src/config/appTimezone.ts, appTimezone.test.ts, appTimezone.dataQualityDispatch.test.ts (new)
- apps/webapp/src/modules/system-settings/appDisplayTimezone.ts, appDisplayTimezone.test.ts
- docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Checks:
- tests: integrator vitest (включая новые appTimezone-*); webapp vitest `appDisplayTimezone.test.ts`
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-04): lint, typecheck, integrator 561 passed | 6 skipped, webapp 1145 passed | 5 skipped, builds, `pnpm audit --prod`
Evidence:
- Prod GCal path: `webhook.ts` передаёт `dispatchPort` в calendar sync; reminder reads — тот же порт через lazy slot в DI.
Gate verdict:
- PASS для закрытия MANDATORY AUDIT_STAGE_4 (при fallback display-TZ инцидент + Telegram на этих путях при настроенном admin Telegram и первом dedup).
Notes:
- SHA на момент прогона: `ff342066bfe0a35630b2f7e6bb4969c579577586` (перезапустить `git rev-parse HEAD` после коммита).
```

```text
[2026-04-04] [Stage 4] [EXEC] [agent] (вход: STAGE_4_INTEGRATOR_DISPLAY_TIMEZONE_FROM_DB.md S4.T01–S4.T05)
Tasks done:
- S4.T01: `getAppDisplayTimezone({ db, dispatchPort? })` в `apps/integrator/src/config/appTimezone.ts` — чтение `SELECT value_json FROM system_settings WHERE key = 'app_display_timezone' AND scope = 'admin' LIMIT 1`, разбор `value_json.value` как в webapp `configAdapter`, TTL 60s in-memory.
- S4.T05: при `query_failed` / `missing_or_empty` / `invalid_iana` — `recordDataQualityIncidentAndMaybeTelegram` с `integration=core`, `entity=system_settings`, `externalId=app_display_timezone`, `field=app_display_timezone`, dedup + Telegram при наличии `dispatchPort`.
- S4.T02: callsites — `recordM2mRoute.ts` (create-record + booking lifecycle), `remindersReadsPort.ts` (fallback timezone только если в строке нет `timezone`), `kernel/domain/executor/handlers/reminders.ts` (новое правило из БД), `incomingEventPipeline` + `ExecutorDeps.dispatchPort`, `google-calendar/sync.ts` (`mapRubitimeEventToGoogleEvent` async + опция `displayTimeZone`), скрипты `compare-rubitime-records.ts` / `resync-rubitime-records.ts` (default offset через `getRubitimeRecordAtUtcOffsetMinutesForInstant({ db, instant })`).
- S4.T03: из `apps/integrator/src/config/env.ts` (zod) удалены `APP_DISPLAY_TIMEZONE`, `BOOKING_DISPLAY_TIMEZONE`; устаревший sync-хелпер `getAppDisplayTimezoneSync()` читает только `process.env` (вне схемы) для edge-кейсов.
- S4.T04: тесты `appTimezone.test.ts` — Samara из мок-БД, форматирование `formatBookingRuDateTime` 12:00Z → 16:00 Samara vs 15:00 MSK; fallback MSK + вызов incident mock; offset Rubitime через БД.
- `dataQualityIncidentAlert`: `dispatchPort` опционален (инцидент без Telegram, если порт не передан).
Changed files:
- apps/integrator/src/config/appTimezone.ts, appTimezone.test.ts
- apps/integrator/src/config/env.ts
- apps/integrator/src/infra/db/dataQualityIncidentAlert.ts
- apps/integrator/src/infra/db/repos/bookingDisplayTimezone.ts
- apps/integrator/src/infra/adapters/remindersReadsPort.ts, remindersReadsPort.test.ts
- apps/integrator/src/integrations/rubitime/recordM2mRoute.ts
- apps/integrator/src/integrations/google-calendar/sync.ts, sync.test.ts
- apps/integrator/src/kernel/domain/executor/helpers.ts, handlers/reminders.ts, executeAction.test.ts (mock `getAppDisplayTimezone`)
- apps/integrator/src/kernel/domain/reminders/policy.ts
- apps/integrator/src/kernel/eventGateway/incomingEventPipeline.ts
- apps/integrator/src/infra/scripts/compare-rubitime-records.ts, resync-rubitime-records.ts
Checks:
- tests: integrator vitest `557 passed | 6 skipped (563)`; webapp `1144 passed | 5 skipped (1149)`
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-04): lint, typecheck, builds, `pnpm audit --prod`
Evidence:
- SQL: `system_settings` / `app_display_timezone` / `admin` в `appTimezone.ts`.
- Europe/Samara: assert в `appTimezone.test.ts` (кэш TTL + `formatBookingRuDateTime` vs MSK).
Gate verdict:
- superseded: см. запись [FIX] AUDIT_STAGE_4 выше (первичный EXEC оставлен для истории).
Notes:
- Рабочий SHA: зафиксировать `git rev-parse HEAD` после коммита (на момент прогона рабочее дерево могло быть без коммита).
```

---

## Stage 5 - Remove +03 hardcodes

- Status: `PASS` (post `AUDIT_STAGE_5` FIX 2026-04-04; mandatory FIX-1 закрыт)
- Last update: `2026-04-04` (UTC)

### Entries

```text
[2026-04-04] [Stage 5] [FIX] [agent] (вход: AUDIT_STAGE_5.md, mandatory FIX-1)
Tasks done:
- Удалён хардкод `+03:00` и MSK-only ветка из `parseBusinessInstant` в `formatBusinessDateTime.ts`.
- Наивные даты `YYYY-MM-DDTHH:mm:ss(.fraction)` теперь интерпретируются как wall time в переданном `displayTimeZone` (IANA) через Luxon `DateTime.fromISO(..., { zone })` с переводом в UTC instant.
- Деградационный путь сохранён: при невалидной зоне/дате fallback остаётся через `new Date(t)` (как и до Stage 5 fix).
- Расширены тесты `formatBusinessDateTime.test.ts`: Moscow naive, Samara naive, разница UTC instant между Moscow/Samara, explicit `Z`, explicit offset.
Changed files:
- apps/webapp/src/shared/lib/formatBusinessDateTime.ts
- apps/webapp/src/shared/lib/formatBusinessDateTime.test.ts
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Checks:
- grep gate: `rg '\+03:00|\+03\b' apps/webapp/src --glob '*.ts' --files-with-matches` -> только `*.test.ts` (`formatBusinessDateTime.test.ts`, `bookingM2mApi.test.ts`, `route.test.ts`).
- tests: `pnpm --dir apps/webapp test -- src/shared/lib/formatBusinessDateTime.test.ts` -> PASS.
- ci: `pnpm install --frozen-lockfile && pnpm run ci` -> PASS (2026-04-04): lint, typecheck, integrator tests (563 passed | 6 skipped), webapp tests (1149 passed | 5 skipped), build integrator+webapp, `pnpm audit --prod`.
Gate verdict:
- PASS (Stage 5 mandatory fix закрыт, литерал `+03:00` удалён из продуктового `formatBusinessDateTime.ts`).
Notes:
- Во время фикса промежуточный вариант через `@/shared/normalizeToUtcInstant` ломал Next build из-за существующего re-export path в `apps/webapp/src/shared/normalizeToUtcInstant.ts`; исправлено в рамках того же Stage 5 fix переходом на прямой Luxon parse в `formatBusinessDateTime.ts`.
```

---

## Stage 6 - Historical backfill

- Status: `PASS` (post `AUDIT_STAGE_6` repo FIX 2026-04-05: help / APPLY_PLAN / tests / DIAGNOSTICS topology note; production gate B — по-прежнему у оператора)
- Last update: `2026-04-05` (UTC)

### Entries

```text
[2026-04-05] [Stage 6] [FIX] [agent] (вход: AUDIT_STAGE_6.md MANDATORY A.1–A.4, S6-C/S6-D)
Tasks done:
- A.1: `--help` / Safety — убрана несуществующая опция `--require-utc-match`; явно описан дефолт (совпадение с naive-as-UTC) и `--no-require-utc-match`; уточнён `--unresolved-out` для dry-run и apply.
- A.2: `stage6/APPLY_PLAN.md` — в шаг dry-run добавлен `--unresolved-out=/tmp/stage6-unresolved-dry-run.jsonl`.
- A.3: `historicalTimeBackfillLogic.test.ts` — кейс `unresolved` при невалидной IANA зоне; кейс `skip` с `stored_not_matching_naive_as_utc_pattern` при `requireUtcMisinterpretationMatch: true`.
- S6-D (INFO): комментарий в `stage6/DIAGNOSTICS.sql` про JOIN `branches` и топологию БД.
Changed files:
- apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts
- apps/integrator/src/scripts/stage6/historicalTimeBackfillLogic.test.ts
- docs/TIMEZONE_UTC_NORMALIZATION/stage6/APPLY_PLAN.md
- docs/TIMEZONE_UTC_NORMALIZATION/stage6/DIAGNOSTICS.sql
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Checks:
- tests: `pnpm --dir apps/integrator exec vitest run src/scripts/stage6/historicalTimeBackfillLogic.test.ts` — PASS (11 tests)
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-05 UTC): eslint, typecheck integrator+webapp, integrator vitest 574 passed | 6 skipped, webapp vitest 1149 passed | 5 skipped, builds, `pnpm audit --prod`
Evidence:
- Закрыты обязательные пункты репозитория из `AUDIT_STAGE_6.md` § MANDATORY FIX INSTRUCTIONS A.1–A.3; A.4 — зелёный CI.
Gate verdict:
- PASS для repo-side Stage 6 FIX; блок B (dry-run/post-check/backup на целевой БД) без изменений — оператор.
Notes:
- Рабочее дерево на момент прогона: `git describe --always --dirty` → `869f00f-dirty`; после коммита зафиксировать `git rev-parse HEAD`.
```

```text
[2026-04-04] [Stage 6] [EXEC] [agent]
Tasks done:
- S6.T01: SQL-диагностика `docs/TIMEZONE_UTC_NORMALIZATION/stage6/DIAGNOSTICS.sql` (объёмы, NULL record_at + naive payload, diff expected vs stored).
- S6.T02–S6.T04: CLI `pnpm --dir apps/integrator run timezone:stage6-backfill` — точечный UPDATE `rubitime_records`, `appointment_records`, `patient_bookings` (только `source=rubitime_projection`), `updated_at`, без blind shift; план стыкуется по `rubitime_id` / `integrator_record_id`.
- S6.T05: в скрипте две сессии BEGIN → UPDATE → отчёт rowCount → ROLLBACK (dry-run) или COMMIT (--apply).
- S6.T06: чеклист окна `docs/TIMEZONE_UTC_NORMALIZATION/stage6/APPLY_PLAN.md`.
- S6.T07: восстановление NULL `record_at` из naive payload; при невозможности нормализации — JSONL (`--unresolved-out`) и при `--apply` upsert в `integration_data_quality_incidents` (`backfill_unresolvable`, `unresolved`).
- Миграция `apps/integrator/src/infra/db/migrations/core/20260405_0001_integration_data_quality_stage6_backfill.sql`; типы `IntegrationDataQualityErrorReason` / `IntegrationDataQualityIncidentStatus`.
- Логика классификации + тесты: `historicalTimeBackfillLogic.ts` / `.test.ts`.
Changed files:
- apps/integrator/src/infra/db/migrations/core/20260405_0001_integration_data_quality_stage6_backfill.sql
- apps/integrator/src/shared/integrationDataQuality/types.ts
- apps/integrator/src/scripts/stage6/historicalTimeBackfillLogic.ts
- apps/integrator/src/scripts/stage6/historicalTimeBackfillLogic.test.ts
- apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts
- apps/integrator/package.json (scripts timezone:stage6-backfill*)
- docs/TIMEZONE_UTC_NORMALIZATION/stage6/DIAGNOSTICS.sql
- docs/TIMEZONE_UTC_NORMALIZATION/stage6/README.md
- docs/TIMEZONE_UTC_NORMALIZATION/stage6/APPLY_PLAN.md
Checks:
- tests: vitest `historicalTimeBackfillLogic.test.ts`; полный integrator suite 572 passed | 6 skipped.
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-04).
Evidence:
- Dry-run на реальной БД в среде агента не выполнялся (`DATABASE_URL` не задан в песочнице). Ожидаемый вывод: два JSON-объекта (план `counts`/`samples`/`skipHistogram` и `dryRunTransaction.rowsTouched`) при `--cutoff-iso=... --dry-run`.
Gate verdict:
- PASS для реализации и CI; production gate из STAGE_6 (backup, post-check, unresolved-разбор) — после прогона оператором.
Notes:
- SHA на момент CI: см. `git rev-parse HEAD` в рабочем дереве после коммита.
```

---

## Stage 7 - Downstream cleanup

- Status: `PASS` (AUDIT Stage 7 F1: уточнён grep-gate в MASTER_PLAN — 2026-04-05)
- Last update: `2026-04-05` (UTC)

### Entries

```text
[2026-04-05] [Stage 7] [FIX] [agent] (вход: AUDIT_STAGE_7.md Finding F1 — строгое выравнивание grep-gate)
Tasks done:
- В `docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md` §Stage 7 Gate уточнена формулировка: `+03:00` и `RUBITIME_RECORD_AT_UTC_OFFSET` — по-прежнему ноль вне тестов/комментариев; legacy имена `APP_DISPLAY_TIMEZONE` / `BOOKING_DISPLAY_TIMEZONE` явно разрешены только для deprecated `getAppDisplayTimezoneSync` + тесты/лог (согласовано с §«Текущее состояние» L54). F2 (TODO_BACKLOG) вне scope Stage 7 — без изменений.
Changed files:
- docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Checks:
- tests: integrator vitest `574 passed | 6 skipped`; webapp vitest `1149 passed | 5 skipped` (через `pnpm run ci`).
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-05 UTC): eslint, typecheck, tests, builds, `pnpm audit --prod`.
Evidence:
- Gate-текст в MASTER_PLAN §Stage 7 обновлён; буквальное противоречие с `getAppDisplayTimezoneSync` снято (AUDIT F1 вариант A).
Gate verdict:
- PASS
Notes:
- Рабочий SHA на момент прогона CI: `869f00fd285aa27f0609f7de88dae757d61cf3b0` — после коммита перезапустить `git rev-parse HEAD`.
```

```text
[2026-04-05] [Stage 7] [EXEC] [agent] (вход: STAGE_7_DOWNSTREAM_CLEANUP.md S7.T01–S7.T06)
Tasks done:
- S7.T01: `parseBusinessInstant` — однократный `console.warn` при разборе наивной wall-clock строки (safety-net после Stage 3).
- S7.T02: `pgPatientBookings.ts` — комментарий к защитному `CASE` для projection vs native (legacy guard).
- S7.T03: `resync-rubitime-records.ts` — удалён `rubitimeMaybeDateToIso`; `rubitimeRemoteDateToUtcIso` → `normalizeToUtcInstant`; CLI `--display-timezone=` (дефолт из `getAppDisplayTimezone`); вместо `--rubitime-offset-minutes=`.
- S7.T04: `google-calendar/sync.ts` — удалён `parseRecordAtToIso`; `normalizeToUtcInstant(recordAt, displayTimeZone)`.
- S7.T05: `env.ts` — удалена `RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES`; `resolveRubitimeRecordAtUtcOffsetMinutes` только через ICU/`longOffset` от IANA (без env-оверрайда).
- S7.T06: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` — политика timezone (БД + `app_display_timezone`, без env offset).
- Дополнительно: `compare-rubitime-records.ts` — тот же переход на `normalizeToUtcInstant` и `--display-timezone=`.
Changed files:
- apps/webapp/src/shared/lib/formatBusinessDateTime.ts
- apps/webapp/src/infra/repos/pgPatientBookings.ts
- apps/integrator/src/config/env.ts
- apps/integrator/src/config/appTimezone.ts
- apps/integrator/src/integrations/google-calendar/sync.ts
- apps/integrator/src/infra/scripts/resync-rubitime-records.ts, resync-rubitime-records.test.ts
- apps/integrator/src/infra/scripts/compare-rubitime-records.ts
- docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Removed legacy symbols:
- `rubitimeMaybeDateToIso` (resync)
- `parseRecordAtToIso` (google-calendar sync)
- `RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES` (integrator zod env)
Checks:
- grep (`apps/webapp/src` + `apps/integrator/src`, `*.ts`): `+03:00` — только тесты (`formatBusinessDateTime.test.ts`, `normalizeToUtcInstant.test.ts`, `resync-rubitime-records.test.ts`, и т.д.); `RUBITIME_RECORD_AT_UTC_OFFSET` — 0; `BOOKING_DISPLAY_TIMEZONE` — `appTimezone.ts` + `bookingDisplayTimezone.ts` (legacy `process.env`, вне zod).
- tests: integrator vitest `574 passed | 6 skipped`; webapp vitest `1149 passed | 5 skipped`.
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-05 UTC): eslint, typecheck, tests, builds, `pnpm audit --prod`.
Gate verdict:
- PASS
Notes:
- Рабочий SHA на момент прогона CI (uncommitted tree): `869f00fd285aa27f0609f7de88dae757d61cf3b0` — после коммита перезапустить `git rev-parse HEAD`.
```

---

## Stage 8 - Contract tests

- Status: `PASS` (Stage 8 AUDIT `REWORK_REQUIRED` закрыт FIX 2026-04-05; вход: `AUDIT_STAGE_8.md`)
- Last update: `2026-04-05` (UTC, FIX)

### Stage 8 - AUDIT (зафиксировано до FIX)

- Verdict: `REWORK_REQUIRED` (`docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_STAGE_8.md`, 2026-04-05 UTC)
- High (S8-A1): не было тестов webapp-таблиц `appointment_records.record_at` / `patient_bookings.slot_start` через репозитории/SQL.
- Medium (S8-A2): для S8.T04 не было ассерта `record_at` = NULL на bind `writePort` / `rubitime_records`.
- Low (S8-A3): webapp-кейс «S8.T04» дублировал номер интеграционного негатива.

### Entries

```text
[2026-04-05] [Stage 8] [FIX] [agent] (вход: AUDIT_STAGE_8.md MANDATORY FIX)
Tasks done:
- S8-A1: `apps/webapp/src/infra/repos/timezoneContract.stage8.pg.test.ts` — мок `getPool`, захват SQL: `createPgAppointmentProjectionPort().upsertRecordFromProjection` → параметр `record_at` ($3) = `2026-04-07T08:00:00.000Z`; `pgPatientBookingsPort.createPending` → `slot_start` ($6) = тот же canonical ISO.
- S8-A2: в `timezoneContract.stage8.test.ts` (integrator), сценарий S8.T04 — после негативного ingest вызов `createDbWritePort().writeDb` без `recordAt`, `timeNormalizationStatus: degraded` → `rubitime_records` bind `$3` = `null`.
- S8-A3: webapp UI кейс переименован в `S8.T04b UI`; удалён слабый round-trip тест (покрытие перенесено на PG-репозитории).
Changed files:
- apps/webapp/src/infra/repos/timezoneContract.stage8.pg.test.ts (new)
- apps/integrator/src/integrations/rubitime/timezoneContract.stage8.test.ts
- apps/webapp/src/shared/lib/timezoneContract.stage8.test.ts
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Checks:
- tests: integrator vitest `579 passed | 6 skipped`; webapp vitest `1154 passed | 5 skipped`.
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-05 UTC).
Evidence:
- SHA на момент прогона CI: `869f00fd285aa27f0609f7de88dae757d61cf3b0` (перезапустить `git rev-parse HEAD` после коммита FIX).
Gate verdict:
- PASS (gate «все слои» по webapp-таблицам: bind через репозитории в CI; S8.T04 NULL на integrator write подтверждён).
Notes:
- —
```

```text
[2026-04-05] [Stage 8] [EXEC] [agent] (вход: STAGE_8_CONTRACT_TESTS.md S8.T01–S8.T05)
Tasks done:
- S8.T01: фикстуры webhook — `apps/integrator/src/integrations/rubitime/timezoneContract.fixtures.ts` (Moscow/Samara, общий naive `2026-04-07 11:00:00`; негатив invalid datetime).
- S8.T02: Moscow — сквозной тест `timezoneContract.stage8.test.ts`: ingest `recordAt` = `2026-04-07T08:00:00.000Z`, `rubitime_records` bind `$3`, projection_outbox payload `recordAt` = `2026-04-07T08:00:00.000Z`, бот `formatBookingRuDateTime` = `7 апр. 2026 г., 11:00` (display `Europe/Moscow`).
- S8.T03: Samara — ingest `recordAt` = `2026-04-07T07:00:00.000Z`; MSK текст `7 апр. 2026 г., 10:00`; Samara `7 апр. 2026 г., 11:00`.
- S8.T04: invalid datetime — запись с `recordId` сохраняется в смысле payload, `recordAt` очищен, `timeNormalizationStatus` degraded, мок инцидента + `dispatchOutgoing`; `syncAppointmentToCalendar` при отсутствии `recordAt` не вызывает `upsertEvent`/`deleteEvent` при включённом GCal config.
- S8.T05: невалидная IANA в БД (`Invalid/Timezone`) — `createGetBranchTimezoneWithDataQuality` + ingest: fallback `Europe/Moscow`, нормализация как MSK (`2026-04-07T08:00:00.000Z`), инцидент `branch_timezone` / `invalid_iana` + Telegram intent.
- Webapp UI contract: `apps/webapp/src/shared/lib/timezoneContract.stage8.test.ts` — `formatBookingDateTimeMediumRu` / `formatDoctorAppointmentRecordAt` (Moscow/Samara expected strings); негатив пустого instant (S8.T04b).
Changed files:
- apps/integrator/src/integrations/rubitime/timezoneContract.fixtures.ts (new)
- apps/integrator/src/integrations/rubitime/timezoneContract.stage8.test.ts (new)
- apps/webapp/src/shared/lib/timezoneContract.stage8.test.ts (new)
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Checks:
- tests: `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/timezoneContract.stage8.test.ts`; `pnpm --dir apps/webapp exec vitest run src/shared/lib/timezoneContract.stage8.test.ts`; полный `pnpm run ci` — см. Evidence.
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-05 UTC): eslint, typecheck, integrator + webapp vitest, builds, `pnpm audit --prod`.
Evidence:
- Expected UTC: Moscow `2026-04-07T08:00:00.000Z`, Samara branch same wall → `2026-04-07T07:00:00.000Z`.
- UI (Node `Intl`, ru-RU / en-GB doctor): Moscow instant `08:00Z` → кабинет `7 апр. 2026 г., 11:00`, врач `11:00 07.04`; Samara instant `07:00Z` → MSK `7 апр. 2026 г., 10:00`, Samara `7 апр. 2026 г., 11:00`, врач Samara `11:00 07.04`.
- Негативы: invalid datetime — GCal upsert не вызывается; invalid branch IANA — `invalid_iana` + alert, runtime не падает.
Gate verdict:
- PASS (Moscow/Samara контракт по ingest → DB bind → projection → UI; негативы предсказуемы).
Notes:
- Дополнено FIX 2026-04-05: webapp таблицы + NULL bind S8.T04 — см. запись `[Stage 8] [FIX]` выше.
```

---

## Global Audit

- Status: `PASS` (repository + CI); production Stage 6 apply — оператор
- Last update: `2026-04-05` (UTC)
- Auditor: AI agent
- Report: `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_GLOBAL.md`

### Entries

```text
[2026-04-05] [Global] [AUDIT] [agent]
Tasks done:
- Глобальный аудит по MASTER_PLAN + STAGE_1..8 + этот лог; grep +03 (src non-test), env schema, CI.
Checks:
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — PASS
Evidence:
- Полный отчёт: `docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_GLOBAL.md` (global_verdict: APPROVE; major: Stage 6 production evidence; minor: DoD чекбоксы / журнал)
Gate verdict:
- PASS (repo); operational Stage 6 B — см. AUDIT_GLOBAL.md MANDATORY FIX
```

---

## Global Fix

- Status: `DONE` (документация DoD + grep gate + журнал; production Stage 6 apply — по-прежнему оператор)
- Last update: `2026-04-05` (UTC)

### Entries

```text
[2026-04-05] [Global] [FIX] [agent] (вход: AUDIT_GLOBAL.md findings M1, M2, m1, m2)
Tasks done:
- M2: `MASTER_PLAN.md` §DoD — чекбоксы для закрытых в репозитории критериев; бэкфилл помечен pending production + ссылка на `stage6/APPLY_PLAN.md`; добавлен явный grep gate (исключение `.next`/`dist`/копий билда).
- M1: зафиксировано в журнале: production Stage 6 (backup/apply/post-check) остаётся у оператора; evidence после выполнения — в этом логе или runbook.
- m1: §Global Audit уже содержит ссылку на `AUDIT_GLOBAL.md`; Final Decision обновлён.
- m2: см. grep one-liner в `MASTER_PLAN.md` §DoD.
Changed files:
- docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md
- docs/TIMEZONE_UTC_NORMALIZATION/AUDIT_GLOBAL.md
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Checks:
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — см. Final Decision
Gate verdict:
- PASS (документация); operational Stage 6 B — pending до apply на целевой БД
```

---

## Post–Global-Fix re-audit

- Status: `PASS` (документация и согласованность с кодом после Global FIX)
- Last update: `2026-04-04` (UTC)

### Entries

```text
[2026-04-04] [Global] [RE-AUDIT] [agent]
Tasks done:
- Сверка MASTER_PLAN с фактической реализацией: §«Текущее состояние» переписан (раньше дублировал pre-fix «Что сломано»).
- Stage 4 S4.T03: актуализировано (env без TZ; offset через IANA/БД, Stage 7 снял env-оверрайд).
- Связанные документы: добавлены ссылки на AGENT_EXECUTION_LOG / AUDIT_GLOBAL в MASTER_PLAN.
- Корневой README указывал на docs/README.md — создан `docs/README.md` с оглавлением и ссылкой на инициативу TIMEZONE.
- AUDIT_GLOBAL: пометка re-audit.
Spot checks:
- `apps/integrator/src/config/env.ts` — нет RUBITIME_RECORD_AT / display TZ в zod.
- `rg '+03:00' apps/integrator/src apps/webapp/src --glob '*.ts' --glob '!*.test.ts'` — 0 совпадений.
Checks:
- ci: `pnpm install --frozen-lockfile && pnpm run ci` — см. Final Decision
Gate verdict:
- PASS (репозиторий); Stage 6 production apply — без изменений (оператор)
```

---

## Production verification (operator)

- Status: `PASS` (операторская проверка после деплоя)
- Last update: `2026-04-04` (UTC+02 host time in evidence; apply completed)

### Entries

```text
[2026-04-04] [Production] [EXEC] [operator+agent]
Tasks done:
- Подтверждено применение миграций integrator:
  - `core:20260406_0002_create_system_settings.sql`
  - `rubitime:20260406_0005_rubitime_branches_timezone.sql`
  Проверка по `schema_migrations` и `information_schema.columns` (наличие `rubitime_branches.timezone`).
- Проверен post-deploy ingest (`rubitime_events.received_at >= 2026-04-04 19:10:33+02`): raw wall-clock события приходят корректно (`{record,record}`), новые записи в приложении/журнале отображаются в ожидаемом локальном времени.
- Исправлен путь bot-notification для Rubitime-скриптов: `incoming.recordAtFormatted` теперь формируется из UTC instant через локальную TZ филиала (не через прямое чтение часов из UTC ISO-строки).
- Stage 6 dry-run выполнен на целевой среде:
  - mode: dry-run
  - cutoffExclusive: `2026-04-04T19:10:33.000+02:00`
  - counts: `rubitime_records_to_update=0`, `appointment_records_to_update=0`, `patient_bookings_to_update=0`, `unresolved_candidates=0`
  - dryRunTransaction.rowsTouched: все `0`
- Перед apply выполнен backup обеих БД:
  - `/opt/backups/postgres/pre-migrations/integrator_tgcarebot_20260404_200658.dump`
  - `/opt/backups/postgres/pre-migrations/webapp_bcb_webapp_prod_20260404_200658.dump`
- Stage 6 apply выполнен на целевой среде:
  - mode: apply
  - cutoffExclusive: `2026-04-04T19:10:33.000+02:00`
  - counts: `rubitime_records_to_update=0`, `appointment_records_to_update=0`, `patient_bookings_to_update=0`, `unresolved_candidates=0`
  - dryRunTransaction.transaction: `COMMIT`
  - dryRunTransaction.rowsTouched: все `0`
Changed files:
- apps/integrator/src/integrations/rubitime/ingestNormalization.ts
- apps/integrator/src/integrations/rubitime/ingestNormalization.test.ts
- apps/integrator/src/integrations/rubitime/timezoneContract.stage8.test.ts
- docs/TIMEZONE_UTC_NORMALIZATION/AGENT_EXECUTION_LOG.md
Checks:
- tests: `pnpm --dir apps/integrator exec vitest run src/integrations/rubitime/ingestNormalization.test.ts src/integrations/rubitime/timezoneContract.stage8.test.ts` — PASS (10 tests).
- lints: проверка изменённых integrator-файлов — без ошибок.
Evidence:
- CLI evidence (host): `schema_migrations` содержит обе миграции от `20260406`; `rubitime_branches` содержит колонку `timezone`.
- Dry-run evidence (host): `/tmp/stage6-dry-run.json`, `/tmp/stage6-unresolved-dry-run.jsonl` (0 строк).
- Apply evidence (host): stdout `mode=apply`, `transaction=COMMIT`, `rowsTouched=0`; unresolved файл `/tmp/stage6-unresolved.jsonl` (0 строк).
Gate verdict:
- PASS (проблема времени в бот-сообщениях подтверждённо устранена; Stage 6 dry-run и apply на текущем cutoff — no-op).
Notes:
- `jq` на `/tmp/stage6-dry-run.json` требует вырезать префиксные строки (`pnpm`/`dotenv`) перед парсингом JSON.
```

---

## Final Decision

- Release readiness: `READY` (код + CI; бэкфилл истории на prod — по runbook)
- Final CI run: `pnpm install --frozen-lockfile && pnpm run ci` — PASS (2026-04-04 UTC, post re-audit)
- Decision timestamp (UTC): `2026-04-04`
- Release commit: идентификатор фиксируется в git при пуше; для точного SHA используйте `git log -1` на целевой ветке (встроенный хэш в этом файле намеренно не дублируется — иначе он устаревает при каждом amend).

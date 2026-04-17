# USER MERGE EXECUTION LOG

## 2026-04-11

### Admin: справочные подсказки по ФИО и расширение ручного merge UI

**Цель:** помочь администратору вручную находить возможные пары записей (TG / Rubitime и т.д.) без утверждения «дубликат подтверждён»; отдельный фильтр записей без телефона; произвольный поиск второй записи и явный выбор канонической стороны с опциональным отключением автоподстройки под эвристику preview.

**Код:**

- `apps/webapp/src/infra/platformUserNameMatchHints.ts` — SQL-отчёт `orderedGroups` / `swappedPairs`, фильтр `missingPhone`.
- `apps/webapp/src/infra/platformUserMergePreview.ts` — `searchMergeUsersForManualMerge`.
- `apps/webapp/src/app/api/doctor/clients/name-match-hints/route.ts`, `merge-user-search/route.ts` — guards, zod, `logger.info` (`name_match_hints`, `merge_user_search`).
- `apps/webapp/src/app/app/doctor/clients/name-match-hints/page.tsx`, `NameMatchHintsClient.tsx` — страница отчёта; ссылка из `DoctorClientsPanel` при admin + admin mode.
- `apps/webapp/src/app/app/doctor/clients/AdminMergeAccountsPanel.tsx` — поиск второй записи, радио канона, чекбокс «Подстроить ориентацию под рекомендацию preview».
- `apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts` — `resolveMergePreviewAlignment`.

**Тесты:** `platformUserNameMatchHints.test.ts`, route tests для новых API, расширение `adminMergeAccountsLogic.test.ts`, существующие тесты панели merge.

**Документация:** `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md`, `docs/ARCHITECTURE/ADMIN_NAME_MATCH_HINTS_PLAN_AND_EXECUTION_LOG.md` (план и журнал в репо), `docs/PLATFORM_IDENTITY_ACCESS/SCENARIOS_AND_CODE_MAP.md`, строка в `docs/README.md`.

**Проверка:** `pnpm run ci` (корень репозитория) — зелёный (2026-04-11, локально).

**Follow-up (при росте БД):** при необходимости — индексы/материализация для `name-match-hints` (полный scan по `platform_users`).

**Hardening (тот же релиз / сразу после):** отмена гонок `merge-preview` (AbortController + игнор устаревших ответов), отдельное отображение ошибок `merge-user-search`, синтетическая опция в `<select>` для второй записи из поиска, ссылки с отчёта ФИО с `scope=all`, сброс таблицы подсказок до нового запроса, сброс полей поиска после успешного merge.

---

## 2026-04-09

### Scope

Релизная итерация по плану `platform_user_merge_&_dedup_a6e3f1c6.plan.md`:

- доведение merge/dedup реализации до консистентного состояния;
- фиксация архитектурных решений и фактического прогресса в репозитории;
- добавление диагностических SQL и enforce миграции.

### Applied migrations (repo)

Добавлены/подготовлены:

- `apps/webapp/migrations/061_platform_users_merge.sql`
- `apps/webapp/migrations/062_platform_user_owned_refs_prepare.sql`
- `apps/webapp/migrations/063_platform_user_owned_refs_backfill.sql`

Отдельно (деплой 2, не включать в первый релиз):

- `apps/webapp/migrations/064_platform_user_owned_refs_enforce.sql`

Примечание: факт применения в конкретной БД фиксируется отдельным деплой-логом/`schema_migrations`.

### Кодовые изменения (ключевые блоки)

- **Rubitime ingest / unknown client fix**
  - `apps/webapp/src/modules/integrator/events.ts`
  - `apps/webapp/src/infra/repos/pgUserProjection.ts`
  - `apps/webapp/src/infra/repos/pgPatientBookings.ts`
  - `apps/webapp/src/infra/repos/pgDoctorAppointments.ts`
- **Canonical helper + merge engine**
  - `apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts`
  - `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts`
  - `apps/webapp/src/infra/repos/platformUserMergeErrors.ts`
- **Entry point fixes / no-steal**
  - `apps/webapp/src/infra/repos/pgUserByPhone.ts`
  - `apps/webapp/src/infra/repos/pgIdentityResolution.ts`
  - `apps/webapp/src/modules/auth/oauthYandexResolve.ts`
- **Legacy dual-write/read-switch (selected paths)**
  - `pgSymptomDiary`, `pgLfkDiary`, `pgLfkAssignments`, `pgChannelPreferences`, `pgMessageLog`, `newsMotivation`
  - purge/admin scripts aligned with `platform_user_id` (`pgDiaryPurge`, `platformUserFullPurge`, `user-phone-admin.ts`)
- **Canonical read-side adoption**
  - `pgDoctorClients`, `pgDoctorAppointments`
  - reminder routes: `skip/snooze`
  - repos: `pgReminderProjection`, `pgSupportCommunication`
- **UI identity shape**
  - `ClientIdentity.channelBindingDates` added and wired in doctor clients flow.

### SQL audit scripts

- Preflight:
  - `apps/webapp/scripts/audit-platform-user-preflight.sql`
- Diagnostic (post-merge / post-backfill checks):
  - `apps/webapp/scripts/audit-platform-user-merge.sql`

### Validation in dev CI-like checks

Локально на workspace:

- `pnpm --dir apps/webapp exec vitest run src/modules/integrator/events.test.ts src/infra/repos/pgUserByPhone.test.ts` -> passed
- `pnpm --dir apps/webapp run typecheck` -> passed

### Known pending / follow-up

- Прогон `preflight`/`diagnostic` SQL на целевой БД (dev/prod) с фиксацией чисел в ops-логе.
- Full Postgres-backed integration suite для merge scenarios (пока есть unit/focused coverage, но не полный перечень из master плана).
- Решения по cleanup phase (physical delete aliases, drop legacy text `user_id`) отложены и не входят в текущую фазу.

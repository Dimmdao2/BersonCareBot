# Инвентаризация: сырой SQL вне Drizzle query builder

**Дата снимка:** 2026-06-06 (**Wave 3 phase 00 baseline**; phases **08–14** closeout; правки: Wave 2 P5–P8)
**Контекст:** мастер-план **P1–P4 интегратора** и **Wave 2 (этапы 1–8)** закрыты — здесь **остатки** сырого SQL и зона вне интегратора (webapp, worker, пакеты). Wave 3 классифицирует хвост по **Class A / B / C** ([`plans/wave3_DECISIONS.md`](./plans/wave3_DECISIONS.md)).

**План перехода (фазы, риски, приоритеты):** [DRIZZLE_TRANSITION_PLAN.md](./DRIZZLE_TRANSITION_PLAN.md) · Wave 3 индекс: [`plans/wave3_INDEX.md`](./plans/wave3_INDEX.md)

## Легенда столбцов оценки

| Столбец     | Смысл                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Class**   | **A** — убрать необъяснённый `pool.query` / `client.query` / `DbPort.query` из runtime (фазы 09–15); **B** — SQL-текст остаётся, канал только `run*Sql` / `execute(sql)`; **C** — осознанный permanent `pg` (ADR в [LOG](./LOG.md) §Wave 3). |
| **Сложн.**  | **Н** — простой маппинг на Drizzle API; **С** — транзакции, динамика, несколько таблиц, чтение `public` из другого процесса; **В** — очереди/merge/purge, крупные CTE, `SKIP LOCKED`, cross-schema; **—** — вне цели перевода на Drizzle builder (мигратор, чистый транспорт). |
| **Вариант** | Целевой подход: `Drizzle` — builder; `+sql` — фрагменты `sql`…; `execute(sql)` — оставить явный SQL через Drizzle-сессию; `pg` — целесообразно оставить на `pg` (мигратор, ops). |
| **Риски**   | Кратко: что ломается при ошибке миграции.                                                                                                                                                                                                                                      |

## Методология

| Категория                                                              | Включено в отчёт | Комментарий                                                                                                         |
| ---------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| **A. `pg` Pool / PoolClient** — `pool.query(...)`, `client.query(...)` | Да               | Прямой текст SQL + параметры, без Drizzle relational API.                                                           |
| **B. `DbPort.query` (интегратор)**                                     | Да               | Обёртка над тем же `pg` (`createDbPort` в `apps/integrator/src/infra/db/client.ts`).                                |
| **C. `db.query` на пуле webapp**                                       | Да               | Там, где `db` — это `pg.Pool` (отдельное подключение к БД интегратора / не Drizzle webapp).                         |
| **D. Drizzle `db.query.*.findFirst` / `insert` / `select().from()`**   | Нет              | Уже «обёртка» Drizzle.                                                                                              |
| **E. Drizzle `execute(sql…)` и `runIntegratorSql(db, sql…)`** | Отдельный раздел | SQL остаётся текстом, но выполнение идёт через Drizzle-сессию (`getIntegratorDrizzleSession` / `runIntegratorSql`). |

**Не цель отчёта:** определения колонок в шаблонах `sql`… внутри `db/schema/*.ts` (DDL схемы Drizzle), HTTP-клиенты с `.query(true)` (nock).

**Тесты и скрипты:** перечислены; помечены как `script` / `test`, где уместно.

---

## Wave 3 baseline (2026-06-05, `rg`)

Сверка перед фазами 09–15. Команды — [wave3_phase_00](./plans/wave3_phase_00_baseline_adr.plan.md).

| Зона | Метрика | Class (по умолчанию) | Фаза Wave 3 |
|------|---------|----------------------|-------------|
| Integrator `await db.query` (без `migrate.ts` / scripts) | **0** prod (было 20) | **A** закрыто фазой **09**; `client.ts` → **C** (DbPort transport) | — |
| Integrator `rubitimeApiThrottle` throttle row | **0** `client.query` (было 2) | **B** — Drizzle `execute` на том же `PoolClient` (фаза **09E**) | — |
| Webapp `pool.query` \| `client.query` (без `*.test.ts`) | **78** prod-файлов | **A** (фазы 11–15), исключения **B/C** — в таблицах ниже | 11–15 |
| Webapp `integratorPushOutbox.ts` | `db.query` на `Pool` \| `PoolClient` (**не** в grep `pool.query`) | **A** | 15D |
| media-worker `jobs/claim.ts` | **8** `pool.query` | **C** (`SKIP LOCKED` на dedicated pg session) | — |
| media-worker `processTranscodeJob` + `processProgramSubmissionTranscode` | **0** direct `pool.query` (фаза **10** done) | **B** — `runMediaWorkerPgText` | — |
| media-worker settings (`watermarkEnabled`, `pipelineEnabled`) | **0** direct `pool.query` (фаза **10** done) | **B** — `runMediaWorkerPgText` + Zod | — |
| `packages/platform-merge` | **85** `.query(` (79 + 2 + 4) | **C** (merge engine; Drizzle rewrite out of scope) | ADR |
| `packages/booking-rubitime-sync` | **4** `.query(` | **C** (`SqlExecutor` + pg text) | ADR |

**Permanent Class C (ADR, не обсуждать в 09–15):** `platform-merge`, `booking-rubitime-sync`, integrator/media-worker **claim** (`SKIP LOCKED`), `migrate.ts` / one-off scripts, `projectionHealthCore`, `client.ts` DbPort/health transport, webapp `client.ts` healthcheck, TX-only `BEGIN`/`COMMIT`/`ROLLBACK` на dedicated `PoolClient` (`channelLink`, `s3MediaStorage`).

**Permanent Class B (канон унифицирован, builder не цель):** `projectionHealthCore`, integrator claim paths (`projectionOutbox`, `jobQueue`, `outgoingDeliveryQueue`), webapp media/reminder/LFK hot-path `execute(sql)`, media-worker post-claim SQL (`runMediaWorkerPgText` / `runMediaWorkerSql.ts`, фаза **10**).

---

## Wave 3 phase 08 — integrator schema reduction (2026-06-06)

Фаза 08 закрыта как **non-destructive reduction**: таблицы не удалялись, production DDL не выполнялся. Любой будущий `DROP` / hard deprecate требует senior-agent review + owner approval + backup/rollback/окно выката.

| Группа | Статус после phase08 | Следствие для phase09+ |
|--------|----------------------|-------------------------|
| `integrator.system_settings` / `settingsSyncRoute` / webapp `system_settings_sync` | Runtime source removed; legacy mirror/sync = **deprecate candidate** | Runtime readers читают `public.system_settings`; phase09 может делать helper+Zod для public reads, но не мигрирует mirror как source of truth. |
| `rubitime_branches`, `rubitime_services`, `rubitime_cooperators`, `rubitime_booking_profiles` | **move-to-public / deprecate candidate** | `bookingProfilesRepo` не входит в phase09 P1+; future cutover должен идти через `public.booking_*` / `@bersoncare/booking-rubitime-sync`. |
| `rubitime_records` | **raw-audit-only / deprecate candidate** | Business canon = `public.appointment_records` + `public.patient_bookings`; ops scripts остаются Class C до отдельного cutover. |
| `rubitime_events` | **keep technical audit** | Webhook replay/debug остаётся integrator technical state. |
| `booking_calendar_map` | **move-to-public candidate** | Не расширять; сейчас thin map + sync `public.patient_bookings.gcal_event_id`. |
| `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs` | **move-to-public candidate; dispatch-state review** | Не расширять зеркало; separate dispatch-from-public design перед удалением. |
| `users`, `identities`, `contacts`, `telegram_state` | **keep channel identity state** | Не использовать как дубль public-профиля пациента. |
| `conversations`, `conversation_messages`, `message_drafts`, `user_questions`, `question_messages` | **review / transport-log only** | Сверить с public support canon перед любым delete/deprecate. |
| `projection_outbox`, `rubitime_create_retry_jobs`, delivery/audit logs, throttle/advisory/idempotency | **keep technical state** | Остаются integrator-owned technical state. |

Проверка source-of-truth настроек: `rg "FROM system_settings|INTO system_settings|UPDATE system_settings" apps/integrator/src --glob "*.ts"` → **0** unqualified matches; expected explicit matches только `public.system_settings` и legacy `integrator.system_settings` в sync route/test.

---

## Wave 3 phase 09 — integrator P1+ (2026-06-06)

Фаза **09A–09E** закрыта: prod `await db.query` в integrator (кроме `client.ts` health, `migrate.ts`, ops scripts) → **0**; throttle row → Drizzle session (Class B).

| Артефакт | Итог |
|----------|------|
| Settings helper | `publicSystemSettings.ts` — envelope/scalar Zod, `fetchPublicSystemSettingValueJson` |
| SQL transport | `runIntegratorSql` — `PgDialect.sqlToQuery` + fallback `db.query`; `public.system_settings` всегда через `DbPort.query` |
| Id-lists | `parseMessengerIdTokens.ts` (без `JSON.parse(...) as unknown`) |
| Idempotency | `GATEWAY_IDEMPOTENCY_ALLOWED_TABLES`; static `sql` templates + unit tests |
| Out of scope (без изменений) | `bookingProfilesRepo`, `projectionHealthCore`, `settingsSyncRoute` write-only legacy |

Проверки: integrator **1054 tests** passed; `pnpm --dir apps/integrator run typecheck` green. Post-audit closure — [LOG](./LOG.md) § «Post-audit closure (2026-06-06)».

---

## Wave 3 phase 10 — media-worker IX (2026-06-06)

Фаза **10A–10C** закрыта: post-claim SQL → Class B; `jobs/claim.ts` без изменений (Class C).

| Артефакт | Итог |
|----------|------|
| SQL transport | `runMediaWorkerSql.ts` — `PgDialect.sqlToQuery` + `pg.Pool.query`; bridge `runMediaWorkerPgText` |
| Migrated callers | `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `watermarkEnabled.ts`, `pipelineEnabled.ts` |
| Settings JSON | `systemSettingBoolean.ts`, `watermarkEnabled.test.ts` — Zod `safeParse` для admin boolean flags |
| Out of scope | shared schema package; `claim.ts`; webapp enqueue |
| Staging smoke | чеклист в [LOG](./LOG.md) §10C — **исполнение gate фазы 17** |

Проверки: `rg 'pool\.query' apps/media-worker/src --glob '*.ts'` → `claim.ts` + transport `runMediaWorkerSql.ts`; `pnpm --dir apps/media-worker run test` — **22 passed**; typecheck green; **`pnpm run ci`** — green (2026-06-06).

---

## Wave 3 phase 14 — webapp comms + projection (2026-06-06)

Фаза **14A–14E** закрыта: 10 scope-файлов — runtime `pool.query` = **0**; domain SQL → `runWebappPgText` / `txPgText`.

| Gate (14E) | Итог |
|------------|------|
| Scope files | `pgSupportCommunication`, `pgUserProjection`, `adminAuditLog`, `mergeLegacySupportConversations`, `pgMessageLog`, `pgChannelPreferences`, `pgWebPushSubscriptions`, `pgBroadcastAudit`, `pgSubscriptionMailingProjection`, `pgPatientCalendarTimezone` |
| `pool.query` | **0** (runtime; JSDoc «no direct pool.query» в headers допустим) |
| Class C `client.query` | TX transport only: support merge wrapper (3×); user projection (4 TX + `SET CONSTRAINTS`); audit dedupe; channel prefs; web-push save |
| Zod boundaries | `supportAdminListQuery`, `adminAuditListQuery`, `messageLogListQuery`; admin profile PATCH bodySchema (`/api/admin/users/[userId]/profile`) |
| Tests | Vitest `--project fast` phase-14 bundle — **118 passed** / **11 skipped** (devDb opt-in); staging smoke — **phase 17** |

Post-audit closure — [LOG](./LOG.md) §Wave 3 phase 14E.

---

## Раздел E (справочно): SQL через Drizzle `execute` / `runIntegratorSql`

Здесь **нет** прямого `pool.query`, но остаётся **сырой SQL-текст** в шаблонах `sql`…`` — для миграции на «чистый» query builder это отдельный слой.

| Файл                                                         | Назначение                                                                                                   | Сложн. | Вариант                                                                                                              | Риски                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `apps/integrator/src/infra/db/repos/projectionOutbox.ts`     | Claim событий projection outbox (CTE + `FOR UPDATE SKIP LOCKED`).                                            | В      | `execute(sql)` сохранить; view + простой `select` — отдельная постановка (backlog), если понадобится упростить claim | Регресс claim, дедлоки, порядок строк |
| `apps/integrator/src/infra/db/repos/jobQueue.ts`             | Claim отложенных jobs очереди сообщений.                                                                     | В      | как выше                                                                                                             | Идемпотентность, конкуренция воркеров |
| `apps/integrator/src/infra/db/repos/reminders.ts`            | Сложные операции напоминаний (в т.ч. `execute(sql)`).                                                        | В      | частично `Drizzle`, hot-path `execute(sql)`                                                                          | Доменные правила напоминаний, TZ      |
| `apps/integrator/src/infra/db/repos/bookingCalendarMap.ts`   | Синхронизация полей `public.patient_bookings` с картой календаря (`runIntegratorSql`).                       | С      | `Drizzle` + `runIntegratorSql`/`+sql` для public sync                                                                | Расхождение схем public vs integrator |
| `apps/integrator/src/infra/db/repos/channelUsers.ts`         | Пользователи каналов / привязки Telegram и связанные выборки/апдейты (`runIntegratorSql`).                   | В      | поэтапно `Drizzle`, сложные запросы `+sql`                                                                           | Объём, дубли таблиц в схемах          |
| `apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts` | Слияние пользователей интегратора (identities, telegram_state, projection outbox и др., `runIntegratorSql`). | В      | оставить `runIntegratorSql` ядро; оболочки — `Drizzle`                                                               | Катастрофический регресс данных       |
| `apps/integrator/src/infra/db/repos/messageThreads.ts`       | Треды поддержки / черновики / списки разговоров (`runIntegratorSql`).                                        | В      | поэтапно `Drizzle` + `+sql`                                                                                          | UX поддержки, пагинация               |
| `apps/webapp/src/infra/repos/warmupFeelingTrackingTx.ts`     | Прогрев/проверка транзакции Drizzle (`tx.execute(sql)`).                                                     | Н      | без изменений / `execute(sql)`                                                                                       | Низкий                                |
| `apps/webapp/src/app-layer/db/drizzle.smoke.test.ts`         | Smoke `select 1` для Drizzle.                                                                                | Н      | без изменений (`getDrizzle().execute`)                                                                               | Низкий                                |

---

## 1. `apps/integrator`

### 1.1 Инфраструктура БД

| Файл                      | Назначение запросов                                                                                                                          | Class | Сложн. | Вариант                                                                                                 | Риски                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `src/infra/db/client.ts`  | Реализация `DbPort.query` / транзакция `BEGIN`/`COMMIT`/`ROLLBACK` на `pg` client; health `SELECT 1` на пуле.                                | **C** | С      | `DbPort` оставить как транспорт; внутри TX уже есть `integratorDrizzle` — не ломать оболочку без задачи | Регресс всех репозиториев на TX            |
| `src/infra/db/migrate.ts` | Применение SQL-миграций: `CREATE SCHEMA`, проверки таблицы миграций, `BEGIN`/`COMMIT`/`ROLLBACK`, выполнение тела миграции, запись в ledger. | **C** | —      | **`pg`** — вне цели Drizzle-ORM для тел миграций                                                        | Низкие; мигратор остаётся на строковом SQL |

### 1.2 Репозитории и чтение (сырой `db.query` / `tx.query`)

| Файл                                                            | Назначение                                                                                                                                       | Class | Сложн. | Вариант                                                                    | Риски                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/infra/db/repos/outgoingDeliveryQueue.ts`                   | Очередь `public.outgoing_delivery_queue`: idempotent insert, сброс зависших `processing`, claim с `SKIP LOCKED`, финальные статусы и reschedule. | **B** | В      | **Wave 2 P1 done:** `runIntegratorSql`; claim — `execute(sql)` | Очередь исходящей доставки                                           |
| `src/infra/db/repos/projectionHealth.ts`                        | Агрегаты по `projection_outbox` (counts по статусам, oldest pending, распределение ретраев, last success, over threshold).                       | **B** | С      | **Wave 2 P2 done:** `projectionHealthCore.ts` (единый канон CLI+HTTP); builder `groupBy` — backlog | Release-gate метрики (цифры согласованы) |
| `src/infra/db/repos/messengerPhoneBindAudit.ts`                 | В транзакции: upsert/инкремент аудита привязки телефона мессенджера.                                                                             | **B** | С      | **Wave 2 P1 done:** `runIntegratorSql`                                     | Дубликаты аудита, гонки                                              |
| `src/infra/db/repos/operationalVerboseLog.ts`                   | Чтение флага verbose operational log из `public.system_settings` (phase08 source cutover).                                                        | **A** | Н      | **P9 done (09B):** `publicSystemSettings` + `runIntegratorSql` + Zod         | Шум в логах                                                          |
| `src/infra/db/repos/platformUserDeliveryPhone.ts`               | Нормализованный телефон платформенного пользователя.                                                                                             | **A** | Н      | **P9 done (09B):** `runIntegratorSql` + Zod                                           | Низкие                                                               |
| `src/infra/db/repos/patientHomeMorningPing.ts`                  | Данные для утреннего пинга (привязки, флаги, ключи настроек).                                                                                    | **A** | С      | **P9 done (09C):** `runIntegratorSql` + Zod                                            | Неверный выбор получателей пинга                                     |
| `src/infra/db/repos/idempotencyKeys.ts`                         | Проверка/учёт idempotency по динамически собранному SQL.                                                                                         | **A** | С      | **P9 done (09C):** `runIntegratorSql` + `GATEWAY_IDEMPOTENCY_ALLOWED_TABLES`                           | SQL-инъекция при ошибочном whitelist                                 |
| `src/infra/db/repos/adminStats.ts`                              | Админ-статистика (динамический query + агрегаты по Telegram / Rubitime).                                                                         | **A** | С      | **P9 done (09C):** `runIntegratorSql` + Zod                                  | Неточные цифры в админке                                             |
| `src/infra/db/repos/linkedPhoneSource.ts`                       | Чтение `public.system_settings` для источника привязки телефона (phase08 source cutover).                                                        | **A** | Н      | **P9 done (09B):** `publicSystemSettings` + Zod               | Низкие                                                               |
| `src/infra/db/repos/resolvePlatformUserIdForRubitimeBooking.ts` | Разрешение `platform_users.id` для записи Rubitime.                                                                                              | **A** | Н      | **P9 done (09B):** `runIntegratorSql` + Zod                                            | Неверная привязка записи                                             |
| `src/infra/db/repos/canonicalUserId.ts`                         | Канонический user id / merge target.                                                                                                             | **A** | Н      | **P9 done (09B):** `runIntegratorSql` + Zod                                            | Неверный merge target                                                |
| `src/infra/db/repos/integrationDataQualityIncidents.ts`         | Подсчёт инцидентов качества данных (SQL + параметры).                                                                                            | **A** | С      | **P9 done (09C):** `runIntegratorSql` + Zod                                  | Алерты качества                                                      |
| `src/integrations/rubitime/db/bookingProfilesRepo.ts`           | Legacy v1 профили записей Rubitime: `integrator.rubitime_*` mapping поверх дублей booking catalog.                                                | **B** | В      | **Wave 2 P1 done:** `runIntegratorSql` + `sql`; **phase08:** move-to-public/deprecate candidate, не мигрировать в phase09 ради Drizzle | Rubitime домен, дубли каталогов таблиц                               |

### 1.3 HTTP / runtime / конфиг

| Файл                                                            | Назначение                                                                                                                                                                                                                                                                                                                                                                                                                       | Class | Сложн. | Вариант                                                                                         | Риски                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/integrations/bersoncare/settingsSyncRoute.ts`              | Подписанный legacy webhook: upsert в `integrator.system_settings` mirror + cache invalidation; не runtime source.                                                                                                                                                                                                                                                                                                                | **B** | С      | **Wave 2 P1 done:** `runIntegratorSql` + `sql` `ON CONFLICT`; **phase08:** legacy compatibility, future deprecate after owner-approved M2M cleanup | Обратный канал к webapp `updateSetting`: не ломать retry/cache-invalidation до отдельного cutover |
| `src/infra/db/messengerStaffIds.ts`                             | Чтение staff ids из `public.system_settings`.                                                                                                                                                                                                                                                                                                                                                                                    | **A** | Н      | **P9 done (09B):** `publicSystemSettings` + `parseMessengerIdTokens`         | Неверные staff ids в интеграторе                                                                       |
| `src/config/smtpOutbound.ts`                                    | Чтение SMTP outbound config из `public.system_settings` (phase08 source cutover).                                                                                                                                                                                                                                                                                                                                                 | **A** | Н      | **P9 done (09A):** `publicSystemSettings` + `runIntegratorSql` + Zod                            | Сбой исходящей почты                                                                                   |
| `src/infra/db/adminIncidentAlertRelay.ts`                       | Чтение настроек для релея инцидентов.                                                                                                                                                                                                                                                                                                                                                                                            | **A** | Н      | **P9 done (09B):** `runIntegratorSql` + Zod                                                                                       | Пропуск/ложные алерты                                                                                  |
| `src/infra/db/branchTimezone.ts`                                | IANA timezone филиала.                                                                                                                                                                                                                                                                                                                                                                                                           | **A** | С      | **P9 done (09C):** `runIntegratorSql` + join `public.booking_branches` + Zod | Неверный слот времени, data-quality инциденты                                                          |
| `src/infra/runtime/worker/outgoingDeliveryWorker.ts`            | Воркер `public.outgoing_delivery_queue`: `SELECT` статуса напоминания; для `doctor_broadcast_intent` — опционально **`doctorBroadcastIntentMenu`** перед **`dispatchOutgoing`** при `payload_json.attachMenu`; `UPDATE public.broadcast_audit` (`sent_count` после успеха; `error_count` через `finalizeOutgoingDeliveryDead` / `incrementBroadcastAuditErrorIfDoctorBroadcast`, если в `payload_json` есть `broadcastAuditId`). | С      | **Wave 2 P1 done** (точечный SQL → `runIntegratorSql`); dispatch/retry без изменений              | Счётчики рассылок врача, идемпотентность очереди                                                       |
| `src/infra/runtime/worker/doctorBroadcastIntentMenu.ts`         | Рассылки врача: **`runIntegratorSql`** (WITH RECURSIVE по `public.platform_users` + LATERAL `contacts` по `integrator_user_id`) для политики **`linkedPhone`**; без глобального `setMyCommands` / setup меню из воркера.                                                                                                                                                                                                         | С      | оставить `runIntegratorSql` / вынести в port при рефакторе                                      | Расхождение телефона с каноном `channelUsers` / `delivery`                                             |
| `src/config/appBaseUrl.ts`                                      | Кэшируемое чтение `app_base_url` из `public.system_settings` (phase08 source cutover).                                                                                                                                                                                                                                                                                                                                            | **A** | Н      | **P9 done (09A):** `publicSystemSettings` + `runIntegratorSql` + Zod                                                        | Неверные URL в интеграторе                                                                             |
| `src/config/appTimezone.ts`                                     | Кэшируемое чтение таймзоны отображения из `public.system_settings` (phase08 source cutover).                                                                                                                                                                                                                                                                                                                                      | **A** | Н      | **P9 done (09A):** `publicSystemSettings` + `runIntegratorSql` + Zod                                                        | Неверное отображение времени                                                                           |
| `src/integrations/google-calendar/runtimeConfig.ts`             | JSON настройки Google Calendar из `public.system_settings` (phase08 source cutover).                                                                                                                                                                                                                                                                                                                                              | **A** | Н      | **P9 done (09D):** `publicSystemSettings` + `runIntegratorSql` + Zod                                                        | Сбой GCal интеграции                                                                                   |
| `src/integrations/google-calendar/calendarDescription.ts`       | Описание события GCal из настроек/контекста.                                                                                                                                                                                                                                                                                                                                                                                     | **A** | Н      | **P9 done (09D):** `runIntegratorSql` + Zod                                                                                       | Тексты событий календаря                                                                               |
| `src/integrations/google-calendar/resolvePackageCalendarContext.ts` | Резолв контекста пакета GCal (cross-schema reads).                                                                                                                                                                                                                                                                                                                                                                           | **A** | С      | **P9 done (09D):** `runIntegratorSql` + Zod                                                                             | Неверный calendar mapping                                                                              |
| `src/kernel/domain/executor/handlers/patientHomeMorningPing.ts` | Handler: чтение настроек (`value_json`) для сценария пинга из `public.system_settings` (phase08 source cutover).                                                                                                                                                                                                                                                                                                                  | **A** | Н      | **P9 done (09C):** `publicSystemSettings` + Zod                                                                         | Дублирование логики чтения settings                                                                    |

### 1.4 Блокировки и throttle

| Файл                                               | Назначение                                                             | Class | Сложн. | Вариант                                        | Риски                                |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ----- | ------ | ---------------------------------------------- | ------------------------------------ |
| `src/integrations/rubitime/rubitimeApiThrottle.ts` | `pg_advisory_lock` / unlock + throttle row read/update.                | **B** | С      | **P9 done (09E):** advisory (P3) + Drizzle `execute` на том же `PoolClient` | Взаимная блокировка API Rubitime     |
| `src/infra/db/repos/schedulerLocks.ts`             | `pg_try_advisory_lock` / `pg_advisory_unlock` для слотов планировщика. | С      | **Wave 2 P3 done:** `pgAdvisoryLock.ts`                                      | Двойной запуск джоба / пропуск слота |

### 1.5 Скрипты и операции

| Файл                                                   | Назначение                                                                                                                          | Сложн. | Вариант                                 | Риски                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------- | --------------------------------- |
| `scripts/projection-health.mjs`                        | CLI: те же агрегаты outbox, что и `projectionHealth.ts`, для релизных проверок.                                                     | Н      | вызывать общий TS-модуль / **`pg`** CLI | Расхождение цифр с prod-метриками |
| `src/infra/scripts/stage6-historical-time-backfill.ts` | Массовый бэкфилл времени: `BEGIN`/`COMMIT`, пары webapp/integrator клиентов, `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` на ошибках строки. | В      | **`pg`** one-off; не ORM                | Испорченные исторические времена  |
| `src/infra/scripts/resync-rubitime-records.ts`         | Ресинк записей Rubitime: динамический `UPDATE rubitime_records SET …`, выборки outbox.                                              | С      | **`pg`** или общий repo с `Drizzle`     | Рассинхрон Rubitime               |
| `src/infra/scripts/compare-rubitime-records.ts`        | Сравнение локальных строк с внешним снимком (`input.db.query` с параметризованным SQL).                                             | Н      | **`pg`** / тонкий repo                  | Ложные отчёты сравнения           |

---

## 2. `apps/webapp`

### 2.1 Ядро и общие утилиты

| Файл                                                | Назначение                                                                                                                               | Сложн. | Вариант                                                                  | Риски                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `src/infra/db/client.ts`                            | Healthcheck: `select 1` на выделенном клиенте пула.                                                                                      | Н      | **`pg`** или `getDrizzle().execute(sql)`                                 | Низкие                                                              |
| `src/infra/db/runWebappSql.ts`                      | Class B transport: `runWebappPgText`, `runPgPoolPgText` (Drizzle `sql` → `pool.query` / `execute`).                                       | Н      | **Wave 2 P4/P6 + Wave 3 P11:** `runPgPoolPgText` для injected `Pool`   | Канон webapp raw SQL                                                |
| `src/infra/adminAuditLog.ts`                        | Журнал админ-действий: вставка, списки/фильтры, транзакции при дедупликации.                                                             | С      | **Wave 3 P14C done:** `runWebappPgText`; Class C TX `upsertOpenConflictLog` (BEGIN/COMMIT/ROLLBACK) | Комплаенс / расследования                                           |
| `src/infra/userLifecycleLock.ts`                    | Транзакционные `pg_advisory_xact_lock` / shared lock по user id (сериализация жизненного цикла).                                         | С      | **Wave 2 P3 done:** `pgAdvisoryLock.ts`                                    | Дедлоки, гонки lifecycle                                            |
| `src/infra/multipartSessionLock.ts`                 | Advisory lock по id multipart-сессии.                                                                                                    | С      | **Wave 2 P3 done:** `pgAdvisoryLock.ts`                                    | Параллельные загрузки                                               |
| `src/modules/system-settings/configAdapter.ts`      | Dual-read настроек: `SELECT value_json FROM system_settings` (admin scope) с TTL-кэшем.                                                  | Н      | **Wave 3 P11 done:** `runWebappPgText` + Zod (`parseSettingValueJson`) | Кэш/инвалидация уже есть                                            |
| `src/infra/integrator-push/integratorPushOutbox.ts` | Запись и обновление статусов **`public.integrator_push_outbox`** на пуле webapp (`db.query` на `Pool` \| `PoolClient` — **не** в grep `pool.query`); таблица уже в Drizzle-схеме webapp. | **A** | С      | **Wave 3 фаза 15D:** `getDrizzle()` + `insert`/`update` + Zod | Очередь подписанных POST в интегратор, идемпотентность, worker tick |
| `src/infra/idempotency/pgStore.ts`                  | Хранилище идемпотентности API (insert/select).                                                                                           | С      | **Wave 3 P11 done:** `runWebappPgText` + Zod `response_body`           | Двойные побочные эффекты API                                        |

### 2.2 Аутентификация и лимиты

| Файл                                            | Назначение                                                                                                          | Сложн. | Вариант                          | Риски                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------- | ----------------------- |
| `src/modules/auth/channelLink.ts`               | Секреты channel link: выборки, удаления, пометка `used_at`, транзакции claim.                                       | С      | **Wave 2 P7 + Wave 3 P11:** domain `runWebappPgText`; **Class C** `BEGIN`/`COMMIT`/`ROLLBACK` на PoolClient (platform-merge) | Захват чужого линка     |
| `src/infra/repos/pgChannelLinkClaim.ts`         | Классификация «владельца» привязки: множество `SELECT count` по таблицам данных + обновление секретов в транзакции. | С      | **Wave 2 P7 done:** `runWebappPgText` / `getWebappSqlFromPgClient`      | Неверный merge/displace |
| `src/modules/auth/service.ts`                   | Dev bypass: UPDATE `platform_users.phone_normalized` (+ trust для client).                                            | С      | **Wave 2 P7 done:** `pgDevBypassPlatformUserPhone` | Безопасность сессий     |
| `src/modules/auth/channelLinkStartRateLimit.ts` | Rate limit старта channel link.                                                                                     | Н      | **Wave 2 P7 done:** `pgAuthRateLimitEvents`                        | Обход лимита            |
| `src/modules/auth/oauthStartRateLimit.ts`       | Rate limit старта OAuth.                                                                                            | Н      | **Wave 2 P7 done:** `pgAuthRateLimitEvents`                        | Обход лимита            |
| `src/modules/auth/messengerStartRateLimit.ts`   | Rate limit старта мессенджера.                                                                                      | Н      | **Wave 2 P7 done:** `pgAuthRateLimitEvents`                        | Обход лимита            |
| `src/modules/auth/checkPhoneRateLimit.ts`       | Rate limit проверки телефона.                                                                                       | Н      | **Wave 2 P7 done:** `pgAuthRateLimitEvents`                        | Обход лимита            |
| `src/modules/auth/phoneOtpLimits.ts`            | OTP: очистка просроченных блокировок, upsert лимитов.                                                               | С      | **Wave 2 P7 done:** `pgPhoneOtpLimits` + in-memory fallback       | Brute-force окно        |
| `src/modules/auth/emailAuth.ts`                 | Email challenges: delete/update/insert по сценарию challenge.                                                       | С      | **Wave 2 P7 done:** `pgEmailAuth` via port                        | Захват email / lockout  |
| `src/modules/auth/oauthYandexResolve.ts`        | Yandex OAuth: merge/create user, bindings, verified email update.                                                    | С      | **Wave 2 P7 done:** `pgOAuthUserResolve` via port                  | OAuth identity merge    |
| `src/modules/auth/oauthWebLoginResolve.ts`      | Google/Apple web OAuth: аналог Yandex merge path.                                                                   | С      | **Wave 2 P7 done:** `pgOAuthUserResolve` via port                  | OAuth identity merge    |
| `src/infra/repos/pgOAuthUserResolve.ts`         | OAuth user resolve SQL (email merge, create user, bindings, canonical lookup).                                      | С      | **Wave 2 P7 done:** `runWebappPgText` + `pgCanonicalPlatformUser`  | OAuth identity merge    |
| `src/modules/auth/phoneMessengerBindStartRateLimit.ts` | Rate limit phone messenger bind start.                                                                         | Н      | **Wave 2 P7 done:** `pgAuthRateLimitEvents`                        | Обход лимита            |
| `src/modules/public-booking/publicBookingRateLimit.ts` | Rate limit публичного POST booking create (scope `booking.public_create`).                                      | Н      | **Wave 2 P7 done:** `pgAuthRateLimitEvents` via `modules/auth/authRateLimits` | Обход лимита            |

### 2.3 Интегратор (HTTP из webapp)

| Файл                                                      | Назначение                                                                                                                             | Сложн. | Вариант                                                                | Риски                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- | ----------------------------- |
| `src/modules/integrator/messengerPhoneHttpBindExecute.ts` | Привязка телефона через HTTP к интегратору: `db.query` на **отдельном** пуле интегратора + `client.query` в транзакции слияния/аудита. | **A** | В      | **Wave 3 фаза 15E:** Drizzle executor + Zod (не permanent C) | Расхождение двух пулов, merge |

### 2.4 Репозитории `pg*` и медиа

| Файл                                                 | Назначение                                                                                                                                            | Сложн. | Вариант                                                   | Риски                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------- | -------------------------------------------------- |
| `src/infra/repos/pgDoctorBroadcastDelivery.ts`       | Рассылка врача: транзакция `broadcast_audit` + batch `broadcast_audit_recipients` + `INSERT … ON CONFLICT (event_id) DO NOTHING` в `outgoing_delivery_queue` (при `rowCount ≠ 1` — откат). | С      | **Wave 3 P13D done:** Class C TX + `runWebappPgText` / `getWebappSqlFromPgClient`; `(rowCount ?? 0) !== 1` guard | Дубликаты `event_id`, целостность аудита и очереди |
| `src/infra/repos/pgReminderProjection.ts`            | Проекция напоминаний webapp ↔ integrator_user_id.                                                                                                     | С      | **Wave 2 P4 done:** `runWebappSql` + `execute(sql)`; `getPool` только для canonical/warmups lookup | Рассинхрон с интегратором                          |
| `src/infra/repos/pgReminderRules.ts`                 | Правила напоминаний + синхронизация с webapp-правилами в транзакции.                                                                                  | В      | **Wave 2 P4 done:** `runWebappSql` + `runWebappTransaction` | Двойные правила                                    |
| `src/infra/repos/pgReminderJournal.ts`               | Журнал/события напоминаний, snooze, транзакции с несколькими апдейтами.                                                                               | В      | **Wave 2 P4 done:** `runWebappTransaction` + `execute(sql)` | Неверные snooze / доставки                         |
| `src/infra/repos/pgWebPushOnlyReminders.ts`          | Web-push-only cron: planned/queued occurrences, claim `FOR UPDATE SKIP LOCKED`, sent/fail.                                                             | В      | **Wave 2 P4 done:** `runWebappSql` + `runWebappTransaction` | Дубли dispatch, зависшие queued                  |
| `src/infra/repos/pgReminderTransactionalEmailCooldown.ts` | Cooldown transactional email напоминаний (`email_send_cooldowns`, ключ `!reminder_txn_v1`).                                                      | Н      | **Wave 2 P4 done:** Drizzle `select` + `insert` `onConflictDoUpdate` | Спам transactional email                    |
| `src/infra/repos/pgSymptomDiary.ts`                  | Дневник симптомов: выборки, вставки, обновления, удаления, join-агрегаты.                                                                             | В      | `Drizzle` + `+sql` для отчётов                            | Потеря истории симптомов                           |
| `src/infra/repos/pgDoctorClients.ts`                 | Список клиентов врача, привязки, операции с `user_channel_bindings`.                                                                                  | С      | **Wave 3 P13C done:** `runWebappPgText`; `getPool()` только для `resolveCanonicalUserId` | Неверный состав клиентов                           |
| `src/infra/repos/pgDoctorProactiveInsights.ts`       | Proactive insights для doctor today: on-support patients, wellbeing entries, program activity.                                                          | С      | **Wave 3 P13D done:** `runWebappPgText` (5 call sites)    | Ложные/пропущенные сигналы  |
| `src/infra/repos/pgDoctorMotivationQuotesEditor.ts`  | Doctor CMS motivational quotes: list (Drizzle) + write/reorder (`runWebappPgText`; Class C TX on reorder).                                                | С      | **Wave 3 P13D done:** writes in infra port                | Порядок цитат               |
| `src/infra/repos/pgLfkExercises.ts`                  | Каталог упражнений ЛФК: динамические списки/фильтры, регионы, медиа, транзакции create/update.                                                   | В      | **Wave 2 P6 done:** `runWebappPgText` + `runWebappTransaction`; list/usage — `execute(sql)` | CMS ЛФК, производительность списков                |
| `src/infra/repos/pgLfkTemplates.ts`                  | Шаблоны комплексов ЛФК: list-запросы + транзакции правки упражнений шаблона.                                                                  | В      | **Wave 2 P6 done:** `runWebappPgText` + `runWebappTransaction` (`updateExercises`) | Шаблоны врачей                                     |
| `src/infra/repos/pgLfkDiary.ts`                      | Дневник ЛФК-сессий: CRUD, агрегаты по датам, удаление сессий.                                                                                         | С      | **Wave 2 P6 done:** `runWebappPgText`; unit — `pgLfkDiary.test.ts` | Статистика пациента                                |
| `src/infra/repos/pgLfkAssignments.ts`                | Назначения ЛФК пациенту в транзакции.                                                                                                                 | С      | **Wave 2 P6 done:** `runWebappTransaction` + `runWebappPgText`                                            | Назначения пациенту                                |
| `src/infra/repos/pgPatientCalendarTimezone.ts`       | Таймзона календаря пациента.                                                                                                                          | Н      | **Wave 3 P14D done:** `runWebappPgText`                                      | Слоты календаря                                    |
| `src/infra/repos/pgMediaTranscodeJobs.ts`            | Webapp: idempotent **enqueue** транскодинга (`runWebappTransaction` + dup lookup). Claim — `apps/media-worker` (**P8 done**, unit tests).       | С      | **Wave 2 P5 done:** Drizzle + `runWebappTransaction`; dup lookup — `runWebappSql`    | Очередь медиа (enqueue)                            |
| `src/infra/repos/s3MediaStorage.ts`                  | Медиа-файлы: advisory lock по media id, delete/update статусов, транзакции с CMS-метаданными, поиск сиротских файлов.                                 | В      | **Wave 2 P5 done** (advisory P3; DML — Drizzle/`runWebappSql`; TX BEGIN на PoolClient) | Целостность медиа и S3                             |
| `src/infra/repos/mediaFoldersRepo.ts`                | Папки медиа: rename, проверки детей, delete.                                                                                                          | С      | **Wave 2 P5 done:** Drizzle                                                 | Иерархия папок                                     |
| `src/infra/repos/mediaUploadSessionsRepo.ts`         | Сессии загрузки + очистка pending `media_files`.                                                                                                      | С      | **Wave 2 P5 done:** Drizzle + `runWebappSql` + tx на PoolClient            | Зависшие pending                                   |
| `src/infra/repos/mediaPreviewWorker.ts`              | Превью воркер: длинная транзакция обновления статусов превью и связанных таблиц.                                                                      | В      | **Wave 2 P5 done:** `runWebappSql` + tx на PoolClient                       | Превью в каталоге                                  |
| `src/infra/repos/mediaSqlPredicates.ts`              | Shared SQL-предикаты readable/purge для медиа (`sql` fragments, re-export deprecated string constants).                                                 | Н      | **Wave 2 P5 done:** `sql` fragments (не pool.query)                         | Единообразие фильтров статусов                     |
| `src/infra/repos/pgMediaFileIntakeResolve.ts`        | Resolve `media_files` для LFK intake в tx (ownership + readable status).                                                                              | Н      | **Wave 2 P5 done:** `runWebappSql` на `PoolClient`                          | Вложения intake                                    |
| `src/infra/repos/pgMediaUsageSummary.ts`               | Агрегаты usage по `mediaId` (materials/exercises/tests/recommendations).                                                                              | С      | **Wave 2 P5 done:** `runWebappSql`                                          | Ссылки на медиа в CMS                              |
| `src/infra/repos/pgBroadcastAudit.ts`                | Аудит рассылок.                                                                                                                                       | Н      | **Wave 3 P14D done:** `runWebappPgText`                                      | Аудит                                              |
| `src/infra/repos/pgSupportCommunication.ts`          | Поддержка: диалоги, сообщения, служебные проверки `SELECT 1`, статусы.                                                                                | В      | **Wave 3 P14A done:** `runWebappPgText`; Class C TX merge wrapper (3×) | Поддержка пациентов                                |
| `src/infra/repos/mergeLegacySupportConversations.ts` | Legacy merge support threads into canonical conversation (6 SQL steps).                                                                               | С      | **Wave 3 P14A done:** `runWebappPgText` + `getWebappSqlFromPgClient`; verify-only in 14C/14E | Regression-only merge helper                       |
| `src/infra/repos/pgReferences.ts`                    | Справочники reference data: выборки, транзакции reorder, soft-delete.                                                                                 | С      | `Drizzle` + tx                                            | Порядок элементов                                  |
| `src/infra/repos/pgAppointmentProjection.ts`         | Проекция записей на приём (транзакция с несколькими шагами).                                                                                          | С      | **Wave 3 P13B done:** `runWebappPgText`; Class C TX on soft-delete | Запись на приём                                    |
| `src/infra/repos/pgPatientBookings.ts`               | Записи пациента: createPending/list; Rubitime upsert — `@bersoncare/booking-rubitime-sync` (+ revive guard). | С | **Wave 3 P13B done:** port SQL → `runWebappPgText`; Rubitime upsert — `getPool()` → package (P8) | Календарь пациента |
| `src/infra/repos/pgUserProjection.ts`                | Связка webapp user ↔ integrator / platform_users: выборки, insert, merge-апдейты, транзакции.                                                         | В      | **Wave 3 P14B done:** `runWebappPgText`/`txPgText`; Class C TX + SET CONSTRAINTS | Идентичности пользователей                         |
| `src/infra/repos/pgIdentityResolution.ts`            | Разрешение идентичностей по телефону/привязкам.                                                                                                       | С      | **Wave 3 P12B:** `runIdentity*PgText` + Zod rows; Class C TX | Неверный матч пользователя                         |
| `src/infra/repos/pgUserByPhone.ts`                   | Поиск пользователя по телефону и привязкам.                                                                                                           | С      | **Wave 3 P12B:** `runIdentity*PgText` + Zod rows; Class C TX + SET CONSTRAINTS | Логин/чужой аккаунт                                |
| `src/infra/repos/pgPhoneMessengerBind.ts`            | Messenger phone bind secrets + pre-OTP contact apply.                                                                                                 | С      | **Wave 3 P12B:** `runIdentity*PgText` / merge bridge executor; Class C TX in `withTransaction` | OTP/bind race                                      |
| `src/infra/repos/pgMessageLog.ts`                    | Логи сообщений (агрегаты/списки).                                                                                                                     | С      | **Wave 3 P14D done:** `runWebappPgText`; Class B dynamic filters in `buildWhere` | Отчёты доставки                                    |
| `src/infra/repos/pgChannelPreferences.ts`            | Настройки каналов уведомлений.                                                                                                                        | Н      | **Wave 3 P14D done:** `runWebappPgText`; Class C TX on `setPreferredAuthChannel` | Доставка уведомлений                               |
| `src/infra/repos/pgWebPushSubscriptions.ts`        | Web Push подписки пациента (upsert/trim/delete/list).                                                                                                 | С      | **Wave 3 P14D done:** `runWebappPgText`; Class C TX on `saveSubscription`        | Push-доставка                                      |
| `src/infra/repos/pgDoctorAppointments.ts`            | Записи врача (несколько вариантов SQL по режиму).                                                                                                     | С      | **Wave 3 P13B done:** `runWebappPgText`                 | Расписание врача                                   |
| `src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts` | Doctor analytics metric account lists (per-metric SQL).                                                                                               | В      | **Wave 3 P13C done:** `runWebappPgText` (25 call sites) | Parity фильтров/агрегатов                          |
| `src/infra/repos/pgDoctorNotes.ts`                   | Заметки врача по клиенту (list/create).                                                                                                               | Н      | **Wave 3 P13C done:** `runWebappPgText`                 | Карточка клиента                                   |
| `src/infra/repos/pgBranches.ts`                      | Проекция филиалов Rubitime (`branches`).                                                                                                              | Н      | **Wave 3 P13C done:** `runWebappPgText`                 | Каталог бронирования                               |
| `src/app-layer/doctor/createDoctorClient.ts`         | Создание клиента врачом (phone/email conflict, INSERT + phone history TX).                                                                            | С      | **Wave 3 P13C done:** `runWebappPgText`; Class C TX; canonical lookup — `getPool()` | Дубликаты клиентов                                 |
| `src/infra/repos/pgBookingCalendarLegacy.ts`         | Legacy calendar read: range overlap over `appointment_records` + BE dedupe joins.                                                                      | С      | **Wave 3 P13B done:** `runWebappPgText` (1 call site)   | Календарь врача (legacy Rubitime rows)             |
| `src/infra/repos/pgBookingCatalog.ts`                | Каталог филиалов/услуг бронирования: тяжёлые выборки и модификации.                                                                                   | В      | **Wave 3 P13A done:** `runWebappPgText` (37→0 `pool.query`) | Каталог ТЗ и филиалов                              |
| `src/infra/repos/pgPhoneChallengeStore.ts`           | Хранилище phone challenges (insert/select/delete).                                                                                                    | С      | `Drizzle`                                                 | OTP/SMS злоупотребления                            |
| `src/infra/repos/pgUserPins.ts`                      | Закрепления пользователя.                                                                                                                             | Н      | `Drizzle`                                                 | Низкие                                             |
| `src/infra/repos/pgLoginTokens.ts`                   | Токены логина.                                                                                                                                        | С      | `Drizzle`                                                 | Сессии                                             |
| `src/infra/repos/pgMaterialRating.ts`                | Оценки материалов: агрегаты через Drizzle; **doctor detail** — сырой `pool.query`: дневные `COUNT` первых resolve playback по видео-media, группировки `material_ratings` по локальному дню (`timezone`), список оценивших с `LEFT JOIN platform_users`. | С      | `Drizzle` + `+sql` / `execute(sql)` для TZ-агрегатов | Детализация оценок врача, метрики просмотров |
| `src/infra/repos/pgSubscriptionMailingProjection.ts` | Проекция подписок/рассылок.                                                                                                                           | С      | **Wave 3 P14D done:** `runWebappPgText`                                      | Рассылки                                           |
| `src/infra/repos/pgOnlineIntake.ts`                  | Online intake: shared advisory lock по user id + операции заявки.                                                                                     | С      | **Wave 2 P3 + Wave 3 P12A:** lock + `runWebappPgText`; Class C TX (`BEGIN`/`COMMIT`/`ROLLBACK`) | Двойная заявка                                     |
| `src/infra/repos/pgDiaryPurge.ts`                    | Purge данных дневника (advisory + delete).                                                                                                            | С      | **Wave 2 P3 + Wave 3 P11:** lifecycle lock + `runWebappPgText` на `PoolClient` | Удаление не тех данных                             |
| `src/infra/repos/pgSystemSettings.ts`                | Системные настройки (транзакционные обновления при определённых сценариях).                                                                           | С      | `Drizzle` + sync в integrator по канону                   | Рассинхрон настроек                                |
| `src/infra/repos/pgClinicalTests.ts`                 | Клинические тесты: Drizzle для основной модели + usage summary.                                                            | С      | **Wave 3 P11 done:** usage `runPgPoolPgText`                           | Отчёты использования тестов                        |
| `src/infra/repos/pgTestSets.ts`                      | Наборы тестов / связка с клиническими тестами (usage summary).                                                                            | С      | **Wave 3 P11 done:** `runPgPoolPgText`                                        | Каталог тестов                                     |
| `src/infra/repos/pgRecommendations.ts`               | Рекомендации: usage summary.                                                                                                | С      | **Wave 3 P11 done:** `runPgPoolPgText`                                        | Каталог рекомендаций                               |
| `src/infra/repos/pgCourses.ts`                       | Курсы: usage summary.                                                                                                       | С      | **Wave 3 P11 done:** `runPgPoolPgText`                                        | Каталог курсов                                     |
| `src/infra/repos/pgAdminPlatformUserStats.ts`        | Admin KPI: регистрации/merge/subscriber bindings (6× parallel counts).                                                      | С      | **Wave 3 P11 done:** `runPgPoolPgText`                                        | Аналитика admin                                    |
| `src/infra/repos/pgPatientBroadcasts.ts`           | Patient broadcast view: join `broadcast_audit` + recipients.                                                                | Н      | **Wave 3 P11 done:** `runPgPoolPgText`                                        | Рассылки пациенту                                  |
| `src/infra/repos/pgRubitimeMapping.ts`               | Rubitime mapping list: Drizzle catalog + legacy `booking_branch_services` load.                                             | С      | **Wave 3 P11 done:** legacy load → `runPgPoolPgText`; rest Drizzle            | Каталог Rubitime                                   |
| `src/infra/repos/loadPlatformUserChannelBindings.ts` | Канонические messenger bindings для fan-out.                                                                                | Н      | **Wave 3 P11 done:** `runWebappPgText`                                        | Доставка M2M                                       |
| `src/infra/mergeAuditLabels.ts`                      | Merge audit: display_name двух platform users.                                                                              | Н      | **Wave 3 P11 done:** `runPgPoolPgText`                                        | Аудит merge                                        |
| `src/infra/manualMergeIntegratorGate.ts`             | Manual merge gate: integrator_user_id pair lookup.                                                                           | Н      | **Wave 3 P11 done:** `runPgPoolPgText`                                        | Merge v2 gate                                      |
| `src/infra/platformUserNameMatchHints.ts`            | Admin name-overlap hints (ordered groups + swapped pairs).                                                                  | С      | **Wave 3 P11 done:** 2× `runPgPoolPgText`                                     | Admin dedup hints                                  |
| `src/infra/mergePreviewIntegratorUserPresence.ts`    | Merge preview: `integrator.users` row existence check.                                                                      | Н      | **Wave 3 P11 done:** `runPgPoolPgText` (`integrator.users`)                   | Phantom integrator id                              |
| `src/modules/reminders/loadWarmupsSectionSlugs.ts`   | Slugs CMS warmups cluster для reminder projection lookup.                                                                    | Н      | **Wave 3 P11 done:** `runPgPoolPgText`                                        | Reminder projection                                |
| `src/modules/reminders/disableReminderMessengerTopic.ts` | Integrator-signed disable messenger topic prefs (occurrence + bindings).                                                | С      | **Wave 3 P11 done:** 2× `runPgPoolPgText`                                     | Reminder opt-out                                   |
| `src/infra/platformUserPurgeSql.ts`                  | Class B transport: `runPurgePoolPgText` / `runPurgeClientPgText` для purge domain SQL.                                                                  | —      | **Wave 3 P12D done:** thin executor wrapper                                     | Канон purge SQL                                    |
| `src/infra/platformUserFullPurge.ts`                 | Полное удаление данных пользователя (каскады DELETE/UPDATE по множеству таблиц).                                                                      | В      | **Wave 3 P12D done:** `runPurgeClientPgText` / `runPurgePoolPgText`; Class C integrator TX (3×) | GDPR / потеря данных                               |
| `src/infra/platformUserMergePreview.ts`              | Manual merge preview (read-only SELECT/COUNT).                                                                                                        | В      | **Wave 3 P12D done:** `runPgPoolPgText`                                       | Merge preview contract                             |
| `src/infra/strictPlatformUserPurge.ts`               | Строгий purge: delete медиа, advisory lock.                                                                                                           | В      | **Wave 3 P12D verified:** Class C TX (3×); load/post-commit → `runPgPoolPgText` (P11) | Медиа / блокировки                                 |

### 2.5 App routes / server actions

| Файл                                                    | Назначение                                                                                   | Сложн. | Вариант                                            | Риски                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------- | --------------------------- |
| `src/app/app/doctor/content/motivation/actions.ts`      | CMS мотивационных цитат: thin server actions → `doctorMotivationQuotesEditor` port (SQL в `pgDoctorMotivationQuotesEditor`).         | С      | **Wave 3 P13D done:** no direct SQL in actions           | Порядок цитат               |
| `src/app/api/internal/media-multipart/cleanup/route.ts` | Удаление pending `media_files` при очистке multipart.                                        | Н      | **Wave 2 P5 done:** repo `lockExpiredSessionForCleanupTx` / `deletePendingMediaFileTx` | Зависшие файлы              |
| `src/app/api/media/multipart/init/route.ts`             | При ошибке инициализации multipart — rollback pending через `deletePendingMediaFileById`. | Н      | **Wave 2 P5 done**                         | Утечки pending              |
| `src/app/api/doctor/clients/integrator-merge/route.ts`  | Thin route → `executeIntegratorPlatformUserMerge`.                                              | В      | **Wave 3 P12C done:** SQL в `integratorPlatformUserMerge.ts` | Клинические данные клиентов |
| `src/infra/integratorPlatformUserMerge.ts`              | Integrator M2M merge + precheck TX; domain SQL via `runIdentityClientPgText`; Class C TX.       | В      | **Wave 3 P12C done**                               | Клинические данные клиентов |

### 2.6 App-layer (health / media)

| Файл                                                   | Назначение                                                 | Сложн. | Вариант                  | Риски        |
| ------------------------------------------------------ | ---------------------------------------------------------- | ------ | ------------------------ | ------------ |
| `src/app-layer/health/collectAdminSystemHealthData.ts` | Админ health: агрегаты по превью медиа и зависшим pending. | С      | **Wave 3 P11 done:** preview probe → `runWebappPgText` | Мониторинг   |
| `src/app-layer/media/adminTranscodeHealthMetrics.ts`   | Метрики здоровья транскодинга.                             | С      | **Wave 3 P11 done:** legacy counts → `runWebappPgText`; rest Drizzle | Алерты медиа |
| `src/app-layer/media/videoHlsLegacyBackfill.ts`        | Legacy HLS backfill: выборки/агрегаты по `media_files`.    | С      | **Wave 3 P11 done:** `runPgPoolPgText` on injected pool | HLS legacy   |
| `src/app-layer/platform-user/resolveOrCreateUserByPhone.ts` | Public booking: INSERT client by phone.                | Н      | **Wave 3 P12E done:** `runPgPoolPgText`               | User bootstrap |
| `src/app-layer/platform-user/recordPublicBookingMergeCandidates.ts` | Merge candidate lookup by display_name.          | Н      | **Wave 3 P12E done:** `runPgPoolPgText`               | Merge hints    |

### 2.7 Скрипты `apps/webapp/scripts` (+ integrator)

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `run-migrations.mjs` | SQL migration runner | Н | **Wave 2 P8:** `pg` | Низкие |
| `run-webapp-drizzle-migrate.mjs` | drizzle-kit migrate wrapper | Н | **Wave 2 P8:** ops | Низкие |
| `seed-drizzle-migrations-meta.mjs` | bootstrap drizzle meta | Н | **Wave 2 P8:** `pg` ops | Низкие |
| `verify-drizzle-public-table-count.mjs` | row-count audit | Н | **Wave 2 P8:** `pg` report | Низкие |
| `fix-drizzle-introspect-defaults.mjs` | one-off DDL meta fix | Н | **Wave 2 P8:** `pg` ops | Низкие |
| `check-drizzle-journal-sync.sh` | shell guard | Н | **Wave 2 P8:** ops (no SQL) | Низкие |
| `check-legacy-migrations-frozen.sh` | shell guard | Н | **Wave 2 P8:** ops | Низкие |
| `check-catalog-shared-primitives.sh` | shell guard | Н | **Wave 2 P8:** ops | Низкие |
| `check-media-preview-invariants.sh` | shell guard | Н | **Wave 2 P8:** ops | Низкие |
| `reconcile-person-domain.mjs` | person-domain reconcile | С | **Wave 2 P8:** `pg` batch | Data repair |
| `reconcile-appointments-domain.mjs` | appointments reconcile | С | **Wave 2 P8:** `pg` batch | Data repair |
| `reconcile-reminders-domain.mjs` | reminders reconcile | С | **Wave 2 P8:** `pg` batch | Data repair |
| `reconcile-communication-domain.mjs` | communication reconcile | С | **Wave 2 P8:** `pg` batch | Data repair |
| `reconcile-subscription-mailing-domain.mjs` | subscription reconcile | С | **Wave 2 P8:** `pg` batch | Data repair |
| `backfill-person-domain.mjs` | person backfill | С | **Wave 2 P8:** `pg` batch | Data repair |
| `backfill-appointments-domain.mjs` | appointments backfill | С | **Wave 2 P8:** `pg` batch | Data repair |
| `backfill-reminders-domain.mjs` | reminders backfill | С | **Wave 2 P8:** `pg` batch | Data repair |
| `backfill-subscription-mailing-domain.mjs` | subscription backfill | С | **Wave 2 P8:** `pg` batch | Data repair |
| `backfill-communication-history.mjs` | communication backfill | С | **Wave 2 P8:** `pg` batch | History |
| `backfill-rubitime-history-to-patient-bookings.ts` | Rubitime history → bookings | С | **Wave 2 P8:** `pg` batch | History |
| `backfill-rubitime-compat-snapshots.ts` | compat snapshots + catalog lookup | С | **Wave 2 P8 done:** `pg` batch; lookup → `@bersoncare/booking-rubitime-sync` | Compat |
| `backfill-patient-bookings-v2.ts` | patient_bookings v2 backfill | С | **Wave 2 P8:** `pg` batch | Bookings |
| `video-hls-backfill-legacy.ts` | legacy HLS backfill | С | **Wave 2 P8:** `pg` batch | HLS legacy |
| `requeue-projection-outbox-dead.ts` | outbox dead requeue | С | **Wave 2 P8:** `pg` ops | Outbox |
| `realign-webapp-integrator-user-projection.ts` | user projection realign | С | **Wave 2 P8:** `pg` ops | Projection |
| `seed-content-pages.mjs` | content pages seed | Н | **Wave 2 P8:** `pg` seed | Content |
| `seed-booking-catalog-tochka-zdorovya.ts` | booking catalog seed | С | **Wave 2 P8:** `pg` seed | Catalog |
| `user-phone-admin.ts` | admin phone/merge CLI | В | **Wave 2 P8:** `pg` + services | Ops danger |
| `integrator-push-outbox-tick.ts` | outbox tick | С | **Wave 2 P8:** runtime tick | Delivery |
| `media-preview-process-tick.ts` | preview worker tick | С | **Wave 2 P8:** runtime tick | Media |
| `audit-platform-user-merge.sql` | merge audit SQL | Н | **Wave 2 P8:** manual psql | Ops |
| `audit-platform-user-preflight.sql` | merge preflight SQL | Н | **Wave 2 P8:** manual psql | Ops |
| `repair-client-8077942.sql` | one-off client repair | Н | **Wave 2 P8:** manual psql | Ops |
| `rubitime-appointment-mapping-audit.sql` | mapping audit | Н | **Wave 2 P8:** manual psql | Report |
| `backfill-rubitime-appointment-mappings.sql` | mapping backfill | С | **Wave 2 P8:** manual psql | Ops |
| `stage13-gate.test.ts` | script gate tests | Н | **Wave 2 P8:** test only | — |
| `stage13-preflight.test.ts` | script preflight tests | Н | **Wave 2 P8:** test only | — |
| `backfill-person-domain.test.ts` | backfill script tests | Н | **Wave 2 P8:** test only | — |
| `apps/integrator/scripts/projection-health.mjs` | projection health CLI | С | **Wave 2 P2+P8:** thin wrapper → core | Metrics |

### 2.8 Тесты

| Файл                                                            | Назначение                                                   | Сложн. | Вариант          | Риски              |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ------ | ---------------- | ------------------ |
| `src/infra/repos/pgPlatformUserMerge.devDb.integration.test.ts` | Интеграционная очистка тестовых данных через `client.query`. | Н      | **`pg`** в тесте | Только тестовая БД |
| `src/infra/repos/pgOnlineIntake.devDb.integration.test.ts` | Opt-in read-only intake list/get smoke (`RUN_ONLINE_INTAKE_DEV_DB=1`). | Н | **`pg`** в тесте | Только dev DB |
| `src/infra/platformUserFullPurge.devDb.integration.test.ts` | Opt-in read-only purge row load (`RUN_PURGE_DEV_DB=1`). | Н | **`pg`** в тесте | Только dev DB |
| `src/infra/platformUserMergePreview.devDb.integration.test.ts` | Opt-in read-only merge preview/search smoke (`RUN_MERGE_PREVIEW_DEV_DB=1`). | Н | **`pg`** в тесте | Только dev DB |

---

## 3. `apps/media-worker`

| Файл                         | Назначение                                                                                                     | Сложн. | Вариант                                                                                  | Риски                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/runMediaWorkerSql.ts` | Class B transport: Drizzle `sql` → `pool.query` (**1** call). | **B** | Н | ADR: minimal executor без shared schema | — |
| `src/processTranscodeJob.ts` | Статусы медиа и джобов post-claim. | **B** | С | **Wave 3 фаза 10 done:** `runMediaWorkerPgText` | Рассинхрон с webapp при расхождении DDL |
| `src/processProgramSubmissionTranscode.ts` | Статусы program submission transcode. | **B** | С | **Wave 3 фаза 10 done:** `runMediaWorkerPgText` | Двойной claim / статусы |
| `src/watermarkEnabled.ts` | Чтение `public.system_settings` watermark flag. | **B** | Н | **Wave 3 фаза 10 done:** `runMediaWorkerPgText` + Zod | Неверный watermark |
| `src/pipelineEnabled.ts` | Чтение `public.system_settings` pipeline flag. | **B** | Н | **Wave 3 фаза 10 done:** `runMediaWorkerPgText` + Zod | Неверный pipeline gate |
| `src/jobs/claim.ts`          | Claim транскодинг-джоба в транзакции (**8** `pool.query`, `FOR UPDATE SKIP LOCKED` + update).                                      | **C** | В      | **ADR permanent:** pg на dedicated session; unit `claim.test.ts` (**4 tests**) | Двойной claim                                              |

---

## 4. Пакеты `packages/`

| Файл                                                            | Назначение                                                                                                               | Сложн. | Вариант                                    | Риски                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------ | --------------------------------- |
| `platform-merge/src/pgPlatformUserMerge.ts`                     | Крупная процедура слияния платформенных пользователей: блокировки, перенос строк по десяткам таблиц, очистка дубликатов. | **C** | В      | **ADR permanent:** merge engine; **79** `.query(`; Drizzle builder rewrite out of scope | Критичные пользовательские данные |
| `platform-merge/src/messengerPhonePublicBind.ts`                | Публичная привязка телефона мессенджера: realign/update через `db.query` (pg).                                           | **C** | С      | **ADR permanent** (consumer package); **2** `.query(` | Зависимости пакета                |
| `platform-merge/src/mergeContactFallback.ts`                    | Fallback merge contact path.                                                                                              | **C** | С      | **ADR permanent**; **4** `.query(` | Merge regressions |
| `booking-rubitime-sync/src/upsertPatientBookingFromRubitime.ts` | Upsert/delete `public.patient_bookings` при синке из Rubitime.                                                           | **C** | С      | **ADR permanent:** `SqlExecutor` + pg text; **4** `.query(`; canonical Rubitime fields unchanged | Записи пациента                   |
| `booking-rubitime-sync/src/lookupBranchServiceByRubitimeIds.ts` | Catalog lookup `booking_branch_services` по Rubitime ids.                                                                | С      | **Wave 2 P8 done:** pg в пакете (удалён webapp дубль) | compat_quality / branch_service_id |
| `booking-rubitime-sync/src/shouldSkipNativeReviveUpdate.ts` | Revive guard: skip Rubitime upsert on terminal native/canonical rows. | С | **Wave 2 P8 done:** pg lookup `be_appointments`; webapp + integrator | Erroneous revive |

---

## 5. Как читать этот отчёт дальше

1. **Мастер-план (P1–P4 integrator repos):** закрыт — см. [LOG.md](./LOG.md) § «Закрытие инициативы».
2. **Wave 2 (волна после мастера):** этапы **1–8** закрыты ([plans/README.md](./plans/README.md)); **мелкие repos/config** с `db.query` — **Wave 3 фаза 09** (§1.2, Class **A**).
3. **Wave 3 (2026-06-06):** baseline Class A/B/C — § «Wave 3 baseline»; индекс фаз [`plans/wave3_INDEX.md`](./plans/wave3_INDEX.md); решения [`plans/wave3_DECISIONS.md`](./plans/wave3_DECISIONS.md). **media-worker** post-claim SQL — **фаза 10 done** (Class B); **Webapp** closeout — фазы **11–15** (**78** prod-файлов `pool|client.query`); **integrator schema reduction** — фаза **08**; conditional **`migrate:legacy` cutover** — фаза **16**.
4. **Webapp:** перенос через **`src/infra/repos`** + module ports (`buildAppDeps` / `bindAuthModulePorts`). Reminder repos — **P4 done**; медиа — **P5 done**; LFK `pgLfk*` — **P6 done**; auth/rate limits §2.2 — **P7 done** (2026-06-05).
5. **Поиск в коде:** `rg "pool\\.query\\(|client\\.query\\(" apps packages` и `rg "\\bdb\\.query\\(" apps/integrator` — в `apps/integrator` экспорт `db` из `client.ts` это **`pg.Pool`**, не Drizzle relational `db.query` из webapp. `migrate.ts` и оболочка `client.ts` для TX — **не** цель «весь SQL в Drizzle builder».

_Примечание:_ при добавлении файлов этот документ стоит обновлять или регенерировать по тем же запросам `rg`, чтобы не расходиться с кодом.

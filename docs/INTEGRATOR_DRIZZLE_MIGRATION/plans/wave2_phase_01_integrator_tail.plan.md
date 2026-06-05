---
name: Wave2 Phase01 Integrator tail SQL
overview: "Wave 2 I: перевести ядро integrator tail (очередь доставки, bookingProfilesRepo, settings sync, audit/attempts, worker SQL) на runIntegratorSql; мелкие repos/config reads — отдельный backlog (см. Закрытие)."
status: completed
isProject: false
todos:
  - id: p01-inventory-scope
    content: "Сверить scope с [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md) §1.2–1.3; зафиксировать список файлов этапа: outgoingDeliveryQueue, bookingProfilesRepo, messengerPhoneBindAudit, platformUserDeliveryPhone, patientHomeMorningPing repo/handler, idempotencyKeys, adminStats, linkedPhoneSource, resolvePlatformUserIdForRubitimeBooking, canonicalUserId, integrationDataQualityIncidents, settings/config reads и outgoingDeliveryWorker; не расширять на P4-репо без причины."
    status: completed
  - id: p01-outgoing-delivery
    content: "outgoingDeliveryQueue.ts: Drizzle insert/update/reschedule/mark*; claim CTE+SKIP LOCKED — либо оставить execute(sql), либо перенос только с EXPLAIN+тестом конкуренции; обновить/добавить unit-тесты порта."
    status: completed
  - id: p01-booking-profiles
    content: "bookingProfilesRepo.ts: поэтапно заменить db.query на getIntegratorDrizzleSession + builder/+sql поверх текущих integrator.rubitime_*; cutover на public.booking_* и дедуп rubitime_* НЕ входят в этап."
    status: completed
  - id: p01-small-repos
    content: "Мелкие repos/config reads — полный перенос вынесен из фактического scope закрытия; см. todo p01-small-repos-backlog и Закрытие."
    status: cancelled
  - id: p01-small-repos-backlog
    content: "Backlog (не блокирует закрытие этапа): platformUserDeliveryPhone, canonicalUserId, linkedPhoneSource, resolvePlatformUserIdForRubitimeBooking, patientHomeMorningPing, idempotencyKeys, adminStats, integrationDataQualityIncidents, branchTimezone, adminIncidentAlertRelay, smtpOutbound, messengerStaffIds, operationalVerboseLog — остаются db.query; перенос при касании или отдельный под-этап Wave 2+."
    status: cancelled
  - id: p01-settings-sync-route
    content: "settingsSyncRoute.ts: insert onConflict через Drizzle; HTTP sync и зеркало integrator.system_settings сохраняются, проверяются инвалидации кэшей и правила system-settings-integrator-mirror."
    status: completed
  - id: p01-verify
    content: "pnpm --dir apps/integrator run typecheck && pnpm --dir apps/integrator run test; точечный rg на оставшийся db.query в зоне этапа."
    status: completed
---

# Wave 2 — этап 1: хвост интегратора (сырой SQL → Drizzle)

## Размер и приоритет

**M / L** (высокий риск у `bookingProfilesRepo` и очередей). Первый этап волны Wave 2 по [DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md).

## Definition of Done

- [x] **Фактический scope (ядро):** `outgoingDeliveryQueue`, `outgoingDeliveryWorker` (точечный SQL), `bookingProfilesRepo`, `settingsSyncRoute`, `messengerPhoneBindAudit`, `notificationDeliveryAttempts` — без строкового `DbPort.query` в доменной логике; claim — `runIntegratorSql` + `execute(sql)`.
- [x] Остатки `db.query` в мелких repos/config (см. backlog) задокументированы в LOG и [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md), не помечены как «сделано».
- [x] `pnpm --dir apps/integrator run typecheck` и `pnpm --dir apps/integrator run test` зелёные.
- [x] В [LOG.md](../LOG.md) кратко зафиксирован итог этапа и backlog мелких repos.

## Scope

**Разрешено:** `apps/integrator/src/infra/db/repos/*`, `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts`, схемы в `apps/integrator/src/infra/db/schema/*`, тесты рядом с репозиториями.

**Вне scope:** webapp, `packages/*`, смена корневого CI, изменение контракта `DbPort` без отдельной задачи.

**Решение:** этап 1 — только Drizzle-эквивалент текущей модели. Не делать дедуп `integrator.rubitime_*`, не переводить `bookingProfilesRepo` на `public.booking_*`, не удалять HTTP sync настроек и зеркало `integrator.system_settings`.

## Декомпозиция исполнения

### 1. Инвентаризация и stop-list

- [x] Выполнить `rg "await db\\.query\\(|\\.query\\(" apps/integrator/src/infra/db/repos apps/integrator/src/integrations apps/integrator/src/config apps/integrator/src/infra/runtime --glob "*.ts"` и сверить результат с `RAW_SQL_INVENTORY.md` §1.2–1.3.
- [x] Разделить найденные места на группы: `queue`, `bookingProfiles`, `small repos`, `settings/config`, `worker`, `out-of-scope`.
- [x] В LOG перед кодом зафиксировать, что `migrate.ts`, `client.ts`, one-off scripts и дедуп `rubitime_*` не входят в этап.

### 2. Схема и shared helpers

- [x] Проверить, что нужные таблицы уже зарегистрированы в `integratorDrizzleSchema`; при добавлении новых локальных таблиц сверить имена/колонки с фактическим DDL.
- [x] Для `public.*` чтений из integrator использовать явную схему/qualified table в Drizzle или `sql` fragment; не полагаться на `search_path`.
- [x] Для динамических запросов завести whitelist идентификаторов рядом с репозиторием и тест на отклонение неизвестного ключа.

### 3. `outgoingDeliveryQueue.ts`

- [x] Перевести idempotent enqueue на Drizzle `insert` + conflict policy без изменения idempotency key.
- [x] Перевести reset stale / mark sent / mark dead / reschedule на Drizzle `update`; сохранить условия статуса и `attempt`/`next_try_at`.
- [x] Claim с `FOR UPDATE SKIP LOCKED` оставить как `execute(sql)` на текущей Drizzle-сессии, если builder-вариант не даёт очевидной эквивалентности.
- [x] Тесты: idempotent insert, claim SQL содержит `FOR UPDATE SKIP LOCKED`, reschedule не трогает не-`processing`, final statuses не переоткрываются.

### 4. `outgoingDeliveryWorker.ts`

- [x] Перевести только SQL-чтения/апдейты из inventory, не менять `dispatchOutgoing` и retry policy.
- [x] Проверить ветки `reminder_dispatch`, `operator_*`, `doctor_broadcast_intent` и `attachMenu`.
- [x] Тесты: broadcast `sent_count`/`error_count`, dead-finalization, attach-menu enrichment остаются прежними.

### 5. `bookingProfilesRepo.ts`

- [x] Сначала простые lookup/select по id/external ids.
- [x] Затем upsert/delete связей и snapshot payloads; JSON поля сохраняют прежнюю форму.
- [x] Сложные выборки оставить через `sql` fragment, если builder резко ухудшает читаемость.
- [x] Запрещено в этом этапе переводить источник истины на `public.booking_*`; все legacy `integrator.rubitime_*` остаются как есть.
- [x] Тесты: `resolveBookingProfile`, `pickAnyActiveRubitimeScheduleTriple`, upsert/delete mapping, отсутствие silent fallback при дубликатах.

### 6. Small repos / config reads

- [x] `messengerPhoneBindAudit.ts`: `runIntegratorSql` upsert/increment внутри переданной tx.
- [x] **Backlog зафиксирован (вне фактического закрытия этапа):** `platformUserDeliveryPhone`, `canonicalUserId`, `linkedPhoneSource`, `resolvePlatformUserIdForRubitimeBooking`, `patientHomeMorningPing` (+ handler), `idempotencyKeys`, `adminStats`, `integrationDataQualityIncidents`, `branchTimezone`, `adminIncidentAlertRelay`, `smtpOutbound`, `messengerStaffIds`, `operationalVerboseLog` оставлены на `db.query`; см. LOG § Wave 2 этап 1 backlog.

### 7. `settingsSyncRoute.ts`

- [x] Заменить raw `INSERT ... ON CONFLICT` на Drizzle `insert().onConflictDoUpdate`.
- [x] Сохранить `(key, scope)`, `value_json`, `updated_by`, timestamps и поведение при невалидной подписи.
- [x] Сохранить cache invalidation для `app_base_url`, timezone, Google/runtime flags и verbose logging.
- [x] Не добавлять второй sync-вызов в webapp route handlers.

### 8. Закрытие этапа

- [x] `rg "await db\\.query\\(|pool\\.query|client\\.query" apps/integrator/src/infra/db/repos apps/integrator/src/integrations apps/integrator/src/config apps/integrator/src/infra/runtime --glob "*.ts"` — все остатки в зоне этапа объяснены в LOG.
- [x] `pnpm --dir apps/integrator run typecheck`
- [x] `pnpm --dir apps/integrator run test`
- [x] Обновить `LOG.md`, frontmatter todos/status и DoD.

## Решения по сложным местам

- `bookingProfilesRepo.ts`: переводить только текущие `integrator.rubitime_*`; все идеи дедупа записывать в LOG/backlog, кодом не начинать.
- `outgoingDeliveryQueue.ts`: claim остаётся `execute(sql)` с `FOR UPDATE SKIP LOCKED`, пока нет отдельного concurrency-теста на builder-вариант.
- `settingsSyncRoute.ts`: зеркало `integrator.system_settings` и HTTP sync сохраняются; upsert меняется на Drizzle, cache invalidation остаётся прежней.
- Config reads: сохранять существующий DB+env fallback per field; пустая/частичная БД не должна перекрывать рабочий env.

## Stop conditions

- Если для `bookingProfilesRepo.ts` требуется читать `public.booking_*`, остановиться и оформить отдельный дедуп/cutover план.
- Если claim очереди требует изменения индекса, порядка сортировки или статусов, остановиться и вынести в queue-hardening план.
- Если settings sync хочется удалить из-за unified DB, остановиться: это не scope этапа 1.

## Закрытие (2026-06-05)

- **Сделано:** `outgoingDeliveryQueue`, `outgoingDeliveryWorker`, `bookingProfilesRepo`, `settingsSyncRoute`, `messengerPhoneBindAudit`, `notificationDeliveryAttempts` → `runIntegratorSql` / `execute(sql)`.
- **Backlog:** мелкие repos и config reads из §6 (см. todo `p01-small-repos-backlog`) — остаются на `db.query`.
- **Тесты:** `outgoingDeliveryQueue.test.ts`, `bookingProfilesRepo.test.ts`, обновления worker/settings/attempts — **1016 passed** (integrator test на дату закрытия).
- **Проверки:** `pnpm --dir apps/integrator run typecheck` && `pnpm --dir apps/integrator run test`; `rg` по ядру scope — без необъяснённого `db.query` в переведённых файлах.
- **Документация:** [LOG.md](../LOG.md) § Wave 2 этап 1; [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md) — **Wave 2 P1 done** для переведённых строк.

## Лог выполнения

Вести кратко в [../LOG.md](../LOG.md) под датой выполнения (решения, что не делали, ссылки на PR).

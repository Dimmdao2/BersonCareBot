---
name: Integrator Drizzle — этап 1 (простые репозитории)
status: completed
overview: >-
  Перевод P1-репозиториев (подписки, топики, маппинг календаря, mailing_logs,
  delivery_attempt_logs через repos/messageLogs.ts) с DbPort-SQL на Drizzle
  после расширения integrator Drizzle-схемы.
todos:
  - id: p1-schema-tables
    content: >-
      Зарегистрировать в integrator Drizzle: user_subscriptions, mailing_topics,
      booking_calendar_map, mailing_logs, delivery_attempt_logs (+ индексы/CHECK
      как в webapp schema.ts); согласовано с мастер-планом schema-strategy.
    status: completed
  - id: p1-subscriptions
    content: >-
      Переписать apps/integrator/src/infra/db/repos/subscriptions.ts на Drizzle;
      сигнатуры getUserSubscriptions, upsertUserSubscription, toggleUserSubscription.
    status: completed
  - id: p1-topics
    content: Переписать apps/integrator/src/infra/db/repos/topics.ts на Drizzle.
    status: completed
  - id: p1-booking-calendar-map
    content: Переписать apps/integrator/src/infra/db/repos/bookingCalendarMap.ts на Drizzle.
    status: completed
  - id: p1-mailing-logs
    content: Переписать apps/integrator/src/infra/db/repos/mailingLogs.ts на Drizzle.
    status: completed
  - id: p1-message-logs
    content: >-
      Переписать apps/integrator/src/infra/db/repos/messageLogs.ts на Drizzle
      (таблица delivery_attempt_logs).
    status: completed
  - id: p1-verify
    content: >-
      Прогон apps/integrator typecheck + test; запись в
      docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md.
    status: completed
isProject: false
---

# Этап 1: простые изолированные репозитории (P1)

## Связь с мастер-планом

Родитель: [integrator_drizzle_migration_master.plan.md](integrator_drizzle_migration_master.plan.md). После этого этапа переходите к [этапу 2](integrator_drizzle_phase_2_outbox_job_queue.plan.md).

## Scope

**Разрешено:** файлы ниже + расширение [`apps/integrator/src/infra/db/drizzle.ts`](../../apps/integrator/src/infra/db/drizzle.ts) + новый код схемы в выбранном месте (см. мастер) + связанные `*.test.ts`.

- [`subscriptions.ts`](../../apps/integrator/src/infra/db/repos/subscriptions.ts)
- [`topics.ts`](../../apps/integrator/src/infra/db/repos/topics.ts)
- [`bookingCalendarMap.ts`](../../apps/integrator/src/infra/db/repos/bookingCalendarMap.ts)
- [`mailingLogs.ts`](../../apps/integrator/src/infra/db/repos/mailingLogs.ts)
- [`messageLogs.ts`](../../apps/integrator/src/infra/db/repos/messageLogs.ts) → БД `delivery_attempt_logs`

**Вне scope:** `projectionOutbox`, `jobQueue`, любые репозитории вне списка.

**Исторически вне этапа 1:** merge пользователей — [`mergeIntegratorUsers.ts`](../../apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts) — перенос на **`runIntegratorSql`** выполнен в **этапе 4** мастер-плана (см. [`docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`](../../docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md)).

## Порядок работ (обязательный)

Примите порядок **subscriptions → topics → bookingCalendarMap → mailingLogs → messageLogs**, чтобы первые три файла закрепили паттерн до логирования.

## Шаги с чек-листами

### 1. Схема Drizzle

- [x] Сверить физические имена таблиц и колонок с [`apps/webapp/db/schema/schema.ts`](../../apps/webapp/db/schema/schema.ts) и/или dump integrator DDL (`docs/ARCHITECTURE/DB_DUMPS/` при необходимости).
- [x] Добавить таблицы в регистрируемый schema-object для [`getIntegratorDrizzle()`](../../apps/integrator/src/infra/db/drizzle.ts).
- [x] Проверка второго канала записи (`rg` по `user_subscriptions`, `booking_calendar_map`, `mailing_logs`, `delivery_attempt_logs`): кроме merge в **этапе 4** (`mergeIntegratorUsers`) — отдельный канал не вводился.

### 2. Пер-компонентный перевод

Для каждого файла:

- [x] Сохранить публичные типы экспортов и читаемость JSON/jsonb через те же доменные поля.
- [x] `ON CONFLICT`, `RETURNING`, фильтры — эквивалентны старому SQL (сравнить план выполнения не обязательно, но одинаковые предикаты и порядок сортировок при `LIMIT`).
- [x] Не смешивать в одном PR не связанный рефакторинг.

### 3. Закрытие этапа

- [x] `pnpm --dir apps/integrator run typecheck`
- [x] `pnpm --dir apps/integrator run test` (или узкий поднабор `--run path/to/file` при итерациях между правками; перед merge этапа — полный интеграторский test как в процессе команды).
- [x] Запись в [`docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`](../../docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md): что переведено, какие таблицы в schema.

## Definition of Done (этап 1)

- [x] Все пять файлов не используют для доменной логики **`db.query(...)`** со строковым SQL (Drizzle API и/или **`runIntegratorSql`** + **`sql`…``**).
- [x] Поведение API репозиториев сохранено; существующие тесты зелёные.
- [x] Мастер-план todo `phase-1` можно пометить `completed`.

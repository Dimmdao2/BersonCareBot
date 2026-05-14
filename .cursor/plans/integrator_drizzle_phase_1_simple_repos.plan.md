---
name: Integrator Drizzle — этап 1 (простые репозитории)
overview: Перевод P1-репозиториев (подписки, топики, маппинг календаря, логи рассылок/сообщений) с DbPort-SQL на Drizzle после расширения integrator Drizzle-схемы — быстрые победы и выработка паттерна для следующих этапов.
todos:
  - id: p1-schema-tables
    content: Зарегистрировать в integrator Drizzle таблицы для user_subscriptions, mailing_topics/topics, booking calendar map (уточнить физические имена по schema.ts или DDL), mailing_logs, message_logs — согласовать с решением из мастер-плана
    status: pending
  - id: p1-subscriptions
    content: Переписать apps/integrator/src/infra/db/repos/subscriptions.ts на Drizzle; сохранить сигнатуры getUserSubscriptions, upsertUserSubscription, toggleUserSubscription
    status: pending
  - id: p1-topics
    content: Переписать apps/integrator/src/infra/db/repos/topics.ts на Drizzle
    status: pending
  - id: p1-booking-calendar-map
    content: Переписать apps/integrator/src/infra/db/repos/bookingCalendarMap.ts на Drizzle
    status: pending
  - id: p1-mailing-logs
    content: Переписать apps/integrator/src/infra/db/repos/mailingLogs.ts на Drizzle
    status: pending
  - id: p1-message-logs
    content: Переписать apps/integrator/src/infra/db/repos/messageLogs.ts на Drizzle
    status: pending
  - id: p1-verify
    content: Прогон apps/integrator typecheck + test по затронутым тестам; зафиксировать итог в docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md
    status: pending
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
- [`messageLogs.ts`](../../apps/integrator/src/infra/db/repos/messageLogs.ts)

**Вне scope:** `projectionOutbox`, `jobQueue`, любые репозитории вне списка.

## Порядок работ (обязательный)

Примите порядок **subscriptions → topics → bookingCalendarMap → mailingLogs → messageLogs**, чтобы первые три файла закрепили паттерн до логирования.

## Шаги с чек-листами

### 1. Схема Drizzle

- [ ] Сверить физические имена таблиц и колонок с [`apps/webapp/db/schema/schema.ts`](../../apps/webapp/db/schema/schema.ts) и/или dump integrator DDL (`docs/ARCHITECTURE/DB_DUMPS/` при необходимости).
- [ ] Добавить таблицы в регистрируемый schema-object для [`getIntegratorDrizzle()`](../../apps/integrator/src/infra/db/drizzle.ts).
- [ ] `rg 'user_subscriptions|booking_calendar|mailing_logs|message_logs'` (уточнить реальные имена после сверки с DDL) по `apps/integrator` — нет второго канала записи, минующего переводимый репозиторий без осознанного решения.

### 2. Пер-компонентный перевод

Для каждого файла:

- [ ] Сохранить публичные типы экспортов и читаемость JSON/jsonb через те же доменные поля.
- [ ] `ON CONFLICT`, `RETURNING`, фильтры — эквивалентны старому SQL (сравнить план выполнения не обязательно, но одинаковые предикаты и порядок сортировок при `LIMIT`).
- [ ] Не смешивать в одном PR не связанный рефакторинг.

### 3. Закрытие этапа

- [ ] `pnpm --dir apps/integrator run typecheck`
- [ ] `pnpm --dir apps/integrator run test` (или узкий поднабор `--run path/to/file` при итерациях между правками; перед merge этапа — полный интеграторский test как в процессе команды).
- [ ] Запись в [`docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`](../../docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md): что переведено, какие таблицы в schema.

## Definition of Done (этап 1)

- [ ] Все пять файлов не используют `db.query(<строка` для операций домена этого файла (Drizzle API или узкий `sql` фрагмент только если документировано почему).
- [ ] Поведение API репозиториев сохранено; существующие тесты зелёные.
- [ ] Мастер-план todo `phase-1` можно пометить `completed`.

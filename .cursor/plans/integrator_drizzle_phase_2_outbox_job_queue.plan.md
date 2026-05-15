---
name: Integrator Drizzle — этап 2 (outbox + очередь)
overview: >-
  Перевод projection_outbox и rubitime_create_retry_jobs на Drizzle с сохранением
  claim-транзакций (CTE + UPDATE … FOR UPDATE SKIP LOCKED), ретраев и статус-машины.
todos:
  - id: p2-schema
    content: >-
      Добавить projection_outbox и rubitime_create_retry_jobs в integrator Drizzle schema
      (apps/integrator/src/infra/db/schema/integratorQueues.ts + integratorDrizzleSchema.ts).
    status: completed
  - id: p2-projection-outbox
    content: >-
      Переписать projectionOutbox.ts — enqueue через insert+onConflictDoNothing;
      claim через execute(sql); complete/fail/reschedule через update.
    status: completed
  - id: p2-job-queue
    content: >-
      Переписать jobQueue.ts — enqueue/complete/fail/reschedule через insert/update;
      claim через execute(sql).
    status: completed
  - id: p2-sql-escape-hatch
    content: >-
      Задокументированный sql + execute для claim (SKIP LOCKED) в обоих репозиториях.
    status: completed
  - id: p2-tests
    content: >-
      projectionOutbox.test.ts, projectionFanout.test.ts, jobQueuePort.test.ts,
      writePort stubs (integratorDrizzle + onConflictDoUpdate в stub).
    status: completed
  - id: p2-verify
    content: apps/integrator typecheck + test; запись в docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md.
    status: completed
isProject: false
---

# Этап 2: `projectionOutbox` + `jobQueue` (ядро надёжности)

## Связь с мастер-планом

Предпосылка: закрыт [этап 1](integrator_drizzle_phase_1_simple_repos.plan.md) или минимум вынесена и согласована стратегия схемы. Следующий этап: [этап 3](integrator_drizzle_phase_3_domain_repos.plan.md).

## Почему этот блок второй

Здесь критическая логика **claim**: подзапрос с `FOR UPDATE SKIP LOCKED`, атомарный перевод статуса `pending → processing`, детерминированный порядок `ORDER BY next_try_at`, поля попыток/бэкоффа. После успешной миграции этих двух файлов паттерны применимы к остальным очередям.

## Scope

**Разрешено**

- [`projectionOutbox.ts`](../../apps/integrator/src/infra/db/repos/projectionOutbox.ts)
- [`jobQueue.ts`](../../apps/integrator/src/infra/db/repos/jobQueue.ts)
- Тесты: [`projectionOutbox.test.ts`](../../apps/integrator/src/infra/db/repos/projectionOutbox.test.ts), [`writePort.*.test.ts`](../../apps/integrator/src/infra/db/writePort.userUpsert.test.ts) только если упоминают SQL этих модулей
- Drizzle регистрация + schema

**Вне scope**

- Изменение частоты воркеров/scheduler systemd, конфиг backoff в БД/UI.
- Функциональные изменения статус-машины (новые статусы, другая ключевость dedup).

## Технические требования

1. **`claimDueProjectionEvents` / `claimDueMessageRetryJobs`:** семантика «выбрать due-строки с блокировкой и обновить одним statement» сохранена через **`db.execute(sql\`…\`)`** (тот же текст запроса, параметр `LIMIT` через placeholder Drizzle `${lim}`).
2. **`INSERT … ON CONFLICT DO NOTHING`** (outbox dedup по `idempotency_key`): `onConflictDoNothing({ target: projectionOutbox.idempotencyKey })`.
3. **Интервалы retry** (`now() + (($n::text || ' seconds')::interval)`): в `update`/`insert` через `sql\`now() + (${String(n)}::text || ' seconds')::interval\``.
4. **`RETURNING` алиасы** camelCase совпадают с типами `ProjectionOutboxRow`, `MessageRetryJobRow`.

## Чек-лист исполнения

- [x] Сверить DDL индексов `idx_projection_outbox_due`, unique на `idempotency_key`; для retry jobs — `idx_rubitime_create_retry_jobs_due` как в webapp `schema.ts`.
- [x] Прогнать unit-тесты outbox / fanout / jobQueuePort / writePort снабжённые `integratorDrizzle` на корневом `DbPort`.
- [x] `pnpm --dir apps/integrator run typecheck` и `pnpm --dir apps/integrator run test`.

## Definition of Done (этап 2)

- [x] Все экспортируемые функции двух файлов используют Drizzle и/или `execute(sql)` без `db.query('...')`.
- [x] Наблюдаемое поведение воркеров не менялось (claim — один statement; enqueue dedup — ON CONFLICT DO NOTHING).
- [x] Мастер-план todo `phase-2` — `completed`.

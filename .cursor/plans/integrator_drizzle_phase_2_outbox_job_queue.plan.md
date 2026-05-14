---
name: Integrator Drizzle — этап 2 (outbox + очередь)
overview: Перевод projection_outbox и rubitime_create_retry_jobs на Drizzle с сохранением claim-транзакций (CTE + UPDATE … FOR UPDATE SKIP LOCKED), ретраев и статус-машины.
todos:
  - id: p2-schema
    content: Добавить projection_outbox и rubitime_create_retry_jobs в integrator Drizzle schema (переиспользовать канонические определения из webapp schema или общего пакета — см. мастер-план)
    status: pending
  - id: p2-projection-outbox
    content: Переписать projectionOutbox.ts — enqueueProjectionEvent, claimDueProjectionEvents, completeProjectionEvent, failProjectionEvent, rescheduleProjectionEvent без изменения SQL-семантики
    status: pending
  - id: p2-job-queue
    content: Переписать jobQueue.ts — enqueue, claimDue, reschedule, complete/fail (все экспортируемые функции файла)
    status: pending
  - id: p2-sql-escape-hatch
    content: Если Drizzle-builder не выражает паттерн без потери читаемости — оформить один задокументированный sql-тег внутри db.execute с идентичным текстом запроса; предпочтение builder там где эквивалентен
    status: pending
  - id: p2-tests
    content: Обновить/прогнать projectionOutbox.test.ts и смежные тесты записи порта writePort.*
    status: pending
  - id: p2-verify
    content: apps/integrator typecheck + test; запись результатов и заметок про SKIP LOCKED в LOG.md
    status: pending
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

1. **`claimDueProjectionEvents` / `claimDueMessageRetryJobs`:** семантика «выбрать due-строки с блокировкой и обновить одним statement» должна остаться; допускается `db.execute(sql\`...\`)` с сохранением исходного текста запроса, если builder не даёт читаемого эквивалента без риска.
2. **`INSERT … ON CONFLICT DO NOTHING`** (outbox dedup по `idempotency_key`): эквивалент уникального индекса см. канон в webapp [`projectionOutbox`](../../apps/webapp/db/schema/schema.ts).
3. **Интервалы retry** (`now() + (($n::text || ' seconds')::interval)`): сохранить то же допустимое приведение типов или заменить на `sql.interval`/`sql` литералы с тем же результатом для неотрицательных секунд.
4. **`RETURNING` алиасы** camelCase совпадают с текущими типами `ProjectionOutboxRow`, `MessageRetryJobRow`.

## Чек-лист исполнения

- [ ] Сверить DDL индексов `idx_projection_outbox_due`, unique на `idempotency_key`; для retry jobs — индексы по `status`/`next_try_at` как в актуальной миграции.
- [ ] Прогнать существующие unit-тесты outbox и зафиксировать отсутствие регрессий во writePort-сносках («projection_outbox» в строках проверки).
- [ ] `pnpm --dir apps/integrator run typecheck` и `pnpm --dir apps/integrator run test`.

## Definition of Done (этап 2)

- [ ] Все экспортируемые функции двух файлов используют Drizzle/`execute(sql)` без голого `DbPort.query('...')`.
- [ ] Нет изменения внешнего наблюдаемого поведения воркеров (можно верифицировать сравнением литералов итоговых запросов в code review или снапшотом в комментарии к PR).
- [ ] Мастер-план todo `phase-2` — `completed`.

---
name: Integrator Drizzle — этап 3 (доменные репозитории)
overview: После паттернов P1+P2 перевести reminders, bookingRecords и publicAppointmentRecordSync на Drizzle; высокая отдача, но больше ветвлений и связка с синхронизацией записей.
todos:
  - id: p3-schema
    content: Зарегистрировать все таблицы/вью затронутые reminders.ts, bookingRecords.ts, publicAppointmentRecordSync.ts в integrator Drizzle schema
    status: pending
  - id: p3-reminders
    content: Перевести reminders.ts на Drizzle с сохранением типов контрактов kernel (DueReminderOccurrence и др.)
    status: pending
  - id: p3-booking-records
    content: Перевести bookingRecords.ts + поддержать bookingRecords.sql.test.ts
    status: pending
  - id: p3-public-appointment-sync
    content: Перевести publicAppointmentRecordSync.ts; проверить сценарии диффов/UPSERT против текущего SQL
    status: pending
  - id: p3-verify
    content: apps/integrator typecheck + test; LOG.md дополнить разделом «этап 3»
    status: pending
isProject: false
---

# Этап 3: доменно важные репозитории (P3)

## Связь с мастер-планом

Предпосылки: закрыты [этап 1](integrator_drizzle_phase_1_simple_repos.plan.md) и [этап 2](integrator_drizzle_phase_2_outbox_job_queue.plan.md). Следующий: [этап 4](integrator_drizzle_phase_4_complex_sql.plan.md).

## Scope

**Разрешено**

- [`reminders.ts`](../../apps/integrator/src/infra/db/repos/reminders.ts)
- [`bookingRecords.ts`](../../apps/integrator/src/infra/db/repos/bookingRecords.ts)
- [`bookingRecords.sql.test.ts`](../../apps/integrator/src/infra/db/repos/bookingRecords.sql.test.ts)
- [`publicAppointmentRecordSync.ts`](../../apps/integrator/src/infra/db/repos/publicAppointmentRecordSync.ts)

**Вне scope:** `messageThreads`, `channelUsers`, `mergeIntegratorUsers`, скрипты rubitime CLI кроме прямых импортов только если ломается сборка после смены сигнатур (тогда точечный фикс).

## Риски и проверки

- **Reminder rules / occurrences:** согласовать с типами из [`kernel/contracts/reminders`](../../apps/integrator/src/kernel/contracts/reminders.ts) и фактическими JOIN/фильтрами времени UTC.
- **Booking records:** тест [`bookingRecords.sql.test.ts`](../../apps/integrator/src/infra/db/repos/bookingRecords.sql.test.ts) — обновить только если меняются наблюдаемые строки SQL; цель перевода Drizzle сохранить поведение, не текст тестового матча.
- **Public appointment sync:** проверить идempotентность UPSERT/delete и любые ограничения FK на записи синхронизации.

## Чек-лист по шагам

- [ ] Инвентаризация таблиц: из `apps/integrator/src/infra/db/repos` выполнить `rg -n 'FROM |JOIN |INSERT INTO'` по `reminders.ts`, `bookingRecords.ts`, `publicAppointmentRecordSync.ts` и сверить имена таблиц с webapp/schema или дампами.
- [ ] По каждому файлу: черновое сравнение «до/после» для критических SELECT (EXPLAIN необязательно).
- [ ] `pnpm --dir apps/integrator run typecheck` и `pnpm --dir apps/integrator run test`.

## Definition of Done (этап 3)

- [ ] Три целевых файла без сырого `db.query(<template string)` для операций своего домена (допускается `execute(sql)` при сложных выражениях с явной пометкой).
- [ ] Все связанные тесты интегратора зелёные.
- [ ] Мастер-план todo `phase-3` — `completed`.

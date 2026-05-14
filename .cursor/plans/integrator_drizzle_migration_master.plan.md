---
name: Integrator SQL → Drizzle (мастер-план)
overview: Поэтапный перевод выбранных репозиториев интегратора с сырого SQL на Drizzle-ORM без смены контрактов kernel и без изменения транзакционной семантики (особенно claim + SKIP LOCKED + retry для outbox/очередей).
todos:
  - id: schema-strategy
    content: Зафиксировать стратегию общих Drizzle-определений таблиц (workspace-пакет vs локальная schema в integrator vs выборочный импорт) и расширить регистрацию схемы в getIntegratorDrizzle
    status: pending
  - id: phase-1
    content: "Выполнить план integrator_drizzle_phase_1_simple_repos.plan.md — P1 простые репозитории"
    status: pending
  - id: phase-2
    content: "Выполнить план integrator_drizzle_phase_2_outbox_job_queue.plan.md — outbox + job queue"
    status: pending
  - id: phase-3
    content: "Выполнить план integrator_drizzle_phase_3_domain_repos.plan.md — доменные репозитории"
    status: pending
  - id: phase-4
    content: "Выполнить план integrator_drizzle_phase_4_complex_sql.plan.md — сложный SQL последним"
    status: pending
  - id: dod-master
    content: Definition of Done мастера — все этапы закрыты, integrator-тесты и typecheck по зоне зелёные, запись финала в docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md
    status: pending
isProject: true
---

# Мастер-план: Integrator — перевод SQL на Drizzle

## Цель итерации

- Убрать сырой SQL из перечисленных репозиториев `apps/integrator/src/infra/db/repos/` в пользу Drizzle там, где это даёт типобезопасность и читаемость **без** потери поведения.
- Пройти путь от изолированных CRUD до очередей с `FOR UPDATE SKIP LOCKED`, затем к доменным и самым сложным запросам.

## Последовательность этапов (канон)

1. [Этап 1 — простые репозитории](integrator_drizzle_phase_1_simple_repos.plan.md)
2. [Этап 2 — projection outbox + job queue](integrator_drizzle_phase_2_outbox_job_queue.plan.md)
3. [Этап 3 — доменно важные](integrator_drizzle_phase_3_domain_repos.plan.md)
4. [Этап 4 — сложный SQL (CTE / LATERAL / identity-flow)](integrator_drizzle_phase_4_complex_sql.plan.md)

**Практический старт (как в постановке):** после шага со стратегией схемы — блок `subscriptions` + `topics` + `bookingCalendarMap`; затем сразу `projectionOutbox` + `jobQueue` перед тяжёлым доменом (`reminders` и далее).

## Стратегия схемы Drizzle (обязательное решение до массового кода)

Единый PostgreSQL с таблицами, часть которых уже описана в [`apps/webapp/db/schema/schema.ts`](../../apps/webapp/db/schema/schema.ts) (например `projectionOutbox`, `userSubscriptions`). Integrator сегодня **не** зависит от webapp-пакета.

Выбрать один подход и зафиксировать его в [`docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`](../../docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md):

- **Предпочтительно:** вынести минимальный набор `pgTable` для integrator-путей в отдельный workspace-пакет (по образцу [`packages/operator-db-schema`](../../packages/operator-db-schema)), чтобы не подтягивать webapp и не дублировать колонки вручную в двух местах без процесса синхронизации.
- **Альтернатива:** явно дублировать узкие определения только для читаемых integrator-колонок в `apps/integrator/` — допустимо только с чеклистом «поле к полю совпадает с каноническим DDL / webapp schema» для каждой таблицы.

Расширить [`apps/integrator/src/infra/db/drizzle.ts`](../../apps/integrator/src/infra/db/drizzle.ts): зарегистрировать новые таблицы в объекте `schema`, сохранить один пул (`db` из `client.ts`).

## Границы scope (разрешено / вне scope)

**Разрешено**

- [`apps/integrator/src/infra/db/`](../../apps/integrator/src/infra/db/) (в т.ч. `drizzle.ts`, новые файлы schema при выбранном варианте).
- Новый или существующий workspace-пакет `packages/*` **только** для Drizzle-схем, если принято решение о выносе.
- Тесты существующих `*.test.ts` рядом с репозиториями; при необходимости — узкие правки моков `getIntegratorDrizzle`.

**Вне scope (без отдельного согласования)**

- Изменение GitHub Actions / корневого CI.
- Смена публичных контрактов `DbPort` / kernel типов без явной задачи «миграция API».
- Рефакторинг репозиториев, не входящих в списки этапов ниже.

## Карта репозиториев по приоритетам

| Приоритет | Файлы | Этап-план |
|-----------|-------|-----------|
| P1 | `subscriptions.ts`, `topics.ts`, `bookingCalendarMap.ts`, `mailingLogs.ts`, `messageLogs.ts` | Этап 1 |
| P2 | `projectionOutbox.ts`, `jobQueue.ts` | Этап 2 |
| P3 | `reminders.ts`, `bookingRecords.ts`, `publicAppointmentRecordSync.ts` | Этап 3 |
| P4 | `messageThreads.ts`, `channelUsers.ts`, `mergeIntegratorUsers.ts` | Этап 4 |

## Definition of Done (мастер)

- [ ] Принято и описано решение по общей Drizzle-схеме для integrator таблиц; `getIntegratorDrizzle` покрывает все переведённые таблицы этапов 1–4.
- [ ] Все четыре этапных плана переведены в завершённые состояния (`todos`, чеклисты, LOG).
- [ ] `pnpm --dir apps/integrator run typecheck` и `pnpm --dir apps/integrator run test` зелёные после финального этапа.
- [ ] В [`docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`](../../docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md) зафиксированы решения по схеме, риски оставшегося сырого SQL (если есть) и краткий итог по этапам.

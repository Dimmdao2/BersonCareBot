# Stage 3 — Transactional merge + projection_outbox (часть Deploy 3)

**Цель:** безопасно объединить два `users.id` в integrator DB, перенести FK-зависимости на winner, пометить loser как alias, и привести `projection_outbox` в согласованное состояние с **уникальным** `idempotency_key`.

## Уникальность outbox

- Индекс: `idx_projection_outbox_idempotency_key` UNIQUE на `idempotency_key` ([`20260320_0001_outbox_idempotency_key_unique.sql`](../../apps/integrator/src/infra/db/migrations/core/20260320_0001_outbox_idempotency_key_unique.sql)).
- Любой rewrite должен избегать конфликта `23505`.

## Merge service (спецификация)

Функция уровня приложения (имя рабочее): `mergeIntegratorUsers(winnerId, loserId, options)`.

- Одна **транзакция** (или чётко документированные фазы с компенсацией).
- **Идемпотентность:** повторный вызов с теми же `(winner, loser)` после успешного merge возвращает успех с `alreadyMerged: true` и нулевыми счётчиками, если `loser.merged_into_user_id` уже указывает на `winner`. Иной уже смёрдженный loser (другой winner) — ошибка `ALREADY_MERGED_ALIAS`.
- **`dryRun`:** валидирует и берёт блокировки строк `users`, затем коммитит транзакцию **без** DML по домену и outbox (не «ROLLBACK preview»).
- Порядок блокировок строк `users` — **детерминированный** (например по возрастанию id).
- Шаги (черновик):
  1. Загрузить оба user, проверить: не alias, не одинаковый id, нет активных конфликтов политики (определить запреты: например оба имеют conflicting unique identities — отдельная матрица).
  2. Перенести все строки с FK `user_id` / ссылки на `loser` → `winner` (перечень таблиц — инвентаризация по `DB_STRUCTURE.md` integrator части: `identities`, `contacts`, reminders, subscriptions, …).
  3. Обработать конфликты уникальности `(resource, external_id)` в `identities` и `(type, value_normalized)` в `contacts` — политика merge vs drop duplicate.
  4. Установить `loser.merged_into_user_id = winner.id`.
  5. Запретить дальнейшие записи на loser (дублирует Stage 2 guards).

## Outbox: политики по типам событий

Для каждого `event_type` из [`writePort.ts`](../../apps/integrator/src/infra/db/writePort.ts) зафиксировать одно из:

- **Rewrite in place:** обновить `payload` и при необходимости `idempotency_key` (только если новый ключ не конфликтует).
- **Dedup:** если winner-key уже существует — удалить/пометить loser-row как cancelled (осторожно с семантикой worker).
- **Только `pending`:** realign не трогает строки `processing`, чтобы не гоняться с projection worker; при необходимости — drain очереди или второй проход после опустошения `pending`.
- **Replay:** вставить новое событие с новым ключом и пометить старое как superseded (если поддерживается).

Приоритетные типы: `user.upserted`, `contact.linked`, `preferences.updated`, support.*, reminder.*, `appointment.record.upserted` (если в payload есть integrator user id).

## Наблюдаемость

- Лог структурированный (pino) с `winnerId`, `loserId`, счётчики переносов.
- `projection-health.mjs` / `getProjectionHealth` выводят отдельно **`cancelledCount`** (в т.ч. merge dedup); это **не** `dead` и само по себе не означает degraded gate.
- Опционально: audit в integrator DB или событие в webapp — **не** дублировать без согласования с правилами `system_settings`.

## Gate

- Dry-run на копии БД: merge тестовой пары → нет duplicate idempotency violation → worker отрабатывает без сюрпризов.

## Реализация в репозитории

- Merge: [`mergeIntegratorUsers.ts`](../../apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts) — `mergeIntegratorUsers(winnerId, loserId, options)` в `db.tx`, идемпотентность `alreadyMerged`, realign `projection_outbox` для `pending`.
- Политика payload / idempotency: [`projectionOutboxMergePolicy.ts`](../../apps/integrator/src/infra/db/repos/projectionOutboxMergePolicy.ts).
- Наблюдаемость: [`projectionHealth.ts`](../../apps/integrator/src/infra/db/repos/projectionHealth.ts), [`projection-health.mjs`](../../apps/integrator/scripts/projection-health.mjs) (`cancelledCount`).
- Аудит репозитория: [`AUDIT_STAGE_3.md`](AUDIT_STAGE_3.md).

## Связь с todo «merge-outbox-realignment»

Этот файл покрывает **integrator + outbox**; webapp таблицы — [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md).

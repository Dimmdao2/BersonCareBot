# Outgoing delivery queue

Исходящие уведомления (операторские Telegram-алерты, напоминания пациентам по каналам `telegram` / `max`) ставятся в таблицу **`public.outgoing_delivery_queue`** и доставляются **integrator worker** (`bersoncarebot-worker-prod`) отдельным циклом рядом с job queue и projection outbox.

## Идемпотентность

- Колонка **`event_id`** уникальна: повторный `INSERT … ON CONFLICT DO NOTHING` не создаёт дубликат отправки.
- Напоминания: ключ `rem:<occurrenceId>:<channel>`.
- Операторский алерт: ключ `op-alert:<incidentId>`.

## Статусы и ретраи

Статусы: `pending`, `processing`, `sent`, `failed_retryable`, `dead`. Backoff после неудачи: 60s → 300s → 900s → 3600s (см. `apps/integrator/src/infra/delivery/deliveryContract.ts`). Зависшие `processing` сбрасываются в `failed_retryable` через ~10 минут.

## Runbook

- **Dead / рост due:** админка → «Здоровье системы» — блок «Очередь доставки уведомлений» и `GET /api/admin/system-health` (`outgoingDelivery`, `meta.probes.outgoing_delivery`).
- **Строки в БД:** `public.outgoing_delivery_queue` (`status`, `last_error`, `attempt_count`).

## Связанные файлы

- Миграция: `apps/webapp/db/drizzle-migrations/0060_outgoing_delivery_queue.sql`
- Репозиторий SQL: `apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts`
- Воркер: `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`, подключение в `apps/integrator/src/infra/runtime/worker/main.ts`

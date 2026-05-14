# План: надёжная очередь доставки + health для админа — доработка по аудиту (2026-05)

## Принятые решения

- Таблица **`public.outgoing_delivery_queue`** остаётся в схеме **`public`** (единая БД webapp + integrator, см. `DATABASE_UNIFIED_POSTGRES.md`).
- Идемпотентность и ретраи — как в миграции `0060` и `OUTGOING_DELIVERY_QUEUE.md`.

## Закрытые по аудиту пункты

| Пункт аудита | Сделано |
|--------------|---------|
| **C3** Инвентаризация `dispatchOutgoing` | Документ `docs/ARCHITECTURE/OUTGOING_DISPATCH_CLASSIFICATION.md` |
| **D1** Баннер «Сегодня» = критерии system-health | `loadAdminDoctorTodayHealthBanner` использует тот же снимок, что `collectAdminSystemHealthData` (`adminDoctorTodayHealthBannerFromSystemHealth`) |
| **B2** Per-channel + активность воркера | `getOutgoingDeliveryQueueHealth`: `dueByChannel`, `processingCount`, `lastSentAt`, `lastQueueActivityAt`; UI в `SystemHealthSection` |
| **A1** Разделение retryable / permanent | `isOutgoingDeliveryDispatchErrorRetryable` в `deliveryContract.ts`, воркер: немедленный `dead` для постоянных ошибок |
| **Reminders** Риск enqueue после `persistWrites` | `enqueueReminderDispatchBatchWithRetries` (3 попытки + backoff, затем `throw` + лог) |

## Общая реализация (рефакторинг)

- Сбор данных **`GET /api/admin/system-health`** вынесен в `apps/webapp/src/app-layer/health/collectAdminSystemHealthData.ts`; `route.ts` — guard + JSON.

## Definition of Done (аудит)

- [x] Классификация immediate vs queue задокументирована.
- [x] Баннер админа на «Сегодня» согласован с критическими сигналами system-health.
- [x] Health payload очереди расширен (каналы, processing, last timestamps).
- [x] Воркер различает постоянные ошибки диспатча.
- [x] Enqueue напоминаний с повторными попытками.

## Намеренно не делали в этом проходе

- Полная SQL-транзакция «`markQueued` + INSERT outbox`» в одном соединении (требует проброса `tx` в writePort); частично смягчено ретраями enqueue.

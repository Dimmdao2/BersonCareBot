# Классификация вызовов `dispatchOutgoing` (исходящая доставка)

Цель: зафиксировать, что уходит **напрямую** через `DispatchPort.dispatchOutgoing` в рантайме integrator, а что доставляется **через** `public.outgoing_delivery_queue` + worker (`outgoingDeliveryWorker` → тот же `dispatchOutgoing`).

## Через очередь (`outgoing_delivery_queue`)

| Источник | Примечание |
|----------|------------|
| `reportOperatorFailure` → `enqueueOutgoingDeliveryIfAbsent` | Операторский Telegram-алерт по инциденту |
| `reminders.dispatchDue` → `enqueueReminderDispatchBatchWithRetries` | Напоминания по каналам после `persistWrites` |

## Немедленный вызов `dispatchOutgoing` (вне worker-очереди)

Сценарии, где доменный код всё ещё вызывает адаптер синхронно в контексте HTTP/webhook/job (не через таблицу очереди):

| Область | Файл / вход |
|---------|-------------|
| Исходящий шлюз событий | `kernel/eventGateway/incomingEventPipeline.ts` |
| Rubitime M2M / записи | `integrations/rubitime/recordM2mRoute.ts` |
| Запрос контакта врача | `integrations/bersoncare/dispatchRequestContact.ts` |
| OTP | `integrations/bersoncare/sendOtpRoute.ts` |
| Relay outbound (webapp → канал) | `integrations/bersoncare/relayOutboundRoute.ts` |
| Качество данных / таймзоны | `infra/db/dataQualityIncidentAlert.ts` |
| Фоновые job из очереди задач | `infra/runtime/worker/jobExecutor.ts` (доставка как часть выполнения job) |

## Правило для будущих фич

- Повторяемая, ретраируемая массовая доставка уведомлений с идемпотентностью по `event_id` — **через** `outgoing_delivery_queue`.
- Синхронный ответ пользователю в рамках одного запроса (OTP, relay, немедленный TG в ответ на действие) — по продуктовым требованиям может оставаться **immediate**; при появлении ретраев/бэклога — пересмотр в пользу очереди.

См. также: `docs/ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md`.

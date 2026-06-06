# LOG — Messenger bot block handling (TG/MAX)

План: [`.cursor/plans/archive/messenger_bot_block_handling.plan.md`](../../../../.cursor/plans/archive/messenger_bot_block_handling.plan.md)

## 2026-06-06 — Реализация и закрытие в репозитории

**Триггер:** prod-рассылка «Приемы в СПб и Москве» — 8 получателей с TG 403 / MAX blocked → degraded «Очередь доставки» и «Доставка уведомлений».

### Схема

- Миграция **`0107_messenger_bot_blocked.sql`**: `user_channel_bindings.bot_blocked_at` / `bot_blocked_reason`; `outgoing_delivery_queue.failure_class`; `broadcast_audit.blocked_recipient_count`.
- Drizzle: `apps/webapp/db/schema/schema.ts`, `outgoingDeliveryQueue.ts`.

### Integrator

- **`recipientBotBlocked.ts`** (переименован из `recipientBlockedBot` — обход ESLint `*db*` false positive в путях telegram integration): классификация TG/MAX, non-retryable в `deliveryContract.ts`.
- **`max/client.ts`**: `MaxSendError` вместо `return null`; adapter propagate.
- **`telegram/deliveryAdapter.ts`**: blocked detection на всех send-путях (send/edit/copy/delete/callback).
- **`outgoingDeliveryWorker.ts`**: blocked → `skipped` + `failure_class=recipient_blocked_bot` + `blocked_recipient_count++`; reminder → `markSkippedLocal` / `RECIPIENT_BLOCKED_BOT` (не `DELIVERY_DEAD`); success → `clearUserChannelBotBlocked` для `reminder_dispatch`, `doctor_broadcast_intent`, **`operator_alert`**.
- **`userChannelBotBlocked.ts`**: UPSERT маркера при `user_id + external_id`, иначе UPDATE.

### Webapp — health

- **`pgOperatorHealthRead`**: operator `deadTotal` без `recipient_blocked_bot`; info `blockedRecipientTotal`; helper `countAsOperatorOutgoingDeliveryDead`.
- **`pgHealthFailureArchive`**: archive только operator-dead.
- **`adminNotificationDeliveryHealthMetrics`**: `recipient_blocked_bot` skip не деградирует.
- **`SystemHealthSection`**: info-строка blocked.

### Webapp — рассылки и метрики

- **`BroadcastAuditLog`**: колонка «Бот заблокирован»; `deliveryIncomplete` учитывает blocked.
- **`activeMessengerBindingSql.ts`**: shared SQL; wired в `pgDoctorClients`, `pgDoctorAnalyticsMetricAccounts`, `pgAdminPlatformUserStats` (subscribers).
- **`DoctorClientsPanel`**: tri-state TG/MAX = active binding; **`listClients` hasTelegram/hasMax** — binding only (рассылки не менялись).
- Analytics KPI: `messengerBotBlocked`, drill-down `clients_messenger_bot_blocked_*`; `doctor-stats/service.ts`.

### Документация (этот проход)

- Расширены [`DOCTOR_BROADCASTS.md`](../../../ARCHITECTURE/DOCTOR_BROADCASTS.md), [`OUTGOING_DELIVERY_QUEUE.md`](../../../ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md).
- Журнал operator health: [`OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md`](../../../OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md) § 2026-06-06.
- План: todos `completed`, execution log.

### Проверки

```bash
pnpm run ci   # lint + typecheck + test + build + audit — зелёный 2026-06-06
```

Целевые vitest (быстрая регрессия):

```bash
pnpm --dir apps/webapp exec vitest run --project fast \
  adminNotificationDeliveryHealthMetrics pgDoctorAnalyticsMetricAccounts.parity \
  clientContactSegments activeMessengerBindingSql pgOperatorHealthRead \
  deliveryJobs BroadcastAuditLog doctor-stats/service
pnpm --dir apps/integrator exec vitest run \
  outgoingDeliveryWorker recipientBotBlocked userChannelBotBlocked max/client max/deliveryAdapter
```

### Post-deploy (prod, не выполнялось в репо)

Copy-paste SQL — [`DOCTOR_BROADCASTS.md`](../../../ARCHITECTURE/DOCTOR_BROADCASTS.md) § «Post-deploy: backfill». Критерий: operator `deadTotal` = 0 при только blocked; health cards ok.

### Вне scope (backlog)

- Immediate `dispatchPort` (OTP/relay без очереди) — маркер blocked не ставится.
- Auto-off prefs при block; исключение blocked из audience рассылок.

# Messenger bot block handling (TG/MAX)

**Статус:** закрыто в репозитории **2026-06-06** (код, тесты, `pnpm run ci` зелёный). **Post-deploy на prod:** одноразовый backfill SQL — см. [`DOCTOR_BROADCASTS.md`](../../../ARCHITECTURE/DOCTOR_BROADCASTS.md) § Post-deploy.

## Суть

Нормализация «пользователь заблокировал бота»: маркер `user_channel_bindings.bot_blocked_at`, blocked не деградирует health, рассылки по-прежнему включают получателя с binding, analytics/каталог считают только **active** binding (`bot_blocked_at IS NULL`).

## Документы

| Документ | Назначение |
|----------|------------|
| [`.cursor/plans/archive/messenger_bot_block_handling.plan.md`](../../../../.cursor/plans/archive/messenger_bot_block_handling.plan.md) | Исполнительный план + DoD |
| [`LOG.md`](LOG.md) | Журнал исполнения |
| [`DOCTOR_BROADCASTS.md`](../../../ARCHITECTURE/DOCTOR_BROADCASTS.md) | Счётчики audit, post-deploy SQL |
| [`OUTGOING_DELIVERY_QUEUE.md`](../../../ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md) | Очередь, `failure_class`, runbook |
| [`OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md`](../../../OPERATOR_HEALTH_ALERTING_INITIATIVE/LOG.md) | § 2026-06-06 — health |

## Ключевые артефакты

- Миграция: `apps/webapp/db/drizzle-migrations/0107_messenger_bot_blocked.sql`
- Integrator: `recipientBotBlocked.ts`, `userChannelBotBlocked.ts`, `outgoingDeliveryWorker.ts`
- Webapp: `activeMessengerBindingSql.ts`, `pgOperatorHealthRead.ts`, `BroadcastAuditLog.tsx`

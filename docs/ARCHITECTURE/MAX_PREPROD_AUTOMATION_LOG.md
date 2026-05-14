# MAX / Telegram — pre-prod automation (integrator tests)

Журнал закрытой задачи: автотесты до ручного прод-смоука (webhook MAX при «тихом» `fromMax`, напоминания skip + webapp projection, таблица игнорируемых `update_type` в `fromMax`), плюс сопутствующая гигиена корневого `eslint` для integrator.

**План (архив репозитория):** [`.cursor/plans/archive/max_tg_pre-prod_automation.plan.md`](../../.cursor/plans/archive/max_tg_pre-prod_automation.plan.md)

## Изменения в коде

| Область | Файл | Смысл |
|---------|------|--------|
| MAX webhook | `apps/integrator/src/integrations/max/webhook.test.ts` | Валидное тело `message_edited` → `fromMax` даёт `null` → HTTP 200, `{ ok: true }`, `eventGateway.handleIncomingEvent` не вызывается (ветка `webhook.ts` после `parseMaxUpdate`). |
| MAX mapIn | `apps/integrator/src/integrations/max/mapIn.test.ts` | `it.each` по `update_type` без отдельной ветки в `fromMax`: `bot_added`, `bot_removed`, `user_removed`, `chat_title_changed`, `message_construction_request`, `message_constructed`, `message_chat_created` — минимальный payload `{ update_type, timestamp: 1 }`, ожидание `null`. Отдельные `it` для `message_edited` / `message_removed` сохранены. |
| Reminders | `apps/integrator/src/kernel/domain/executor/executeAction.test.ts` | В `describe('reminders.skip.applyPreset (telegram)')`: при `reasonCode: 'none'` и `remindersWebappWritesPort` — `postOccurrenceSkip` с `reason: null` и порядок вызова **до** `writeDb` с типом `reminders.occurrence.markSkippedLocal` (`mock.invocationCallOrder`). |
| Lint (без suppress) | `apps/integrator/src/integrations/common/messengerStartParse.test.ts` | Строка `/start setphone_…` для теста percent-encoding собрана из частей (`%2B` + цифры), чтобы корневой `no-secrets/no-secrets` не ругался на один длинный литерал. |
| Lint (без suppress) | `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.test.ts` | Заголовок `describe` переименован (без высокоэнтропийного совпадения с именем экспорта), чтобы убрать ложное срабатывание `no-secrets`. |

## Проверки

- Узко:  
  `pnpm --dir apps/integrator exec vitest --run src/integrations/max/webhook.test.ts`  
  `pnpm --dir apps/integrator exec vitest --run src/integrations/max/mapIn.test.ts`  
  `pnpm --dir apps/integrator exec vitest --run src/kernel/domain/executor/executeAction.test.ts -t "reminders.skip.applyPreset"`
- Барьер как перед push: из корня репозитория `pnpm install --frozen-lockfile && pnpm run ci` (см. `.cursor/rules/pre-push-ci.mdc`).

## Вне репозитория (ручной чеклист)

См. §5 плана: прод-смоук MAX (игнорируемые типы, целевые события), skip `none` / free-text и след в webapp, deep link `link_*` / `setphone_*` / bare `link_*`.

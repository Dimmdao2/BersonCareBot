---
name: Telegram reminder callbacks и устойчивая доставка intents
overview: 'Единый разбор callback_query в mapIn (в т.ч. rem_snooze), answer перед edit/send для напоминаний, устойчивый цикл dispatch по intents; покрыто тестами и задокументировано в TEST_BEHAVIOR_AUDIT.'
status: completed
todos:
  - id: shared-callback-mapper
    content: 'mapIn: incomingCallbackUpdateFromTelegramCallbackQuery + incomingCallbackPayloadFromNormalized; webhook и fromTelegram на общей реализации'
    status: completed
  - id: ack-intent-order
    content: 'reminders: buildReminderCallbackAckIntents — callback.answer перед message.edit/send; тест порядка intents'
    status: completed
  - id: resilient-dispatch-loop
    content: 'processAcceptedIncomingEvent: try/catch на intent, лог, нормализация ошибки; тест продолжения после сбоя первого intent'
    status: completed
  - id: webhook-regression-tests
    content: 'webhook.test / mapIn.test: rem_snooze → occurrenceId + minutes; паритет полей с DynamicActionResult'
    status: completed
  - id: worker-telegram-unified-delete
    content: 'outgoingDeliveryWorker.test: Telegram unified deleteBeforeSendMessageId (строковый id)'
    status: completed
  - id: docs-test-behavior-audit
    content: 'docs/INTEGRATOR_DRIZZLE_MIGRATION/TEST_BEHAVIOR_AUDIT.md — секция Telegram + ссылка на этот план'
    status: completed
  - id: verify-integrator-tests
    content: 'pnpm run ci зелёный на дереве с правками'
    status: completed
  - id: e2e-run-e2e-webhook
    content: 'RUN_E2E сценарии вебхука для snooze — не выполнялись; риск снижен unit/интеграционными тестами'
    status: cancelled
  - id: unify-message-path-mapBodyToIncoming
    content: 'Полное выравнивание пути сообщений mapBodyToIncoming с fromTelegram — вне scope плана'
    status: cancelled
isProject: false
---

# План: Telegram reminder callbacks и устойчивая доставка intents (закрыт)

## Состояние после выполнения (2026-05)

Исправления в проде и в тестах применены. Исторически вебхук терял поля `reminderOccurrenceId` / `reminderSnoozeMinutes` при разборе `callback_query`, из‑за чего сценарий «Через 15 мин» не доходил до домена и пользователь видел «вечную загрузку» на кнопке. Сейчас ingress и `fromTelegram` используют один mapper; для напоминаний ack идёт до правки сообщения; сбой одного intent не рвёт очередь остальных.

## Исторический контекст (до фикса)

- Telegram показывает «часики» на inline-кнопке, пока бот не вызовет `answerCallbackQuery` (или не истечёт таймаут).
- Домен ожидал `IncomingCallbackUpdate` с полями snooze; при их отсутствии обработка snooze не срабатывала.
- Порядок «сначала edit, потом answer» увеличивал риск зависания UI при ошибке edit.

## Реализовано

1. **Общий mapper** — `incomingCallbackUpdateFromTelegramCallbackQuery` + `incomingCallbackPayloadFromNormalized` в `mapIn.ts`; ветка callback в `webhook.ts` делегирует сюда (с сохранением особых веток admin/dialogs по проекту).
2. **Порядок intents** — в `buildReminderCallbackAckIntents` сначала `callback.answer`, затем `message.edit` или `message.send`.
3. **Устойчивый dispatch** — в `processAcceptedIncomingEvent` обёртка на каждый intent, лог предупреждения, продолжение цепочки.
4. **Тесты** — `webhook.test.ts`, `mapIn.test.ts`, `processAcceptedIncomingEvent.test.ts`, релевантные executor/worker тесты; см. матрицу в `docs/INTEGRATOR_DRIZZLE_MIGRATION/TEST_BEHAVIOR_AUDIT.md` §2 (блок Telegram).

## Definition of Done

- [x] Один источник правды для полей callback из `normalizeChannelCallbackPayload` / `DynamicActionResult`.
- [x] Ack до edit/send для reminder callbacks.
- [x] Ошибка одного intent не блокирует остальные.
- [x] Регрессионные тесты на ingress и dispatch.
- [x] CI зелёный.
- [x] Документация аудита и архивный план синхронизированы.

## Пост-аудит (дополнительно к телу плана)

- Вынесен `incomingCallbackPayloadFromNormalized`, чтобы новые поля callback добавлялись в одном месте (комментарий в коде — расширять вместе с `IncomingCallbackUpdate`).
- В `outgoingDeliveryWorker.test.ts` добавлен кейс unified Telegram для `deleteBeforeSendMessageId`.
- В catch dispatch ошибка приводится к `Error` для стабильного логирования.

## Вне scope / намеренно не сделано

См. `todos` со `status: cancelled`: полная унификация пути **сообщений** `mapBodyToIncoming` с `fromTelegram`; отдельный прогон **RUN_E2E** только под вебхук snooze. Глобальный обход всех handler’ов с перестановкой edit/answer — не входил в план (точечно — напоминания + общий dispatch).

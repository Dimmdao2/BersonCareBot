# D39 — census швов доставки и исполнения webapp → integrator

Дата: 2026-08-20. Это статический проход по коду и схеме репозитория; базы и runtime не затрагивались. «Закрыт» означает устойчивый ключ с документированным duplicate/no-op; чекбокс D39 остаётся для независимого аудита.

| Шов                                   | Файл:строка                                                                                      | Дверь                                                                  | Ключ идемпотентности                                                                                                                                                                             | Поведение при повторе                                                                                                                                                                               | Вердикт                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Доменные исходящие уведомления        | `apps/webapp/src/modules/messaging/outboundMessageQueuePort.ts:49`                               | `pgOutgoingDeliveryQueueWritePort` → `enqueueOutgoingDeliveryIfAbsent` | `public.outgoing_delivery_queue.event_id`, UNIQUE; `event_id = purpose:idempotencyKey`                                                                                                           | Конфликт уникальности не создаёт вторую очередь; enqueue — no-op.                                                                                                                                   | Закрыт — замерен 05.08, не перепроверялся.                            |
| Relay outbound                        | `apps/webapp/src/modules/messaging/relayOutbound.ts:136`                                         | Прямой signed HTTP `POST /api/bersoncare/relay-outbound`               | Postgres `idempotencyPort`; `${organizationId ?? 'global'}:${messageId}:${channel}:${recipient}`                                                                                                 | `duplicate`/`skipped`, без второй доставки.                                                                                                                                                         | Закрыт — audit PASS `748379f00`, не перепроверялся.                   |
| Ответ врача в support                 | `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts:90`                          | `QueuePort`                                                            | `integrator_message_id = webapp-msg:${conversationId}:${idempotencyKey}`; `created` gate                                                                                                         | Повтор не создаёт вторую запись/доставку.                                                                                                                                                           | Закрыт — замерен 05.08, не перепроверялся.                            |
| Ingress booking/event gateway         | `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts:565`                       | `eventGateway` с обязательным `idempotencyPort`                        | Postgres `idempotencyPort`; ключ события                                                                                                                                                         | Повтор отсекается до dispatch.                                                                                                                                                                      | Закрыт — D34, замерен 05.08, не перепроверялся.                       |
| Синхронизация правила напоминания     | `apps/webapp/src/infra/integrator-push/integratorM2mPosts.ts`; `deliverIntegratorPushPayload.ts` | Signed HTTP `POST /api/integrator/reminders/rules`                     | Исходящий `idempotencyKey`; worker передаёт `row.idempotencyKey`; receiver — `idempotencyPort`.                                                                                                  | Повтор: `200 { ok: true, status: 'duplicate' }`, write no-op.                                                                                                                                       | Закрыт.                                                               |
| OTP по SMS                            | `apps/webapp/src/infra/integrations/sms/integratorSmsDelivery.ts`                                | Signed HTTP `POST /api/bersoncare/send-sms`                            | Хеш канала/адресата/кода → `idempotencyPort`.                                                                                                                                                    | Тот же запрос no-op; новый код resend имеет новый ключ и отправляется.                                                                                                                              | Закрыт.                                                               |
| OTP в Telegram/MAX                    | `apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.ts`                                 | Signed HTTP `POST /api/bersoncare/send-otp`                            | Хеш канала/адресата/кода → `idempotencyPort`.                                                                                                                                                    | Тот же запрос no-op; новый код resend имеет новый ключ и отправляется.                                                                                                                              | Закрыт.                                                               |
| Email-код и transactional email       | `apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts`                             | Signed HTTP `POST /api/bersoncare/send-email`                          | OTP: хеш адресата/кода → `idempotencyPort`; transactional email получает новый UUID на каждый вызов.                                                                                             | OTP-повтор no-op, новый OTP resend отправляется. Для transactional email нет id операции, поэтому повтор вызова намеренно не подавляется: нельзя отличить retry от сознательной повторной отправки. | Частично закрыт: OTP закрыт; transactional email — OWNER QUESTION.    |
| Запрос контакта в мессенджере         | `apps/webapp/src/modules/messaging/requestMessengerContact.ts:36`                                | Прямой signed HTTP `POST /api/bersoncare/request-contact`              | `${channel}:${recipientId}:${5-minute bucket}`; durable `integrator.idempotency_keys` через `idempotencyPort` (`apps/integrator/src/integrations/bersoncare/requestContactRoute.ts:15`, `:129`). | Занятый ключ возвращает `200 { status: 'duplicate' }`; на ошибке ключ освобождается (`:140`).                                                                                                       | Закрыт.                                                               |
| Ручной merge пользователей integrator | `apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts:120`                         | Прямой signed HTTP `POST /api/integrator/users/merge`                  | Нет: helper шлёт только winner/loser/dryRun (`:130`), без idempotency header/body.                                                                                                               | В `apps/integrator/src` нет точной строки `/api/integrator/users/merge` или `canonical-pair`: повтор получает HTTP-отказ (404), не contract-level duplicate/no-op.                                  | Находка: execution seam без ключа и без найденного receiver-маршрута. |

## Области без дополнительных швов

- Поиск `INTEGRATOR_API_URL` в `apps/webapp/src` дал также `GET /health`, `GET /health/projection` и `canonical-pair`; это read-only probes/gate, не доставка и не исполнение.
- Точные поиски `/api/bersoncare`, `/api/integrator/users/merge`, `fetch(` и `INTEGRATOR_API_URL` в `apps/webapp/src` не нашли иных webapp→integrator mutation endpoints. `operator-health-probe` найден только в `apps/webapp/src/app/api/api.md` и registry как описанный internal job, не как webapp sender.
- Точный поиск `/api/integrator/users/merge|canonical-pair|winnerIntegratorUserId|loserIntegratorUserId` в `apps/integrator/src` не нашёл receiver-кода; это доказательство отказа последней строки, не запрос на исправление.

## Итог

Швы закрыты: 8 (из них email — только OTP).

Находки: 2.

1. Transactional email: у вызова нет стабильного идентификатора операции. Дедуп одинакового тела заглушит сознательную повторную отправку; нужен owner-contract ключа операции.
2. Manual integrator merge: **находка закрыта 20.08 — это не шов, а мёртвый код.** Точный поиск показал у
   `callIntegratorUserMerge` НОЛЬ вызовов (только собственное определение и ре-экспорт из app-layer), а
   маршрут `/api/integrator/users/merge` отсутствует и у отправителя (`apps/webapp/src/app/api/doctor/clients/`
   не содержит `integrator-merge`), и у приёмника (`apps/integrator/src`). Ключ идемпотентности нужен шву, по
   которому что-то ходит; здесь ходить нечему. Удалены `callIntegratorUserMerge`, тип `IntegratorMergeResponse`
   и граница app-layer `apps/webapp/src/app-layer/integrations/integratorUserMergeM2mClient.ts`; из
   `apps/webapp/src/app/api/api.md` убрана строка про `doctor/clients/integrator-merge`, описывавшая
   несуществующий маршрут. Живой `checkIntegratorCanonicalPair` (его зовут `platformUserMergePreview.ts:872`
   и `manualMergeIntegratorGate.ts:55`) НЕ тронут. Что перестал получать живой человек: ничего — вызвать
   удалённое было неоткуда, а попытка дошла бы до 404.

Остаётся открытым ОДИН вопрос владельцу — transactional email (пункт 1): нужен ли ключ операции, и если да,
кто его назначает. Это развилка контракта, а не работа кода.

**РЕШЕНИЕ ВЛАДЕЛЬЦА, 2026-08-20 («согласен» с рекомендацией).** Transactional email по умолчанию **не
дедуплицируется** — новый UUID на каждый вызов сохраняется как есть; дубль письма дешевле, чем проглоченная
осознанная повторная отправка. Если позже понадобится идемпотентный retry (например, фоновый воркер повторяет
отправку после сетевой ошибки), ключ операции для ЭТОГО конкретного retry передаёт явно вызывающий код
(webapp) — автоматического ключа по телу письма не заводить. Кода это решение не меняет: `integratorEmailAdapter.ts`
уже в этом состоянии. Вопрос закрыт; чекбокс D39 всё ещё ждёт независимого аудита (см. ниже), решение по email
на это не влияет.

## D39 verification — 2026-08-20

Каждый из четырёх закрытых путей проверен route-тестом «тот же signed request дважды → один dispatch/write; другой idempotency key → второй dispatch/write».

Команда: `pnpm --dir apps/integrator exec vitest run src/integrations/bersoncare/sendOtpRoute.route.test.ts src/integrations/bersoncare/sendEmailRoute.route.test.ts src/integrations/bersoncare/deliveryIdempotency.route.test.ts --reporter=dot`

Код возврата: `0` (3 файла, 8 тестов).

Инъекция: во всех четырёх receiver временно отключён `tryAcquire`-gate (`false && …`); duplicate assertions покраснели: SMS, rules, email OTP, Telegram/MAX OTP.

Команда инъекции: та же команда Vitest после временной поломки.

Код возврата Vitest при инъекции: `1` (4 падения); поломка откатена до финального прогона.

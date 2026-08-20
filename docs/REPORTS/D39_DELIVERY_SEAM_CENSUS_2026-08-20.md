# D39 — census швов доставки и исполнения webapp → integrator

Дата: 2026-08-20. Это статический проход по коду и схеме репозитория; базы и runtime не затрагивались. «Закрыт» означает устойчивый ключ с документированным duplicate/no-op; чекбокс D39 остаётся для независимого аудита.

| Шов | Файл:строка | Дверь | Ключ идемпотентности | Поведение при повторе | Вердикт |
| --- | --- | --- | --- | --- | --- |
| Доменные исходящие уведомления | `apps/webapp/src/modules/messaging/outboundMessageQueuePort.ts:49` | `pgOutgoingDeliveryQueueWritePort` → `enqueueOutgoingDeliveryIfAbsent` | `public.outgoing_delivery_queue.event_id`, UNIQUE; `event_id = purpose:idempotencyKey` | Конфликт уникальности не создаёт вторую очередь; enqueue — no-op. | Закрыт — замерен 05.08, не перепроверялся. |
| Relay outbound | `apps/webapp/src/modules/messaging/relayOutbound.ts:136` | Прямой signed HTTP `POST /api/bersoncare/relay-outbound` | Postgres `idempotencyPort`; `${organizationId ?? 'global'}:${messageId}:${channel}:${recipient}` | `duplicate`/`skipped`, без второй доставки. | Закрыт — audit PASS `748379f00`, не перепроверялся. |
| Ответ врача в support | `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts:90` | `QueuePort` | `integrator_message_id = webapp-msg:${conversationId}:${idempotencyKey}`; `created` gate | Повтор не создаёт вторую запись/доставку. | Закрыт — замерен 05.08, не перепроверялся. |
| Ingress booking/event gateway | `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts:565` | `eventGateway` с обязательным `idempotencyPort` | Postgres `idempotencyPort`; ключ события | Повтор отсекается до dispatch. | Закрыт — D34, замерен 05.08, не перепроверялся. |
| Синхронизация правила напоминания | `apps/webapp/src/infra/integrator-push/integratorM2mPosts.ts:44`, `:80`; `apps/webapp/db/schema/schema.ts:3108` | Сначала прямой HTTP `POST /api/integrator/reminders/rules`; при ошибке `integrator_push_outbox`/worker | Outbox: `idempotency_key`, UNIQUE `integrator_push_outbox_idempotency_key_key` (`reminder_rule:${integratorRuleId}` в `0025_definer_bodies_that_lived_only_in_dev.sql:179`). HTTP: `rule_${rule.id}_${timestamp}`; receiver принимает optional key, но не читает (`apps/integrator/src/integrations/bersoncare/reminderRulesRoute.ts:37`, `:118`). | Каждый повтор выполняет `writePort.writeDb(reminders.rule.upsert)` и отвечает `200`; duplicate/no-op не сигнализируется. | Находка: outbox-ключ не становится ключом delivery; тихое повторное исполнение. |
| OTP по SMS | `apps/webapp/src/infra/integrations/sms/integratorSmsDelivery.ts:58` | Прямой signed HTTP `POST /api/bersoncare/send-sms` | Нет: тело `{ phone, code }`; receiver генерирует `otp:sms:${randomUUID()}` (`apps/integrator/src/integrations/bersoncare/sendSmsRoute.ts:124`). | Повтор создаёт новую intent/отправку SMS; `duplicate` нет. | Находка: тихий дубль. |
| OTP в Telegram/MAX | `apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.ts:128` | Прямой signed HTTP `POST /api/bersoncare/send-otp` | Нет: тело `{ channel, recipientId, code }`; receiver генерирует `otp:${channel}:${randomUUID()}` (`apps/integrator/src/integrations/bersoncare/sendOtpRoute.ts:105`). | Повтор dispatches второе сообщение с кодом; `duplicate` нет. | Находка: тихий дубль. |
| Email-код и transactional email | `apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts:20` | Прямой signed HTTP `POST /api/bersoncare/send-email` | Нет: body без ключа; receiver генерирует `otp:email:${randomUUID()}` или `email:send:${randomUUID()}` (`apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts:151`). | Повтор dispatches второй email и отвечает обычным `200`. | Находка: тихий дубль. |
| Запрос контакта в мессенджере | `apps/webapp/src/modules/messaging/requestMessengerContact.ts:36` | Прямой signed HTTP `POST /api/bersoncare/request-contact` | `${channel}:${recipientId}:${5-minute bucket}`; durable `integrator.idempotency_keys` через `idempotencyPort` (`apps/integrator/src/integrations/bersoncare/requestContactRoute.ts:15`, `:129`). | Занятый ключ возвращает `200 { status: 'duplicate' }`; на ошибке ключ освобождается (`:140`). | Закрыт. |
| Ручной merge пользователей integrator | `apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts:120` | Прямой signed HTTP `POST /api/integrator/users/merge` | Нет: helper шлёт только winner/loser/dryRun (`:130`), без idempotency header/body. | В `apps/integrator/src` нет точной строки `/api/integrator/users/merge` или `canonical-pair`: повтор получает HTTP-отказ (404), не contract-level duplicate/no-op. | Находка: execution seam без ключа и без найденного receiver-маршрута. |

## Области без дополнительных швов

- Поиск `INTEGRATOR_API_URL` в `apps/webapp/src` дал также `GET /health`, `GET /health/projection` и `canonical-pair`; это read-only probes/gate, не доставка и не исполнение.
- Точные поиски `/api/bersoncare`, `/api/integrator/users/merge`, `fetch(` и `INTEGRATOR_API_URL` в `apps/webapp/src` не нашли иных webapp→integrator mutation endpoints. `operator-health-probe` найден только в `apps/webapp/src/app/api/api.md` и registry как описанный internal job, не как webapp sender.
- Точный поиск `/api/integrator/users/merge|canonical-pair|winnerIntegratorUserId|loserIntegratorUserId` в `apps/integrator/src` не нашёл receiver-кода; это доказательство отказа последней строки, не запрос на исправление.

## Итог

Швы закрыты: 5.

Находки: 5.

1. Правила напоминаний: outbox-ключ не доходит до receiver dedup; повтор тихо исполняет upsert.
2. SMS OTP: повтор создаёт второй `eventId` и вторую отправку.
3. Telegram/MAX OTP: повтор создаёт второй `eventId` и вторую отправку.
4. Email: повтор создаёт второй `eventId` и вторую отправку.
5. Manual integrator merge: нет ключа и в текущем `apps/integrator/src` не найден receiver endpoint; повтор отвергается HTTP.

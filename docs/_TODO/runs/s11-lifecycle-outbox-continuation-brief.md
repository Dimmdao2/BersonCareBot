# Continuation worker — закрыть S11 reliable lifecycle/outbox по зафиксированному аудиту

Сначала прочитай `AGENTS.md`: карту, §1 migrations, §5 common passage/clean architecture, §10a и §10b
целиком, §24. Authority: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, этап S11
`PAY-REL-01..03` и `PAT-NOTIF-01..03`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §21 и §24.1.
Обязательный handoff: `docs/_TODO/runs/s11-lifecycle-outbox-audit1.md`, findings F1–F6 и сохранённые
acceptance-тесты коммита `17c9df6cc`.

## Цель одного хода

Довести S11 целиком до land-ready, не добавляя новые тесты и не создавая вторую очередь или второй inbox.
Исправить production-код так, чтобы сохранённые красные acceptance-тесты стали зелёными, и закрыть оставшуюся
инвентаризацию существующих patient-visible booking/visit/money producers.

## Обязательная архитектура — расширить существующий общий проход

1. Единственная durable очередь — `public.outgoing_delivery_queue`. Добавь tenant-owned internal lifecycle kind
   с постоянным unique `event_id`, retry/backoff, reclaim и terminal incident/DLQ через существующий resident
   worker. Не используй `dispatching` для безопасно повторяемой внутренней работы: crash должен оставлять её
   reclaimable/retryable.
2. Forward migration должна заменить существующий atomic root `app.settle_booking_payment_webhook_event` и
   вставлять payment lifecycle job в ту же транзакцию, где фиксируются provider event, payment/history и
   appointment status. SQL/commit failure => webhook non-2xx; commit settlement+job => можно отвечать 200.
   Повтор provider event/job не дублирует деньги, inbox или внешние эффекты.
3. После появления durable root убрать зависимость от ненадёжного post-commit
   `onAppointmentPaymentConfirmed`/request-local `Next after()` для факта captured payment. При этом repair
   `patient_bookings`, lifecycle steps, calendar/reminders и сообщения должны выполняться consumer'ом и быть
   независимо идемпотентными.
4. Единственный persistent Notifications store — существующие `support_conversation_messages`/
   `patientNotifications`. Ошибка append — retryable failure, а не `200`/skip. Stable queue `event_id` и inbox
   `integrator_message_id` постоянны; 24-часовой integrator step key не считается постоянной дедупликацией.
5. Channel preferences и `suppressPatientNotification` подавляют только внешние channel/push delivery. Они не
   могут подавлять persistent inbox, calendar, reminder materialization или сам lifecycle event.
6. Transient Google Calendar failure должен освобождать step и оставаться retryable; уже успешный другой step
   не повторяется.

## Полный producer inventory, который должен сойтись в Notifications

Используй реально существующие факты, не изобретай новые бизнес-события:

- confirmed booking creation из patient browser/widget/app и staff manual routes;
- booking awaiting payment;
- rescheduled;
- cancelled и существующий no-show путь;
- appointment reminder — inbox fact должен появляться в due time даже при нуле внешних каналов;
- captured online payment и cash payment;
- online/cash refund и существующий prepayment retention fact;
- существующие patient-visible visit statuses только если в production уже есть такой факт/producer. Аудит
  ошибочно не должен превращать отсутствующий продуктовый producer в новую функцию: если его нет, зафиксируй
  это в evidence как несуществующий producer, а не выдумывай событие.

Каждый источник должен использовать общий durable passage. Нельзя оставлять browser/widget/app или staff path
на best-effort HTTP/direct dispatch, если из-за этого один и тот же факт исчезает из Notifications. Внешние
Telegram/MAX/email/web-push остаются отдельными channel consumers того же факта и не определяют наличие inbox.

## Точный зафиксированный oracle

Новых тестов не писать: независимый аудитор уже создал их. Сначала запусти сохранённые наборы и подтверди
исходный красный baseline, затем исправляй production-код и доведи тот же набор до зелёного:

```bash
pnpm --dir apps/webapp exec vitest --run \
  src/modules/payments/providerWebhookSettlement.test.ts \
  src/modules/patient-notifications/patientWebPushNotify.unit.test.ts \
  src/app-layer/booking/staffBookingIntegratorEvent.d14.test.ts
pnpm --dir apps/integrator exec vitest --run \
  src/integrations/bersoncare/bookingLifecycleRoute.stepIsolation.test.ts \
  src/integrations/bersoncare/bookingLifecycleRoute.dedup.test.ts \
  src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts
```

Затем прогони focused tests для изменённых payment/booking/queue paths, webapp и integrator typecheck, lint
изменённых production paths, а для миграции — только документированные static/generation проверки внутри
worktree. Не ходи в живую БД, не поднимай live server, не запускай full CI, не deploy и не push.

## Границы

Разрешены только payment/booking/patient-notifications/messaging roots, relevant API/DI, существующая
`outgoing_delivery_queue`/worker/ports, forward migration + generated metadata/privilege declaration при
необходимости, adjacent module docs и S11 evidence. Не менять acceptance-тесты аудитора ради зелёного.
Не создавать новый notification store, queue table, cron или прямую provider delivery из business transaction.

В конце обнови S11 чекбоксы только если каждый пункт реально закрыт, закоммить явные пути (не `git add -A`),
оставь дерево чистым и отчитай SHA, migration, точные команды/результаты и остаточные блокеры. Следующего хода не
будет; не заканчивай в ожидании фонового процесса.

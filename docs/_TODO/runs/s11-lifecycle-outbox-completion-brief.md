# Completion worker — S11 durable producers and Notifications inventory

Сначала прочитай `AGENTS.md`: карту, §1 migrations, §5, §10a–§10b, §21/§21a и §24. Authority:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` S11 `PAY-REL-01..03`,
`PAT-NOTIF-01..03`; `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §21/§24.1. Handoff обязателен:
`docs/_TODO/runs/s11-lifecycle-outbox-audit1.md` и `docs/_TODO/runs/s11-lifecycle-outbox-audit2.md`.

Работай от candidate `1daecd17b` + audit artifact `cf27bb43f`. Предыдущие acceptance tests не менять и новых
не писать: это product correction/completion, тот же oracle уже создан независимым аудитором.

## 1. Закрыть два core finding audit 2

### F1: projection repair — часть durable job

После settlement commit процесс может умереть до любого request-local callback. Resident worker обязан из одного
durable payment-level job самостоятельно выполнить тот же конечный путь, который раньше держал
`createAppointmentPaymentConfirmedHandler`: восстановить `patient_bookings`, собрать факты payment/appointments,
запустить lifecycle/calendar/reminders/messages/inbox и только затем завершить queue row.

Не дублируй эту бизнес-логику в integrator/SQL. Предпочтительная минимальная консолидация: параметризовать и
переиспользовать существующий webapp payment-confirmed handler за подписанным M2M endpoint/port, который resident
worker вызывает по stable payment job. Endpoint обязан быть idempotent и возвращать retryable failure, если
projection/common lifecycle не завершены. Request webhook больше не должен зависеть от post-commit callback.

### F2: один payment fact, multi-slot semantics и channel settings

Outbox row должен быть один на immutable payment fact, не один на appointment. Durable consumer заново читает
канонические данные и текущие notification settings через существующие webapp ports, строит тот же агрегированный
список slots и те же suppression/message decisions, что прежний handler: одно patient payment message и одно
doctor message на payment, без нескольких feed rows на один доменный факт. Stable queue key и inbox message id
должны быть payment-level. Убери race, при котором старый callback и durable worker могут захватить разные
semantics под одинаковыми step keys.

## 2. Завершить весь существующий producer inventory через ту же очередь

Каждый уже существующий patient-visible факт должен создавать durable internal row в той же business transaction
либо в уже существующем атомарном producer root. Post-commit `Next after()`, best-effort HTTP/direct dispatch и
логирование ошибки не являются гарантией.

- confirmed booking creation и awaiting-payment creation: patient browser/widget/app и staff manual;
- patient/staff reschedule;
- patient/staff cancel и существующий no-show факт;
- due appointment reminder: существующая `appointment_reminder` row должна в due time также создать/доставить
  channel-independent Notifications fact даже при нуле внешних каналов;
- captured online payment (core выше) и cash payment;
- online/cash refund и существующий `prepayment_retained` fact.

`completed`/`visit_confirmed` НЕ добавлять: audit2 доказал, что patient cabinet умеет отображать статус, но
действующего lifecycle producer/event registry нет; это owner question, не scope S11.

Расширяй существующие atomic booking/payment/reminder roots и `outgoing_delivery_queue`; не создавай вторую
таблицу/outbox/inbox. Для всех internal rows: stable unique event id, tenant scope, reclaimable `processing`,
retry/backoff/dead/operator incident, никакого `dispatching`. Persistent feed всегда пишется в существующий
`patientNotifications` store до внешних channels; channel preferences подавляют только Telegram/MAX/email/push.
Ошибка feed append всегда retryable.

## 3. Проверки и сдача

Сначала и после правки прогони неизменённые audit1 acceptance-наборы из audit artifacts. Затем focused tests для
каждого затронутого booking/payment/reminder/queue path, webapp + integrator typecheck, lint production paths,
migration order/generation/privilege gates. Тесты аудитора не редактировать ради зелёного. Live DB/server, full CI,
deploy и push не запускать.

Обнови plan S11 только если каждый перечисленный producer действительно вошёл в durable common passage. В
evidence явно назови atomic root каждого producer и stable key. Закоммить только явные пути, оставь дерево чистым,
отчитай SHA и точные команды. Не заканчивай ход частичным результатом без перечисления незакрытых owner IDs;
следующего хода не будет.

# Worker — S11 booking lifecycle producer correction after independent audit

Прочитай `AGENTS.md`: карту, §1/§1b migrations, §5, §10a–§10b, §21/§21a и §24. Работай в том же
`wt/payment-lifecycle-outbox` поверх exact candidate `567ca1cda` и committed audit/tests из
`docs/_TODO/runs/s11-booking-producers-audit.md`. Authority: S11 `PAY-REL-01..03`, `PAT-NOTIF-01..03`,
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §24.1 и findings F1–F6 этого аудита.

Источник оракула: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, S11 — «все события должны идти
в экран „Уведомления“ через lifecycle/push-путь»; `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §24.1 — «Обязательно
все уведомления идут через очередь и ретраи — не должно быть потери вообще никаких сообщений в системе. [...]
Сначала в одной транзакции положить в очередь, потом воркер сразу отправляет, не ждёт минуту».

Это correction того же bounded scope. Не добавляй новые тесты: сохрани независимые acceptance tests аудитора и
доведи тот же набор до зелёного. Не запускай новый blind audit, UI/DOM/copy tests, full CI, execute, live UI,
deploy или push. Не расширяй scope на money/reminders/visit/reconciliation.

## Исправить F1–F6 одним общим passage

1. **Canonical replay не зависит от post-commit patient projection.** Signed lifecycle endpoint читает
   canonical appointment и для transition — точный immutable history row. Канонические appointment/history
   поля являются authority для времени, статуса, organization и patient; `patient_bookings` допустим только как
   проверенное optional enrichment/repair, но его отсутствие или запаздывание не блокирует calendar, reminders,
   staff effects и persistent Notifications. Не добавляй route-local best-effort producer или второй store.
   Расширь существующий BookingEngine/port named read минимально; не читай Drizzle из route.

2. **Exact immutable binding.** Для `historyId` fail-closed проверь organization, appointment id и соответствие
   `fact ↔ event_type`. Идемпотентный ключ должен точно равняться ожидаемому
   `booking.lifecycle:<fact>:<historyId|appointmentId>`, а не только иметь подходящий suffix. Если projection
   существует, её canonical appointment и user должны совпасть с appointment; неверная projection даёт `409` и
   ноль side effects. Отсутствующая projection не подменяет canonical authority и не становится вечным `503`.

3. **Awaiting payment остаётся awaiting payment.** Добавь этот существующий факт в общий lifecycle schema/handler
   как `booking.awaiting_payment`/соответствующий patient variant, не своди к confirmed `booking.created` и не
   создавай новый booking mode. Возьми действующий payment intent/deadline через существующий payment service/port
   и существующий patient-safe payment-link builder; persistent Notifications и разрешённые внешние каналы
   получают корректный факт ожидания оплаты. Отсутствие обязательного canonical payment binding должно
   retry/fail-closed, а не лгать «Вы записаны».

4. **Immutable occurrence доходит до конечного inbox dedupe.** Протяни queue event/history identity отдельным
   типизированным полем через существующий lifecycle payload и patient notification boundary. `bookingId` остаётся
   ссылкой на запись, но `integratorMessageId`/stable delivery key различает два честных reschedule одной записи и
   дедуплицирует повтор того же transition. Не выводи occurrence id парсингом display-текста.

5. **Suppression только внешней доставки.** Для rescheduled, как для created/cancelled, явный
   `suppressPatientNotification` убирает patient Telegram/MAX/email leg, но сохраняет persistent Notifications,
   calendar/reminders и разрешённые staff effects. Не возвращай ранний общий `return`.

6. **Terminal incident.** Общий terminal failure helper для `booking_lifecycle` обязан распознавать и
   `payloadJson.bookingLifecycle`, и ранее принятое `paymentCaptured`, создавать один стабильный low-cardinality
   operator incident без PII/raw payload, затем оставлять row dead. Сохрани retry/backoff/reclaim semantics и не
   ставь internal row в `dispatching`.

Удали оставшиеся совместимые post-commit calls, если после исправления они по-прежнему достижимы только как no-op
либо способны превратить уже committed booking в HTTP failure. Для scoped facts должен остаться один producer и
один durable replay path. Не меняй продуктовые FSM/status rules и не добавляй `completed`/`visit_confirmed` в этот
этап.

## Миграция и права

Если меняется migration/function body, сохрани timestamp-forward identity либо сделай новый forward migration по
канону; никаких GRANT/REVOKE/POLICY в migration. Письменно обнови разбор: каждая новая/изменённая function, owner,
runtime role, нужные relation/column operations и declaration gap. Сгенерированные dev/test/prod privileges должны
совпасть с declaration. Выполни owner-aware rollback-only named-DEV preflight точного финального candidate.

## Acceptance

- все сохранённые красные tests из audit становятся зелёными: history/patient binding, awaiting-payment,
  two-reschedule occurrence dedupe, reschedule suppression, terminal incident;
- transient worker retry test остаётся зелёным;
- существующие booking create/manual/widget/app, lifecycle/payment-captured, patient Notifications и payment
  regression suites остаются зелёными;
- webapp/integrator typecheck и scoped lint, migration order/privilege generation/static gates, `test:db-privileges`
  и `git diff --check` проходят;
- audit artifact дополняется correction evidence без переписывания исходного FAIL/verdict.

Закоммить только явные paths этого correction в ветку worktree и оставь дерево чистым. В отчёте перечисли F1–F6,
точный final SHA, команды/результаты и отдельный письменный privilege analysis.

# S11 payment-level replay correction — audit 3

Дата: 2026-09-18

Роль: независимый auditor-live, один проход correction F1/F2 и новой signed M2M поверхности

Candidate: `9f2c3fdc7e0464575b0815a1fcd86682f4f1882e`

Base: `1daecd17bcaddcda8f2c6e151f6c3617123cf3d0`

Authority: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` S11;
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §21, §24.1;
`docs/_TODO/runs/s11-lifecycle-outbox-audit2.md` F1/F2.

## Verdict

**FAIL correction.** Payment-level queue shape, signed client call, отключение request-local callback и
переиспользование прежнего aggregation/settings handler построены. Candidate нельзя принимать: штатный
owner-aware preflight не создаёт trigger, replay всё ещё успешно подтверждает частичный projection, endpoint
не связывает payment/appointments/user с tenant, а исчерпание M2M retries не создаёт обязательный операторский
инцидент.

Общий producer inventory намеренно не переаудирован: его прежний `FAIL` остаётся отдельным worker-этапом.

## Correction surface

| Поверхность                                      | Verdict                             | Evidence                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Один payment-level queue row                     | PASS по коду, но не применимо до F1 | `20260918T230000_payment_lifecycle_one_fact.sql:35-60` агрегирует appointment ids и пишет `event_id = booking.payment_captured:<paymentId>` с `ON CONFLICT (event_id) DO NOTHING`. Та же функция заменяется через `CREATE OR REPLACE`; существующий trigger продолжает ссылаться на неё, второго trigger path нет. |
| Migration / privilege replacement                | **FAIL**                            | Owner-aware rollback-only preflight падает при `CREATE TRIGGER`: F1.                                                                                                                                                                                                                                               |
| Webhook callback race                            | PASS по composition                 | `buildAppDeps.ts:1186-1188` больше не передаёт `onAppointmentPaymentConfirmed` в webhook payments service; handler экспортируется только для durable route (`:2327-2331`).                                                                                                                                         |
| Signed worker → webapp                           | PASS для транспорта                 | Worker вызывает `processCapturedBookingPayment`, общий client подписывает raw JSON HMAC и требует JSON `ok === true`; non-ok бросается до `queueMarkSent` (`outgoingDeliveryWorker.ts:680-694`).                                                                                                                   |
| HMAC freshness / JSON schema / idempotency key   | PASS                                | Route проверяет timestamped HMAC, strict Zod body и точный payment-level key до handler (`route.ts:20-45`).                                                                                                                                                                                                        |
| Tenant + payment/org/user binding                | **FAIL**                            | Tenant principal устанавливается, но payment и payload relations не сверяются: F3.                                                                                                                                                                                                                                 |
| Projection repair и прежняя multi-slot semantics | **FAIL**                            | При полном projection handler сохраняет одно patient/doctor message и suppression остальных slot-events; при отсутствующем slot молча строит частичный результат: F2.                                                                                                                                              |
| Transient downstream failure                     | PASS до исчерпания                  | Route отвечает `503`, worker бросает и общий tick переводит row в retry/backoff.                                                                                                                                                                                                                                   |
| Terminal operator incident                       | **FAIL**                            | Payment M2M branch попадает в generic finalizer, который на последней попытке только ставит `dead`: F4.                                                                                                                                                                                                            |

## MUST FIX findings

### F1 — exact candidate не проходит owner-aware migration preflight

Достижимый сценарий: штатный DEV preflight исполняет pending `20260918T200000` сначала от
`app_seam_payment_webhook_owner`, затем переключается на `app_object_owner` для `CREATE TRIGGER`.
`app_object_owner` не имеет `EXECUTE` на только что созданную trigger function; declaration оставляет
`execute: []`. PostgreSQL останавливает транзакцию на `permission denied for function
app.enqueue_captured_booking_payment_lifecycle`, поэтому ни старый outbox root, ни correction не устанавливаются.

Impact: deploy/migration останавливается до runtime; `PAY-REL-01` не существует в БД. Нарушен обязательный §1
owner-aware preflight gate.

Evidence:

- `apps/webapp/db/drizzle-migrations/20260918T200000_payment_settlement_lifecycle_outbox.sql:105-110` — trigger
  создаётся от `app_object_owner` поверх функции другого owner.
- `deploy/postgres/privileges/declaration.ts:26945-26955` — функция объявлена с `execute: []`; declaration также
  сохраняет старые `patient_bookings` и per-appointment evidence, хотя correction body их больше не использует,
  и не перечисляет новые `chain_position` / `start_at` из replacement body.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — **FAIL,
  exit 3**, exact error выше.
- После отказа команда
  `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -At -F $'\t' -c "SELECT pg_catalog.to_regprocedure('app.enqueue_captured_booking_payment_lifecycle()')::text, EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'booking_payment_lifecycle_outbox_after_settlement' AND NOT tgisinternal), (SELECT count(*) FROM drizzle.__drizzle_migrations WHERE tag IN ('20260918T200000_payment_settlement_lifecycle_outbox','20260918T230000_payment_lifecycle_one_fact'));"`
  вернула `<null>\tfalse\t0`: функция/trigger/ledger не остались, rollback чистый.

### F2 — отсутствующий slot projection всё ещё считается успешным replay

Достижимый сценарий: payment-level row обещает два оплаченных appointment. Для первого
`patient_bookings` подтверждается, для второго `markConfirmedByCanonicalAppointment` и повторное чтение дают
`null` (ровно crash/incomplete projection из audit2 F1). Handler молча отбрасывает второй slot, собирает
aggregation только по первому и возвращает success; route кэширует `200`, worker ставит queue row в `sent`.

Impact: второй `patient_bookings` навсегда остаётся устаревшим, из payment message исчезает оплаченный slot,
а повторов больше нет. Нарушены `PAY-REL-01` и `PAY-REL-02`.

Evidence:

- `appointmentPaymentConfirmedHandler.ts:31-38` фильтрует неподтвердившиеся rows и отказывает только когда
  `confirmed.length === 0`; частичный набор проходит дальше.
- `payment-captured/route.ts:48-52` любой resolved handler кэширует как success.
- Новый acceptance-test
  `appointmentPaymentConfirmedHandler.d14.test.ts:183-213` использует независимый oracle S11: либо весь
  projection восстановлен, либо job остаётся retryable; ложного payment event тест не требует.
- `pnpm --dir apps/webapp exec vitest --run src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts`
  — **FAIL: 1 failed, 5 passed**; assertion: promise resolved `undefined` instead of rejecting. Candidate уже
  содержит названную поломку, поэтому дополнительная искусственная production mutation по §24.5 не нужна и не
  вносилась.

### F3 — signed endpoint не проверяет binding payment ↔ organization ↔ appointments ↔ patient

Достижимый сценарий: holder подписанного M2M пути передаёт organization A, appointment ids организации A, но
payment id организации B и/или произвольный `platformUserId`. Route проверяет только UUID-форму, HMAC и равенство
idempotency key переданному payment id, затем устанавливает principal A и вызывает handler. Handler вообще не
принимает `organizationId`, не загружает payment и использует входные `paymentId` / `platformUserId` как event key
и адресата. Свой appointment A может быть подтверждён чужим payment id; другой patient внутри A может стать
адресатом lifecycle event.

Impact: malformed/corrupted durable payload или другой подписанный integrator caller может подтвердить и
уведомить не тот booking, а endpoint ответит `200`. Это прямое нарушение brief: foreign org/payment must be
fail-closed.

Evidence:

- `payment-captured/route.ts:9-14,33-49` — schema и tenant principal есть, payment lookup/binding нет.
- `appointmentPaymentConfirmedHandler.ts:15-19` — вход handler не содержит organization; `:80-84` использует
  непроверенные payment/user только в конечном lifecycle payload.
- Поведенческий fake-test не добавлен: без production binding port он мог бы только продублировать желаемую
  проверку заглушкой и создать ложную защиту, что запрещено §10a. Finding следует из достижимого публичного
  signed route и фактических конечных writes.

### F4 — terminal failure нового M2M replay не открывает operator incident

Достижимый сценарий: webapp route остаётся недоступен/возвращает `503` все попытки payment row. Worker правильно
бросает ошибку и делает backoff, но на последней попытке `finalizeClaimedRowFailure` вызывает только
`queueMarkDead`. В отличие от прежнего `runBookingLifecycleSteps`, новый branch не вызывает
`recordOperatorFailureIncident`.

Impact: lifecycle оплаты терминально теряется без обязательного operator incident; остаётся только dead queue
row/log. Нарушен `PAY-REL-02`.

Evidence:

- `outgoingDeliveryWorker.ts:680-694` — новый branch обходит step runner.
- `outgoingDeliveryWorker.ts:192-208,1314-1327` — generic failure path reschedules или marks dead без incident.
- `bookingLifecycleRoute.ts:184-218` — operator incident существует только внутри прежнего step runner, до
  которого M2M transport/projection failure не доходит.

## Privilege analysis (§1)

1. `20260918T230000` не создаёт второй объект: заменяет тело
   `app.enqueue_captured_booking_payment_lifecycle()`; trigger остаётся единственным и вызывает эту же signature.
2. Function остаётся `SECURITY DEFINER`, owner `app_seam_payment_webhook_owner`; trigger DDL из предыдущей
   migration выполняется под `app_object_owner`.
3. Replacement body нужны `SELECT`/row-lock права на intents, `SELECT` на payments/appointments и `INSERT` в
   outgoing queue. Generated grants дают runtime owner эти relation surfaces; static row-lock gate зелёный.
4. Реальный create-trigger privilege отсутствует до reconcile, поэтому полный contract не исполним (F1).
   Declaration одновременно осталась описанием старого body; generated artifacts побайтно соответствуют именно
   этой устаревшей declaration, что объясняет, почему static generation gate не обнаружил F1.

## Executed evidence

Прежний oracle запущен без изменений до нового acceptance-test:

| Command                                                                                                                                                                                                                                                             | Result                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `pnpm --dir apps/webapp exec vitest --run src/modules/payments/providerWebhookSettlement.test.ts src/modules/patient-notifications/patientWebPushNotify.unit.test.ts src/app-layer/booking/staffBookingIntegratorEvent.d14.test.ts`                                 | PASS: 3 files, 20 tests.                   |
| `pnpm --dir apps/integrator exec vitest --run src/integrations/bersoncare/bookingLifecycleRoute.stepIsolation.test.ts src/integrations/bersoncare/bookingLifecycleRoute.dedup.test.ts src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts` | PASS: 3 files, 13 tests.                   |
| `pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts`                                                                                       | PASS: 2 files, 30 tests.                   |
| `pnpm --dir apps/webapp exec vitest --run src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts src/modules/payments/service.test.ts`                                                                                                                | PASS before audit test: 2 files, 24 tests. |

Focused shared route/worker infrastructure and correction test:

| Command                                                                                                                                                                               | Result                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `pnpm --dir apps/webapp exec vitest --run src/app/api/integrator/workspace-module-status/workspaceModuleStatus.route.test.ts src/modules/booking-notifications/settings.unit.test.ts` | PASS: 2 files, 5 tests.                      |
| `pnpm --dir apps/integrator exec vitest --run src/infra/adapters/webappEventsClient.materializeWake.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts`            | PASS: 2 files, 22 tests.                     |
| `pnpm --dir apps/webapp exec vitest --run src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts`                                                                       | Expected audit RED: 1 failed, 5 passed (F2). |

Direct candidate-specific route/worker tests did not exist. Exact search:
`rg -n "payment-captured|processCapturedBookingPayment|paymentCaptured" apps/webapp/src apps/integrator/src --glob '*.test.ts' --glob '*.test.tsx' --glob '*.spec.ts'` — no matches.

Gates:

| Command                                                                                                                                                    | Result                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir apps/webapp typecheck`                                                                                                                         | PASS.                                                                                                                            |
| `pnpm --dir apps/integrator typecheck`                                                                                                                     | PASS.                                                                                                                            |
| `pnpm --dir apps/webapp exec eslint src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts`                                                  | PASS.                                                                                                                            |
| `bash apps/webapp/scripts/check-drizzle-migration-order.sh`                                                                                                | PASS.                                                                                                                            |
| `pnpm run check:db-privileges-generated`                                                                                                                   | PASS: dev/test/prod privilege, allowlist and port-context artifacts match declaration.                                           |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm run test:db-privileges"`                                                                                     | PASS: `node --test` reported 391 tests, 188 passed, 203 skipped, 0 failed.                                                       |
| `pnpm exec prettier --check apps/webapp/src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts docs/_TODO/runs/s11-payment-replay-audit3.md` | PASS.                                                                                                                            |
| `git diff --check`                                                                                                                                         | PASS.                                                                                                                            |
| `bash deploy/host/migrate-dev.sh --preflight`                                                                                                              | Not a candidate result: rejected before DB access by the documented worktree env-path guard.                                     |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`                                                      | **FAIL, exit 3:** `permission denied for function app.enqueue_captured_booking_payment_lifecycle` (F1); rollback verified above. |

Не запускались по brief: full CI, live UI/server, migration execute, deploy, push. Product code не изменялся.

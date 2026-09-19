# S11 — итоговый интеграционный аудит финансового контура

Дата: 2026-09-19
Роль: `auditor-live`
Кандидат: `46e39d7d63f2bdc6010a86552e59e0185d7562a0` (`wt/finance-core-fix`)
Authority: `APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, `OWNER_PRODUCT_RULES.md` §24,
`s11-finance-core-final-audit.md`, `s11-finance-lifecycle-final-audit.md`.

## Вердикт: FAIL

Интегрированный SHA исправляет прежние F1–F4 и lifecycle F1–F2, но не проходит три обязательных
границы: отмена и durable refund job не атомарны, полный возврат отправляет второй fiscal receipt,
а декларации прав обеих новых миграций расходятся с их исполняемыми телами. Production-код в этом
аудите не менялся.

## MUST FIX

### MF1 — отмена и durable refund job не образуют одну DB-транзакцию

**Достижимый сценарий.** `applyCancellation()` коммитит статус, `be_appointment_cancellations`,
history и timeline одной Drizzle-транзакцией (`pgBookingAppointmentLifecycle.ts:627-724`). Только
после возврата из неё staff-путь вызывает provider (`staffManualCancelAfterCanonical.ts:34-49`), а
patient-путь делает то же в `patient-booking/service.ts:584-614`. Queue enqueue находится лишь в
request-local `catch`. Миграция `20260919T130000_*` создаёт вызываемую функцию, но не trigger и не
запись queue внутри cancellation-транзакции.

Процесс можно завершить после commit отмены и до `applyCancelPaymentOutcome()`, между ошибкой
provider и `catch`, либо во время отдельного enqueue. В БД останется отменённая оплаченная запись без
`appointment_payment_reconciliation_refund`; worker никогда не узнает о возврате.

**Impact.** Пациент не получает причитающийся возврат, а каноническая отмена уже необратимо видна.
Это прямое нарушение обязательного owner-инварианта S11. Request-local catch этот класс падения не
закрывает.

### MF2 — полный YooKassa refund отправляет запрещённый второй fiscal receipt

**Достижимый сценарий.** `refundAppointmentPaymentOnce()` безусловно строит и передаёт `receipt` для
любого размера refund (`payments/service.ts:417-429`). Для полного возврата уже фискализированного
платежа контракт в brief требует использовать исходный чек и не отправлять второй; partial refund,
наоборот, обязан передать исправленные items.

Новый независимый acceptance-тест вызывает публичное поведение сервиса с refund `10_000` на платёж
`10_000` и наблюдает внешний аргумент provider. Команда
`pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts`
даёт `1 failed | 14 passed`: в полном refund присутствует `receipt`.

**Impact.** Provider может отклонить возврат либо создать лишнюю фискальную коррекцию; деньги и
кассовый учёт расходятся. Partial-ветка отдельно зелёная и сохраняет обязательный receipt.

### MF3 — privilege surface новых миграций не соответствует их телам

Официальный parser `function-body-surface.mjs`, применённый к действующим schema artifacts и
`declaration.portContext.functions`, дал `RELEVANT_GAPS=5` следующей точной командой:

```bash
node --experimental-strip-types --input-type=module -e "import fs from 'node:fs'; import { declaration } from './deploy/postgres/privileges/declaration.ts'; import { activeSchemaArtifacts, compareFunctionSurfaces, parseExecutableFunctions, parseTriggers } from './deploy/postgres/privileges/function-body-surface.mjs'; const sql=activeSchemaArtifacts().map((file)=>fs.readFileSync(file,'utf8')).join('\\n'); const wanted=['app.apply_booking_payment_provider_terminal_observation()','app.enqueue_booking_payment_refund_reconciliation(uuid)']; const gaps=compareFunctionSurfaces(parseExecutableFunctions(sql),declaration.portContext.functions,parseTriggers(sql)).filter((gap)=>wanted.some((signature)=>gap.startsWith(signature))); console.log(gaps.join('\\n')); console.log('RELEVANT_GAPS='+gaps.length);"
```

- `090000`: terminal-observation trigger реально требует `SELECT,UPDATE` на
  `be_payment_intents`, декларация содержит только `UPDATE`; `SELECT` на
  `be_payment_provider_events` объявлен, хотя trigger использует `NEW` и не читает relation.
- `130000`: оба `FOR KEY SHARE` требуют `SELECT,UPDATE` на `be_appointments` и
  `be_appointment_cancellations`, объявлен только `SELECT`; `ON CONFLICT ... DO NOTHING` требует
  `INSERT,SELECT` на `outgoing_delivery_queue`, объявлен только `INSERT`.

Штатный targeted gate подтвердил не только декларативный drift, но и реальный недостающий runtime
grant. Команда

```bash
node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/named-root-column-mapping.test.mjs deploy/postgres/privileges/row-lock-privileges.test.mjs deploy/postgres/privileges/appointment-prepayment-least-privilege.test.mjs deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs
```

дала `114 passed | 1 failed`: `app.enqueue_booking_payment_refund_reconciliation(uuid) ->
public.be_appointment_cancellations (app_seam_payment_webhook_owner)` не имеет UPDATE-class права во
всех трёх generated DB declarations.

**Impact.** Штатный live privilege reconcile остановит выкладку на surface mismatch; если его
обойти, `FOR KEY SHARE` на cancellation упадёт с `42501`, и новый refund retry-path останется
неработоспособным.

## Повторная приёмка core F1–F6

| Finding | Итог | Доказательство |
| --- | --- | --- |
| F1 invoice `in-*` не является payment id | PASS | Adapter сначала читает invoice и берёт `payment_details.id`; acceptance покрывает реальный `/refunds` payload. |
| F2 `pending/canceled/unknown` не успех | PASS | Refund принимается только при `status === 'succeeded'`; negative acceptance зелёные. |
| F3 удержать только обязательную предоплату | PASS | `min(appointment share, prepaymentRequiredMinor)`, остаток уходит в refund со стабильным ключом; money acceptance зелёный. |
| F4 partial refund меняет канонический статус | PASS | После суммы succeeded refunds статус становится `partially_refunded`, при полном — `refunded`; acceptance зелёный. |
| F5 fiscal receipt соответствует обоим режимам | **FAIL** | Partial receipt есть, но full refund также получает receipt — MF2. |
| F6 refund после committed cancellation не теряется | **FAIL** | Durable enqueue отделён от cancellation commit — MF1. |

## Остальной обязательный scope

- Конкурентный immediate refund и worker replay используют один `applyCancelPaymentOutcome`, один
  DB-serialized refund path, стабильный provider idempotency key и уникальный provider refund ref.
  Acceptance K3/K4/K5/K6 подтверждает отсутствие двойного refund/history.
- Сумма multi-slot платежа делится на число appointments; сценарий `20_000 / 2` возвращает ровно
  `10_000` для одной записи.
- Refund worker принимает только signed internal route, восстанавливает organization principal и
  читает appointment по `organization_id`; queue payload несёт тот же tenant.
- Terminal incident/reclaimability: общий finalizer включает
  `appointment_payment_reconciliation_refund`; при падении записи incident row остаётся
  `failed_retryable`, не `dead`.
- Lifecycle merge: multi-slot payment создаёт один patient payment-feed item; для следующих slots
  остаются только технические calendar/reminder events.

## Письменный разбор миграций и прав

### `20260919T090000_booking_payment_reconciliation.sql`

- **Owner/caller.** Таблица и trigger принадлежат `app_object_owner`; definer-функции —
  `app_seam_payment_webhook_owner`. Materializer вызывается `app_worker`, readers/watermark —
  `app_tenant_service`, trigger — только владельцем trigger.
- **Relation/columns.** Checkpoint имеет PK `(organization_id, provider_id)` и FK на
  `be_organizations`; readers ограничены accepted organization. Materializer читает intents/provider
  events/queue и вставляет queue rows; watermark читает/вставляет/обновляет checkpoint. Индекс PK
  покрывает tenant/provider lookup.
- **Trigger/runtime.** AFTER trigger на provider events меняет только unresolved appointment intents.
  Его UPDATE predicate требует SELECT на predicate columns, которого нет в собственной декларации;
  лишний declared SELECT на source relation не заменяет этот пробел.
- **RLS/generated.** Generated reconciliation назначает owner, `ENABLE/FORCE RLS` и fail-closed/
  seam-owner policies для checkpoint; прямых runtime grants в migration нет. Generated artifacts
  byte-current, но body/declaration verifier всё равно отклоняет два surface drift выше.

### `20260919T130000_cancelled_payment_refund_reconciliation.sql`

- **Owner/caller.** Единственная SECURITY DEFINER function принадлежит
  `app_seam_payment_webhook_owner`; execute предназначен для `app_patient` и `app_staff` через
  attested context.
- **Relation/columns.** Читает точный tenant-scoped appointment и последнюю cancellation, вставляет
  существующую `outgoing_delivery_queue`. `event_id = appointment-payment-reconcile:refund:<id>` и
  unique index `uq_outgoing_delivery_queue_event_id` делают enqueue идемпотентным; индекс
  `idx_be_appt_cancellations_appt` покрывает поиск cancellation.
- **FK/locks/RLS.** Queue уже имеет FK organization и tenant RLS; функция работает под seam-owner.
  Оба `FOR KEY SHARE` требуют UPDATE-class ACL. Для cancellations его нет, поэтому runtime path
  падает. `ON CONFLICT` также требует незаявленный SELECT surface.
- **Generated declaration.** Function/capability присутствуют для staff и patient во всех generated
  DB artifacts, но relation surface неверен; наличие EXECUTE не делает тело исполнимым.

Обе миграции имеют `BCB-MIGRATION-OWNER`/`VERIFY` и не содержат `GRANT`, `REVOKE`, role/default-
privilege или policy DDL. Команда

```bash
rg -n "\b(GRANT|REVOKE|CREATE[[:space:]]+ROLE|ALTER[[:space:]]+ROLE|ALTER[[:space:]]+DEFAULT[[:space:]]+PRIVILEGES|CREATE[[:space:]]+POLICY)\b" apps/webapp/db/drizzle-migrations/20260919T090000_booking_payment_reconciliation.sql apps/webapp/db/drizzle-migrations/20260919T130000_cancelled_payment_refund_reconciliation.sql
```

вернула exit `1` без совпадений.

## Выполненные проверки

- `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.bookingLifecycle.s11.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts`
  — `10 passed`.
- `pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts src/infra/payments/yookassaPaymentProvider.unit.test.ts src/infra/payments/paymentProviderIdentity.unit.test.ts src/modules/payments/appointmentPaymentReconciliation.unit.test.ts src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts 'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.route.test.ts' src/app/api/payments/patientAcquiring.route.test.ts`
  — `78 passed | 1 failed`; единственный failure — MF2.
- `pnpm --dir apps/webapp typecheck` и `pnpm --dir apps/integrator typecheck` — PASS.
- `pnpm --dir apps/webapp exec vitest run src/infra/payments/paymentProviderIdentity.unit.test.ts`
  после исправления устаревшей provider fixture — `13 passed`.
- `node deploy/postgres/privileges/migration-order.mjs` — PASS.
- `pnpm run check:db-privileges-generated` — PASS: generated privileges, allowlists и port-context
  artifacts byte-current.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`
  — PASS и ROLLBACK: `pending=2 total=242 reapplied=0 foreign-ledger-rows=4 unapplied=0`. Миграции не
  применялись.
- Targeted privilege suite — `114 passed | 1 failed`, failure описан в MF3.
- Изолированный запуск нового full-refund acceptance — `14 passed | 1 failed` точной командой из
  MF2.
- `pnpm exec eslint apps/webapp/src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts apps/webapp/src/infra/payments/paymentProviderIdentity.unit.test.ts`
  — exit `0`, но оба test-файла штатно исключены ESLint-конфигурацией; lint-проверкой это не считается.

Full CI, push, deploy, migration execute, PROD и TEST не запускались и не затрагивались.

## Изменения аудитора

- Добавлен один независимый acceptance oracle для отсутствия второго full-refund receipt.
- YooKassa test fixture дополнена реально обязательным `status: succeeded`.
- Удалён `staffManualCancelAfterCanonical.unit.test.ts`: он проверял вызов внутреннего mock enqueue
  после `catch`, дублировал реализацию и выдавал post-commit окно за доказательство атомарности.

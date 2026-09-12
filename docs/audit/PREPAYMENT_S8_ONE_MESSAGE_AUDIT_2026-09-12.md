# FAIL — S8 one payment / one message audit

Candidate: `f465a8f8e` + `e8bbb5e99` on `wt/prepayment-s8-one-message`. Authority:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` S8 and the owner decision dated
12.09: one patient message per payment, containing every paid slot.

The later branch merge did not change the audited production paths; this printed nothing before
the audit tests were added:

```text
git diff --stat e8bbb5e99..HEAD -- apps/webapp/src/app-layer/booking/appointmentPaymentConfirmedHandler.ts apps/webapp/src/modules/payments/service.ts apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts apps/webapp/src/modules/patient-booking/patientMessageText.ts apps/webapp/src/modules/patient-booking/doctorMessageText.ts packages/shared-contracts
```

## Classification

- S8.1, S8.3, suppression and S8.4 are repeated money/delivery behaviour: test plus code trace.
- Single-slot compatibility is a one-time byte comparison: source diff plus runtime output, not a
  permanent wording test.
- The two lead corrections are control-flow/order facts: code inspection.
- Message quality is a reader check of runtime output for one, two and three slots.

Blind kill-set was fixed before reading candidate tests: duplicate webhook; partial projection
confirmation; second appointment lookup failing before delivery; batching missed at either service
call site; patient suppression dropped by schema or consumer; per-appointment event/key collapsed;
doctor sent zero or more than once; message-list sorting changing the event that carries the text.

## Findings

### F1 — a partially confirmed projection sends an incomplete batch

S8.2 and S8.3 fail. Concrete input: the payment settlement names `appt-1` and `appt-2`; the patient
projection for `appt-1` is `confirmed`, while `markConfirmedByCanonicalAppointment('appt-2')` and
its fallback read return the still-`awaiting_payment` row. Both appointment ids came from the
already captured canonical payment result.

`appointmentPaymentConfirmedHandler.ts:30-37` silently filters the second input out and continues.
The added acceptance test observes one `booking.payment_captured` event instead of two; the one
patient message also has no second slot. Command:

```text
pnpm --dir apps/webapp exec vitest run src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts
```

Result: 5 tests, 1 failed; `expected ... to have a length of 2 but got 1`. The patient is told about
only part of the paid chain and the missing booking receives no calendar/reminder event.

### F2 — a provider retry cannot resume failed post-commit batch delivery

S8.1 and S8.3 fail. Concrete input: the provider settlement commits one payment with two confirmed
ids; the batch callback throws `booking_event_delivery_failed`. The failure can occur before the
first event (for example while loading settings/timezone), leaving the patient with zero messages,
or after the first per-booking event succeeds and the second exhausts `emitBookingEvent` retries,
leaving the second calendar event absent. On the provider retry the settlement root returns
`outcome: 'already_processed'`.

`service.ts:645-653` invokes the callback only for `outcome === 'captured'`. The added acceptance
test observes only one callback attempt after both webhook deliveries, expected two attempts with
the same appointment batch. Command:

```text
pnpm --dir apps/webapp exec vitest run src/modules/payments/providerWebhookSettlement.test.ts -t "retries the payment-confirmed delivery"
```

Result: 1 failed, 6 skipped; `expected "vi.fn()" to be called 2 times, but got 1 times`. The event
keys themselves are stable, but the replay never reaches them, so the second appointment can stay
without calendar synchronisation permanently.

### F3 — an online multi-slot confirmation exposes internal category keys as service names

S8.2 fails its reader requirement. `canonicalCreate.ts:114-136` creates online projection rows with
`serviceTitleSnapshot: null`; `appointmentPaymentConfirmedHandler.ts:63-68` then substitutes the
raw category enum. This reachable input:

```text
appointments = [
  { serviceTitle: 'rehab_lfk', slotStart: '2027-03-10T09:00:00.000Z' },
  { serviceTitle: 'nutrition', slotStart: '2027-03-11T09:00:00.000Z' }
]
```

produced in `Europe/Moscow`:

```text
Оплата записи подтверждена. Вы записаны на приём:
• 10 мар. 2027 г., 12:00 — rehab_lfk
• 11 мар. 2027 г., 12:00 — nutrition
```

The date/time/list structure is understandable, but `rehab_lfk` and `nutrition` are internal keys,
not human-facing service names.

## Per-item results

### 1. S8.1 — FAIL

Happy path passes: two ids produce two events, with patient text only on the first. Changing the
carrier condition to put patient text on every event made
`pnpm --dir apps/webapp exec vitest run src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts`
fail with two patient texts instead of one; production was restored. Provider duplicate handling
also passes when delivery succeeds: `pnpm --dir apps/webapp exec vitest run
src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts
src/modules/payments/providerWebhookSettlement.test.ts` reported 9/9 passed before the audit tests
were added.

The partial-confirmation and post-commit retry paths are F1/F2. The handler does pre-load all
appointment metadata with `Promise.all` before its event loop; moving `getAppointment` into the
event loop made the new lookup-failure acceptance test red because the first event had already been
emitted. On restored code that test is green and observes zero emissions.

### 2. S8.3 — FAIL

For the happy path, the code emits one event per retained appointment, each with its own `bookingId`
and unchanged key `booking.payment_captured:<paymentId>:<appointmentId>`
(`appointmentPaymentConfirmedHandler.ts:78-99`). Removing `<appointmentId>` made the S8 assertion
red with two identical keys. Changing either `captureIntentSuccess` or provider-webhook back to
per-id callback calls made its respective batching test red with two calls instead of one; both
production mutations were restored.

F1 loses an event before emission; F2 prevents a provider replay from reaching a previously failed
event, so the happy-path key proof is insufficient for S8.3.

### 3. Suppression — PASS

The second event carries `suppressPatientNotification: true` and `doctorNotify: false`.
`bookingLifecycleSchema.ts:27` preserves the flag, and the integrator payment branch at
`bookingLifecycleRoute.ts:872-900` omits the patient step before fallback text can be composed.

The added integrator test parses the event through the production Zod schema and executes the real
lifecycle handler through the final dispatch boundary. `pnpm --dir apps/integrator exec vitest run
src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts` reported 3/3 passed on
restored code. Removing either the schema field or the payment-branch suppression guard made the
same assertion fail with patient recipient `123`; both mutations were restored.

### 4. S8.4 — PASS

The first event alone has `doctorNotify: true` and `doctorMessageText`; later events have
`doctorNotify: false` and no doctor text. Making every event carry the doctor message made the S8
test red with two doctor texts. The integrator honours explicit `doctorNotify: false` through
`shouldNotifyDoctor`; `pnpm --dir apps/integrator exec vitest run
src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts
src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts` reported 28/28 passed before the audit
test was added.

### 5. Single-slot compatibility — PASS

The pre-S8 source at `7e1339684` returned
`Оплата записи подтверждена. ${formatPatientMessageDateTime(slotStart, timeZone)}`. The new
one-element branch returns the same concatenation. A one-off runtime comparison in the default app
display zone (`Europe/Moscow`) printed:

```text
ONE_CURRENT="Оплата записи подтверждена. 11 мар. 2027 г., 12:00"
ONE_BEFORE ="Оплата записи подтверждена. 11 мар. 2027 г., 12:00"
ONE_BYTES_EQUAL=true
```

The existing D14 test that pins this exact wording is not accepted as evidence under AGENTS.md
§10a; the source comparison and one-off byte comparison are the evidence.

### 6. Lead corrections — PASS within S8 scope

Restoring `if (!notifyPatient && !notifyStaff) return` was right for this stage: `git show
7e1339684:...appointmentPaymentConfirmedHandler.ts` shows the guard predates S8, while the worker
removed it. Keeping it preserves the clinic's old disabled-notification behaviour. It still means
disabled notifications suppress calendar/reminders too, but that is the already-recorded owner
fork explicitly excluded from this FAIL.

Sorting is applied to a copy, `[...appointments]`, used only to build message text. The event loop
still iterates the original `appointments`; therefore the first input appointment remains the sole
carrier while the list inside its text is chronological.

### 7. Message quality — FAIL for the online-category input

Named service titles produce readable output for two and three slots, in chronological order. A
single slot preserves the old one-line text. The observed outputs were:

```text
Оплата записи подтверждена. Вы записаны на приём:
• 10 мар. 2027 г., 12:00 — Первичный приём
• 11 мар. 2027 г., 12:00 — Повторный приём

Оплата записи подтверждена. Вы записаны на приём:
• 10 мар. 2027 г., 12:00 — Первичный приём
• 11 мар. 2027 г., 12:00 — Повторный приём
• 12 мар. 2027 г., 18:30 — Консультация
```

F3 is the reachable wording failure when no service-title snapshot exists.

## Final validation

- `pnpm --dir packages/shared-contracts build` passed. The first combined typecheck then found a
  `TS2322` in the new direct-capture test fixture; the fixture was corrected to return the declared
  `BeAppointment`. `pnpm --dir apps/webapp typecheck && pnpm --dir apps/integrator typecheck` then
  passed.
- `pnpm --dir apps/webapp exec vitest run
src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts
src/modules/payments/providerWebhookSettlement.test.ts src/modules/payments/service.test.ts`
  reported 25 passed and the two intentional acceptance failures F1/F2.
- `pnpm --dir apps/integrator exec vitest run
src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts
src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts` reported 29/29 passed.
- `pnpm exec prettier --check apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts apps/webapp/src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts apps/webapp/src/modules/payments/providerWebhookSettlement.test.ts apps/webapp/src/modules/payments/service.test.ts docs/audit/PREPAYMENT_S8_ONE_MESSAGE_AUDIT_2026-09-12.md`
  passed. `pnpm exec eslint apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts apps/webapp/src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts apps/webapp/src/modules/payments/providerWebhookSettlement.test.ts apps/webapp/src/modules/payments/service.test.ts`
  reported zero errors; root ESLint ignored the three webapp test files and printed three warnings.

## NOT CHECKED

- Live provider sandbox retries and real Telegram/MAX/Web Push delivery.
- Live external calendar synchronisation and reminder materialisation.
- DEV/TEST database state and live UI; this pre-landing audit used no database.
- Full application suites and full repository CI; targeted tests and typechecks are the relevant
  gate for the audit-only test changes.
- Production hosts and production data.

# FAIL — S5 payment-link delivery audit

Candidate: `ff9213d7e` (`wt/prepayment-s5-notify`). Authority:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` S5 and
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` K2 `PAY-APPT-09`.

The candidate's production files are unchanged in the audit branch: `git diff --name-only
ff9213d7e..HEAD -- apps/webapp/src/app-layer/booking/bookingCreatedEffects.ts
apps/webapp/src/modules/patient-booking/canonicalCreate.ts apps/webapp/src/modules/payments/service.ts
apps/webapp/src/modules/integrator/deliveryTargetsApi.ts` printed no paths before the audit tests
were added.

## Findings

### F1 — notification configuration failure aborts the response after the booking exists

S5.1/S5.2 and the brief's transaction-safety requirement fail. Concrete input: an otherwise valid
prepayment booking whose payment intent returns a checkout URL, whose row has already reached
`awaiting_payment`, and whose `getBookingLifecycleNotificationSettings()` throws
`notification settings unavailable`.

`pnpm --dir apps/webapp exec vitest run src/app-layer/booking/bookingCreatedEffects.test.ts
src/modules/patient-booking/canonicalCreate.d14.test.ts` failed the audit acceptance test with:

```text
expected { kind: 'error', message: 'notification settings unavailable' }
to equal { kind: 'created', status: 'awaiting_payment' }
```

The failure happens after `markAwaitingPayment` and before `bookingCreatedEffects.apply`. It neither
uses the effect's best-effort error handling nor calls `rollbackChain`. The patient sees a failed
create request although the booking already occupies the slot; a retry can then collide with that
hidden booking.

### F2 — an in-person branch receives the global application's deadline timezone

S5.1 / `PAY-APPT-09` fails for a branch whose IANA timezone differs from the global setting.
Concrete input: branch `Asia/Yekaterinburg`, global `app_display_timezone=Europe/Moscow`, persisted
appointment deadline `2027-03-01T12:20:00.000Z`.

The same command above failed the audit acceptance test because the queued patient text contained
`1 мар. 2027 г., 15:20`; the deadline derived from the persisted appointment in the branch timezone
is `1 мар. 2027 г., 17:20`. The test also observes that the queued text contains the checkout URL
returned by `createAppointmentPaymentIntent`, so the link source itself is correct.

The path is explicit in production: `canonicalCreate.ts` resolves `inPersonCtx.branchTimezone`, but
later calls the effect with `getAppDisplayTimeZone()` instead. This is a silent money defect: the
message states the wrong local cutoff while the underlying instant is correct.

### F3 — one multi-slot payment emits one success message per slot

S5.3 fails. Concrete input: one captured provider settlement with one `paymentId` and two
`confirmedAppointmentIds` belonging to one multi-slot booking.

`pnpm --dir apps/webapp exec vitest run src/modules/payments/providerWebhookSettlement.test.ts`
failed the audit acceptance test: the observable `booking.payment_captured` delivery events had
length `2`, expected `1`. `processProviderWebhook` loops the appointment IDs and invokes
`createAppointmentPaymentConfirmedHandler` for each; each handler emits its own patient message.
The existing duplicate-webhook checks still pass, so a provider retry does not add another round,
but the first webhook already duplicates the success notification for a multi-slot booking.

## Attack results

### 1. Unconfirmed delivery — TEST + READ: pass

The tested route was real resolver output into the real booking delivery effect, ending at the
outbound queue boundary. An unverified primary `user_contacts` email produced no queued row.

Fault injection removed the `emailVerified` rejection in
`resolvePatientNotificationChannels.ts`; then
`pnpm --dir apps/webapp exec vitest run src/app-layer/booking/bookingCreatedEffects.test.ts -t
'реальный резолвер считает неподтверждённым'` failed with an email queue row addressed to
`booking-form@example.test`. The production guard was restored.

Read trace:

- `canonicalCreate.ts` selects by trusted `platformUserId`; booking-form contacts are persisted only
  after delivery resolution and are supplementary contacts, not resolver email authority.
- `app.read_integrator_delivery_target_snapshot` reads only the primary `public.user_contacts`
  email and exposes `emailVerified` from `confirmed_at`.
- `getDeliveryTargetsForIntegrator` passes that fact to `resolvePatientNotificationChannels` and
  returns `emailRecipient` only if email is selected.
- `awaitingPaymentRecipients` accepts only `resolution.selectedChannels`; it has no form-email or
  phone fallback.

Searches used before exact reads:

```text
node /home/dev/brain/tools/code-search.mjs "awaitingPaymentRecipients resolveNotificationChannels bookingCreatedEffects payment link" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "function getDeliveryTargetsForIntegrator emailRecipient verified user_contacts" --repo bcb -k 15
node /home/dev/brain/tools/code-search.mjs "read_integrator_delivery_target_snapshot email verified contact booking form" --repo bcb -k 15
```

### 2. Empty audience versus real delivery failure — TEST: pass for the early-return distinction

On restored production code, `pnpm --dir apps/webapp exec vitest run
src/app-layer/booking/bookingCreatedEffects.test.ts src/infra/repos/pgOutboundMessageQueue.unit.test.ts`
passed. The waiting-payment empty audience produces neither a queue row nor incident; ordinary
`booking.created` empty audience reports `no_channel_bindings`; an enqueue exception reports
`enqueue_failed` and `apply` resolves.

Two targeted mutations were run independently. Making the empty-audience return unconditional made
the ordinary booking test fail with zero incidents instead of one. Removing the incident call from
the enqueue-error catch made the delivery-failure test fail with no `enqueue_failed` report. Both
production mutations were restored. F1 remains a separate failure before `apply` is entered.

### 3. Duplicate or lost message — TEST + READ: fail for multi-slot, pass for retry key

The added waiting-payment retry test observes one stable outbound event key for two applications.
Adding randomness to only the waiting-payment key made
`pnpm --dir apps/webapp exec vitest run src/app-layer/booking/bookingCreatedEffects.test.ts -t
'повтор awaiting-payment'` fail with two keys instead of one; production was restored. The queue
port test above confirms that the persistent boundary treats an existing event ID as not inserted.

A duplicate provider webhook remains idempotent in the existing public webhook test. An immediate
payment produces two distinct intended messages (payment action, then payment success), not two
copies of either one. `apply` is after every `rollbackChain` branch in the prepayment flow; after a
message is queued, only best-effort contact persistence and return remain, so no later rollback can
orphan that queued message. Multi-slot payment success is the failing case described in F3.

### 4. Deadline, link and timezone — TEST + READ: fail for timezone

The audit test derives its expected instant from the appointment input persisted by the booking
engine and observes the final rendered patient text. The same financial snapshot supplies
`appointment.payment_deadline_at`, provider `expiresAt`, and the effect deadline. The exact checkout
URL returned by the intent is present in the output. The IANA source is wrong for in-person bookings
(F2).

### 5. Transaction safety — TEST + READ: fail

The effect itself catches resolver/queue exceptions and reports an incident without rollback. The
new S5 preparation calls (`getBookingLifecycleNotificationSettings` and `getAppDisplayTimeZone`)
are awaited outside that protection after the booking is marked awaiting payment. The concrete
configuration failure is F1.

## Test-evidence rejection under AGENTS.md 10a

- The candidate's `canonicalCreate.d14.test.ts` proof checks an argument passed between our own
  canonical create and delivery-effect functions, then checks only that the deadline is in the
  future. It does not prove equality to the persisted appointment deadline or final delivery.
- The cited `appointmentPaymentConfirmedHandler.d14.test.ts` freezes exact message wording and only
  exercises one appointment. It is not evidence for S5.3 and misses F3.
- The candidate's channel test fixes ordered channel/recipient list shapes and exact copy. Those
  assertions are not evidence. Its useful portion is the observable queue boundary carrying the
  URL and deadline; the audit added a resolver-to-queue unverified-email check with fault injection.

## NOT CHECKED

- Live provider sandbox delivery, real SMTP/Telegram/MAX/Web Push credentials, and worker timing.
- TEST database contents or a live browser booking; this pre-landing audit did not use the shared
  runtime.
- S1-S4 and S6-S7 UI/product behavior outside the S5 brief.
- Production hosts and production data.

# Worker brief — S8: one payment, one message, all slots listed inside

Owner plan — the only source of done:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage **S8** (S8.1–S8.4).

Источник оракула: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` — решение владельца
12.09: «давай так сделаем, чтобы два сообщения не отправлять» — одно сообщение на платёж, внутри
перечислены все слоты.

## The defect

One payment for a multi-slot booking sends the patient one message per slot. `service.ts` loops
`for (const appointmentId of settled.confirmedAppointmentIds)` and calls
`deps.onAppointmentPaymentConfirmed` for each; the handler
(`src/app-layer/booking/appointmentPaymentConfirmedHandler.ts`) puts `patientMessageText` — and
`doctorMessageText` — into every `booking.payment_captured` event. The patient who paid once for
three slots gets three «вы записаны» messages, and the doctor gets three too.

## What must be true when you are done

- **S8.1** Exactly one patient message per payment, no matter how many slots it covered.
- **S8.2** That message lists every paid slot: the date, the time of each appointment, and the
  service.
- **S8.3** The `booking.payment_captured` event still goes out **per appointment**. It carries
  calendar synchronisation keyed to its own `bookingId`; collapsing it would leave the second slot
  out of the calendar. What changes is only which appointment's event carries the message text —
  the field is optional (`bookingLifecycleSchema.ts:33`).
- **S8.4** The doctor's message must not double either: `doctorMessageText` travels the same path and
  needs the same treatment. One message to the doctor per payment, listing the same slots.

## The shape the lead expects — argue with it if the code says otherwise

Today the handler does confirm-then-emit for one appointment, so at the moment the first event is
built the sibling bookings are not confirmed yet. That ordering is the whole difficulty: a message
composed too early can name a slot whose confirmation then fails.

So: **confirm every appointment of the payment first, then emit the events.** The message text is
built from the slots that actually confirmed, and lands on the first of them; the rest emit their
event with no message text. If exactly one appointment confirms, the result must be
byte-identical to today's single-slot message — a person paying for one slot must not notice this
change.

Keep the existing idempotency key shape (`booking.payment_captured:<paymentId>:<appointmentId>`) so
a repeated webhook still replays into the same events.

You may change the handler's signature and the call site in `src/modules/payments/service.ts`. Do not
invent a new event type, a new port, or a new database door.

## Wording

Owner's words for the shape of the message: «вы записаны на приём такого-то числа, на такое-то и
такое-то время, такую-то и такую-то услугу». Write it as a Russian speaker would say it, not as a
template with slots glued together: one lead sentence, then the appointments as a readable list.
Existing builders are `buildPatientPaymentCapturedMessageText` and
`buildDoctorPaymentCapturedMessageText` in `src/modules/patient-booking/`; extend them rather than
writing a third place that formats appointment times. Time zone comes from the same
`getAppDisplayTimeZone()` the handler already uses — do not add a second source of zone.

## Rules

- `AGENTS.md` is normative; read §10a before writing any test. Fewer tests is better. A test that
  pins exact wording is not evidence and will be rejected. What is worth a test here is the rule that
  is expensive and silent when broken: N confirmed appointments → exactly one message, N events.
  Prove that test by fault injection (break the code, see it red, revert, see it green) and say so.
- The handler already has a test file next to it (`appointmentPaymentConfirmedHandler.d14.test.ts`) —
  extend it, do not start a parallel one.
- Commit only your own files, by name. `git add -A` is forbidden.
- The clone needs `pnpm --dir packages/shared-contracts build` before `pnpm --dir apps/webapp
  typecheck` if its `dist` is stale.
- Heavy runs go through `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.
- DEV database is `bcb_webapp_dev`. PROD is untouchable, including reads.

## Deliverable

A commit on your branch, plus a short report: what you changed, what you ran, what you did not do.
Do not tick checkboxes in the owner plan — that is the lead's job after an independent audit.

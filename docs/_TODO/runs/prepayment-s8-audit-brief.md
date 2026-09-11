# Audit brief — S8 candidate: one payment, one message, all slots listed

Role: independent reviewer of code you did not write. Do not accept the author's report or a green
test run as evidence. This is the money-and-delivery path: a mistake here either spams a patient or
silently stops telling him his appointment is confirmed.

**First step — classify each claim: «тест или взгляд».** Say which you chose and why, then do it.

Candidate: `f465a8f8e` (worker) + `e8bbb5e99` (lead correction) on branch
`wt/prepayment-s8-one-message` in this clone.
Owner plan — the only source of done:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage **S8** (S8.1–S8.4).

Источник оракула: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` — решение владельца
12.09: «давай так сделаем, чтобы два сообщения не отправлять» — одно сообщение на платёж, внутри
перечислены все слоты.

## What to verify, in priority order

1. **S8.1 — exactly one patient message per payment.** The handler now takes the whole batch of
   appointment ids, confirms all of them, then emits one event per appointment with the message text
   only on the first. Find the path that breaks this. Specifically: the webhook arriving twice; a
   chain where only some appointments confirm; a chain where `getAppointment` throws for the second
   slot **after** the first event was already emitted (the loop awaits `emitBookingEvent` with
   `waitForDelivery: true`); `captureIntentSuccess` and the provider-webhook path, which are two
   different call sites of the same handler.
2. **S8.3 — the per-appointment event survived.** `booking.payment_captured` must still go out for
   every confirmed appointment with its own `bookingId` and its own idempotency key, because it
   carries calendar synchronisation. Confirm the idempotency key shape is unchanged
   (`booking.payment_captured:<paymentId>:<appointmentId>`) so a webhook replay lands on the same
   events rather than creating new ones.
3. **Suppression is real, not decorative.** Non-first events carry `suppressPatientNotification:
   true` and `doctorNotify: false`. The integrator has a FALLBACK text: when `patientMessageText` is
   absent it composes its own «Оплата записи подтверждена…». So omitting the text is NOT enough —
   verify the suppression flag actually reaches the integrator (it is declared in
   `bookingLifecycleSchema.ts` and predates this change, used by the staff-cancel path) and that the
   integrator's `booking.payment_captured` branch honours it. Then prove it end to end however you
   can: the expensive silent failure here is «the flag is set but the message still goes out».
4. **S8.4 — the doctor's message does not double either**, and the doctor still gets exactly one.
5. **The single-slot case must be untouched.** A patient paying for one slot must receive a
   byte-identical message to what he received before this change. Compare the strings, do not assume.
6. **The lead's two corrections.** (a) The worker removed the pre-existing early return
   `if (!notifyPatient && !notifyStaff) return`; the lead put it back, because that event also
   carries reminders and calendar sync, and removing the guard would make a clinic with
   notifications disabled start sending reminders. Judge whether restoring it was right and whether
   the guard now leaves any S8 requirement unmet. (b) Slots in the message are sorted by
   `slotStart`. Check the sort does not disturb which appointment is «first» for the purposes of
   carrying the message — the event loop and the message list are two different orderings, and if
   that distinction is wrong, say so precisely.
7. **Message quality, as a reader.** Owner's words for the shape: «вы записаны на приём такого-то
   числа, на такое-то и такое-то время, такую-то и такую-то услугу». Read the produced multi-slot
   text for one, two and three slots, in the app display zone, and say whether a person would
   understand it. Report a wording problem as a finding — do not fix it.

## Boundaries

- You may change code temporarily to establish a fact; revert production code afterwards.
- Product fixes are NOT your job — report them.
- A finding with no matching checkbox in the owner plan is a QUESTION for the lead, not a FAIL.
  Already recorded as such and NOT to be re-raised as a FAIL: that disabled notifications also kill
  calendar sync and reminders (owner fork in the plan).
- `AGENTS.md` §10a and §10 before accepting or writing any test. Fewer tests is better. A test that
  pins exact wording is not evidence — say so. The candidate's S8 test was proven by fault injection
  by the lead (message on every event → red, reverted → green); re-prove it yourself rather than
  trusting this sentence.
- DEV database is `bcb_webapp_dev`. PROD is untouchable, including reads.
- The clone needs `pnpm --dir packages/shared-contracts build` before `pnpm --dir apps/webapp
  typecheck` if its `dist` is stale.
- Heavy runs go through `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.

## Deliverable

A verdict line `PASS` or `FAIL`, then per item: what you ran or read, what you observed, and the
concrete failing input where you found one. End with an explicit «NOT CHECKED» list.

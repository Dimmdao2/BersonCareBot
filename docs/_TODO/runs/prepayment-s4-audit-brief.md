# Audit brief — S4 candidate: the patient sees the invoice, its deadline and how long is left

Role: independent adversarial auditor. You did NOT write this code. Your job is to prove it broken,
not to agree with its report. A green run and a confident commit message are NOT evidence.

**First step — classify each claim: «тест или взгляд».** For each item below decide whether you
settle it by RUNNING something or by READING, say which you chose and why, then do it. A prediction
from reading, where a run was possible, makes the audit worthless.

Candidate: branch `wt/prepayment-s4-patient` in this clone, commits `6dba8d108` (worker) and
`0b8d6d681` (lead correction).
Owner plan — the only source of done: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`,
stage **S4** (S4.1, S4.2, S4.3). A finding with no checkbox there is a QUESTION for the lead, never
work and never a FAIL.

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K2 `PAY-APPT-08` —
«Пациент видит точный дедлайн либо оставшееся время.»

Owner decision that shapes S4 (do not soften, do not re-ask): **QR only on a wide screen.** On a
phone the patient gets the amount, the deadline and the «Оплатить» button — he is already holding
the device, a QR he cannot scan with it is wasted screen.

Test rules before accepting or writing ANY test: `AGENTS.md` §10a and §10. Fewer tests is better
than more. A test that fixes exact wording, element counts, or call arguments between our own
functions is not evidence — call it out rather than write one. Heavy runs go through
`/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.

## Surfaces

1. Widget pay screen — `apps/webapp/src/app/book/pay/PublicBookingPayClient.tsx`
2. Cabinet pay screen — `apps/webapp/src/app/app/patient/booking/pay/PatientBookingPayClient.tsx`
3. Cabinet appointment card — `apps/webapp/src/app/app/patient/booking/BookingUpcomingSection.tsx`
4. The data door — `apps/webapp/src/app/api/booking/payment-status/route.ts` and
   `loadBookingPaymentStatus` in `src/modules/patient-booking/service.ts`
5. The shared status reading — `src/shared/lib/paymentStatusView.ts`

## What to attack, in priority order

1. **A live booking told it is cancelled.** The lead already found and fixed one class of this: a
   cash-settled prepayment leaves the online intent `pending` forever, and the old predicate turned
   every non-`awaiting_payment` status into «бронирование отменено». Attack the FIXED version.
   Walk every value of `APPOINTMENT_STATUSES` and every value of `PAYMENT_INTENT_STATUSES` against
   `classifyPrepaymentBookingStatus` + `classifyPaymentIntentStatus` and name any pair where the
   patient is shown something false — either «отменено» over a live booking, or a live «Оплатить»
   button over a dead one. `manual_review_required` and `rescheduled` are the interesting ones.
2. **A dead link still payable.** After the deadline passes, can the patient still reach the
   provider from any of the three surfaces — button, visible link text, QR, browser back, a stale
   tab whose timer was suspended (background tab, laptop lid closed)? The countdown must not be the
   only thing standing between an expired booking and a payment.
3. **The deadline itself.** It must be the appointment's own `payment_deadline_at` and nothing
   recomputed on the client from a wait-minutes setting. Check the zone each surface renders it in
   and say plainly which zone that is. Known and accepted by the lead: the two pay screens use the
   global app zone; the cabinet card uses the branch zone. Report the consequence, do not "fix" it.
4. **QR on a phone.** The owner's rule is about what the patient SEES. Check what the current
   implementation actually does at phone width — is the QR merely hidden by CSS while the library
   still loads and computes, and does that matter? Say what you measured, not what you expect.
5. **The door.** `/api/booking/payment-status` now returns `paymentDeadlineAt` and
   `appointmentStatus`. Prove it cannot answer for a booking that is not the caller's. Check that
   `loadCanonicalAppointment` (which replaced `resolveCanonicalAppointmentOrganizationId`) opened no
   new read and no new principal — the lead's reading is that it is the same `getAppointment` call
   that already ran, only its result is no longer thrown away. Disprove that if you can.
6. **N+1 on the card.** `BookingPaymentDeadline` fetches the whole payment-status endpoint once per
   awaiting-payment card. Say how many such cards one patient can realistically have and whether
   this is a real cost or a non-issue. This is a measurement, not a rewrite.

## Boundaries

- You may break things temporarily to prove a point; revert production code afterwards.
- Product fixes are NOT your job — report them.
- Do not extend scope. No new file or module that the owner plan does not ask for.
- No new database, no migration replay. DEV database is `bcb_webapp_dev`. PROD is untouchable.

## Deliverable

A verdict line `PASS` or `FAIL`, then per attack item: what you ran or read, what you observed, and
the concrete failing input where you found one. End with an explicit «NOT CHECKED» list.

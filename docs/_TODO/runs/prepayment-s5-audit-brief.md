# Audit brief — S5 candidate: payment link delivered to the patient

Role: independent adversarial auditor. You did NOT write this code. Your job is to prove it broken, not to
agree with its report. A green test run and the author's commit message are NOT evidence.

**First step — classify: «тест или взгляд».** For each claim below decide whether you settle it by RUNNING
something or by READING. Say which you chose and why, then do it. Predictions from reading code alone, where
a run was possible, make the audit worthless.

Candidate: commit `ff9213d7e` on branch `wt/prepayment-s5-notify` in this clone.
Owner plan (the only source of done): `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage S5.

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K2 `PAY-APPT-09` — «После
самостоятельной записи пациент сразу получает явное действие перехода к оплате; ссылка также отправляется
только через реально доступные и подтверждённые каналы действующего механизма уведомлений.»

Test rules you must apply before accepting or writing any test: `AGENTS.md` §10a. A test that fixes exact
wording, list shape, or call arguments between our own functions is not evidence and must be called out.

## What to attack, in priority order

1. **Unconfirmed delivery.** Prove or disprove that an unverified email address can ever receive the payment
   link. Look for any path where a booking-form contact email, a phone, or an unverified `user_contacts` row
   reaches `awaitingPaymentRecipients`. The owner's rule (11.09) is absolute: «Сами имейл не вводим и на
   неподтверждённый не отправляем.»
2. **Silence where silence is wrong.** The empty-audience early return for `awaitingPayment` suppresses the
   operator incident. Check it cannot also suppress a genuine delivery failure, and that the non-prepayment
   `booking.created` path still reports an empty audience exactly as before.
3. **Duplicate or lost message.** A booking that is paid immediately, a webhook that arrives twice, a
   multi-slot booking, and a rollback after the message was queued — does the patient get two messages, or
   none? Check the idempotency key and where the `apply(...)` call sits relative to the rollback path.
4. **Wrong deadline or wrong link.** The deadline shown to the patient must be the appointment's own
   `payment_deadline_at`, and the link must be the intent actually created for this appointment. Check the
   timezone source too — a deadline rendered in the wrong zone is a silent money defect.
5. **Transaction safety.** `apply(...)` now runs inside the prepayment branch. Does a failure there roll back
   or abort a booking that is otherwise fine? A notification must never destroy a valid booking.

## Boundaries

- You may break things temporarily to prove a point; revert production code afterwards. Product fixes are NOT
  your job — report them.
- Do not extend scope. A finding with no matching checkbox in the owner plan is a QUESTION for the lead, not
  work and not a FAIL.
- Heavy runs go through `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.

## Deliverable

A verdict line `PASS` or `FAIL`, then per attack item: what you ran or read, what you observed, and the
concrete failing input where you found one. End with an explicit «NOT CHECKED» list.

# Brief — S5: the payment link reaches the patient over confirmed channels

Owner plan (the ONLY source of todo and done):
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage **S5**. Close S5.1, S5.2, S5.3 there and
nothing else. A finding of yours that has no checkbox in that file is a QUESTION for the lead, never work.

Upstream owner acceptance: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K2 `PAY-APPT-09`.

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K2 `PAY-APPT-09` — «После
самостоятельной записи пациент сразу получает явное действие перехода к оплате; ссылка также отправляется
только через реально доступные и подтверждённые каналы действующего механизма уведомлений.»
Второй источник — диктовка владельца 11.09.2026, дословно: «При наличии подтвержденных каналов еще и туда
ссылка отправляется. Сами имейл не вводим и на неподтвержденный не отправляем.»

Rules you must read before touching tests: `AGENTS.md` §10a («ТЕСТ НЕ ДУБЛИРУЕТ КОД, КОНТРАКТ ИЛИ ТЕКСТ»)
and §10. A test that asserts a literal string or the presence of a button is deleted, not written.
Heavy runs go through the shared lock: `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.

## The defect, precisely

`apps/webapp/src/modules/patient-booking/canonicalCreate.ts:540` returns early for an `awaiting_payment`
booking. Every patient-facing effect lives AFTER that return:

- `:618` `bookingCreatedEffects.apply(...)` — Telegram/MAX message
- `:650` `syncPort.emitBookingEvent(...)` — integrator lifecycle event
- `:693` `sendBookingConfirmationEmail(...)`

Consequence for the person: a patient who self-books a prepaid slot is told nothing at all. The slot is held,
a payment deadline is ticking (`be_appointments.payment_deadline_at`), the invoice already exists
(created at `:505-523`), and the only way the patient learns any of it is by staying on the pay screen.
If they close the tab, the booking dies silently.

## What to build

1. **S5.1** For an `awaiting_payment` booking, send the patient a message carrying the payment link AND the
   deadline, through the existing notification machinery — do NOT build a second delivery path.
   - Channel selection is `apps/webapp/src/modules/patient-notifications/resolveNotificationChannels.ts`.
     Confirmed-only is already its contract (`missing_binding`, `email_not_verified`, `vapid_missing`, …).
     Use it; do not re-implement the checks.
   - Message text belongs with the other patient booking texts:
     `apps/webapp/src/modules/patient-booking/patientMessageText.ts`.
   - The link the patient receives must be the same one the pay screens use (the intent `checkoutUrl`
     today; the lead is changing it to our own check route in S3 — read it from the existing source, do not
     hardcode a host or a path shape).
2. **S5.2** Never ask the patient for an email and never send to an unconfirmed address (owner, 11.09).
   An empty audience here is a normal outcome — a patient with no confirmed channel simply gets nothing —
   so it must NOT open an operator incident the way `bookingCreatedEffects.ts:93-104` does for a confirmed
   booking. Make that distinction explicit in code, not by accident.
3. **S5.3** The existing «Оплата записи подтверждена» message after capture
   (`appointmentPaymentConfirmedHandler.ts`) stays exactly as it is. Do not duplicate it and do not let the
   new awaiting-payment message fire again after the payment lands.

## Constraints

- Branch `wt/prepayment-s5-notify`. Commit only files you touched, by name. `git add -A` is forbidden.
- Do not touch: `AppointmentPaymentSection.tsx`, `BookingRulesPageClient.tsx`, `ScheduleSetupTab.tsx`,
  `api/admin/settings/route.ts`, `PublicBookingPayClient.tsx`, `PatientBookingPayClient.tsx`,
  `yookassaPaymentProvider.ts`, `modules/payments/service.ts` — the lead is editing those right now in
  parallel stages. If S5 truly cannot be done without one of them, STOP and report; do not edit it.
- Do not create a database, do not replay migrations. DEV database is `bcb_webapp_dev`.
- No raw SQL for new code — go through the drizzle port.

## Definition of done for this run

A numbered checklist returned closed, each line with its evidence:
1. `awaiting_payment` booking produces a patient message with link + deadline over confirmed channels only.
2. A patient with zero confirmed channels produces no message and no operator incident.
3. An unconfirmed email is never a recipient.
4. The post-capture confirmation message is unchanged and not duplicated.
5. Scoped tests green (only the tests touching this behaviour — not the full suite), typecheck green.
6. `git log`/`git status` clean: only your files, one coherent commit.

Report what you did NOT do as an explicit «NOT DONE» section, even if empty.

# Brief — S4: the patient sees the invoice, its deadline and how long is left

Owner plan (the ONLY source of todo and done):
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage **S4**. Close S4.1, S4.2, S4.3 there and
nothing else. A finding of yours with no checkbox in that file is a QUESTION for the lead, never work.

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K2 `PAY-APPT-08` —
«Пациент видит точный дедлайн либо оставшееся время.»
Второй источник — диктовка владельца 11.09.2026, дословно: «При выставлении счета писать сколько времени есть
на оплату (крупно - оплатить до стольки то, осталось n минут)» и «Если счет истек (по времени) - то это qr и
ссылка не должны отображаться, нужно сообщение „оплата не поступила, бронирование отменено“».

Rules before touching any test: `AGENTS.md` §10a and §10. A test that fixes exact wording, element counts or
call arguments between our own functions is not evidence — do not write one. Heavy runs go through
`/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.

## Owner decision that shapes this work (do not soften, do not re-ask)

**QR only on a wide screen.** The patient is already holding the phone — a QR he cannot scan with the same
device is wasted screen. On a phone he gets the amount, the deadline and the «Оплатить» button. The QR appears
only at desktop width, where it is genuinely useful (booked on a laptop, pays from the phone).

## Surfaces

1. Widget pay screen — `apps/webapp/src/app/book/pay/PublicBookingPayClient.tsx`
2. Cabinet pay screen — `apps/webapp/src/app/app/patient/booking/pay/PatientBookingPayClient.tsx`
3. Cabinet appointment card — `apps/webapp/src/app/app/patient/booking/BookingUpcomingSection.tsx`
   (today only a badge «Ожидает оплаты» + an «Оплатить» link; no amount, no deadline)

Both pay screens already poll `/api/booking/payment-status` and already receive `checkoutUrl`, amount and
status. **Read the deadline from the same API** — extend its response from the appointment's own
`payment_deadline_at` if it is not carried yet; do not invent a second source and do not recompute it on the
client from a wait-minutes setting.

## What to build

- **S4.1** Both pay screens show: the amount, the payment link **as visible text** (not only a button), the
  «Оплатить» button, and — prominently — «Оплатить до <дата, ЧЧ:ММ>» with the remaining time. QR only at
  desktop width, per the owner decision above. Render the deadline in the clinic's display timezone, not the
  browser's — find how the app already resolves it (`getAppDisplayTimeZone`) rather than using local time.
- **S4.2** The remaining time counts down live. When it reaches zero the screen switches itself to
  «Оплата не поступила, бронирование отменено» — link, QR and the pay button all disappear. Do not wait for a
  poll round-trip to hide a dead link, and do not keep a countdown running once the intent is settled.
- **S4.3** The cabinet appointment card shows the deadline, not just the badge.

## Constraints

- Branch `wt/prepayment-s4-patient`. Commit only files you touched, by name. `git add -A` is forbidden.
- **Do not touch** (the lead is editing these in parallel):
  `apps/webapp/src/app/app/doctor/**`, `apps/webapp/src/modules/payments/service.ts`,
  `apps/webapp/src/app-layer/booking/staffAppointmentPayments.ts`,
  `apps/webapp/src/modules/patient-booking/canonicalCreate.ts`,
  `apps/webapp/src/app-layer/booking/bookingCreatedEffects.ts`,
  `apps/webapp/src/app/api/admin/settings/route.ts`, and anything under a new `/pay/**` route.
  If S4 cannot be done without one of them, STOP and report — do not edit it.
- The lead is separately making links point at our own check screen instead of the provider (stage S3).
  **Render whatever URL the API returns** — never build a provider URL and never assume its host.
- No new database, no migration replay. DEV database is `bcb_webapp_dev`.
- No raw SQL for new code — go through the drizzle port.

## Definition of done

A numbered checklist returned closed, each line with its evidence:
1. Phone width: amount, link text, deadline, remaining time, pay button; no QR.
2. Desktop width: the same plus QR.
3. Countdown reaches zero → expired state, nothing payable on screen.
4. Cabinet card carries the deadline.
5. Scoped tests and typecheck green (only what this change touches).
6. `git log`/`git status` clean: only your files.

Report what you did NOT do as an explicit «NOT DONE» section, even if empty.

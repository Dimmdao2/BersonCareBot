# Brief — the patient's booking card opens, and he can pay from it

Owner plan — the ONLY source of todo and done:
`docs/_TODO/PATIENT_BOOKING_CARD_AND_PAY_2026-09-12.md`. Close P1, P2, P3, P4 there and nothing
else. Read its «Решения» section before you write a line: those decisions are settled, not open.
A finding of yours with no checkbox in that file is a QUESTION for the lead, never work.

Источник оракула: `docs/_TODO/PATIENT_BOOKING_CARD_AND_PAY_2026-09-12.md` — «Детали не открыть, то
есть по идее я должен на неё ткнуть и открыть детали записи в модалке, как и у врача.»

## The one thing that matters

A patient booked, closed the page, and lost the payment link. He opens the cabinet. Right now there
is nothing to tap and no way back to the link or the QR. Everything below serves that sentence.

## Surfaces

- `apps/webapp/src/app/app/patient/booking/BookingUpcomingSection.tsx` — the card list.
- `apps/webapp/src/app/app/patient/booking/page.tsx` — the page that hosts it inside
  `BookingWizardShell` (this is where «Шаг 1 из 4» leaks above the list).
- Reference for the doctor's equivalent, **read it, do not import from it**:
  `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx` and
  `AppointmentPaymentSection.tsx`. The doctor zone and the patient zone have separate primitives and
  an ESLint wall between them — copying a doctor component into the patient zone will fail lint and
  is the wrong answer anyway (the patient sees less).
- Payment state reading — **reuse, do not re-derive**:
  `apps/webapp/src/shared/lib/paymentStatusView.ts` (`classifyPaymentIntentStatus`,
  `classifyPrepaymentBookingStatus`).
- The deadline and checkout url already reach the client through
  `/api/booking/payment-status?bookingId=…` (`paymentDeadlineAt`, `appointmentStatus`,
  `summary.intent.checkoutUrl`, `summary.intent.amountMinor`). **No new door into the database.**
- QR: `apps/webapp/src/shared/ui/patient/PaymentLinkQrCode.tsx` already exists — use it.

## What to build

Exactly the checkboxes P1.1–P4.1 in the plan. Nothing else. In particular:

- The pay action and the remaining time stay **on the card**, not only inside the panel. Money is
  not hidden behind a tap.
- The panel is a bottom sheet on a phone and a modal at desktop width. Escape closes it and focus
  returns to the card that opened it.
- QR inside the panel: shown at desktop width, behind a «Показать QR» disclosure on a phone. Both
  halves of that rule are owner decisions — do not simplify either away.
- Nothing payable — button, visible link, QR — may render when the invoice is expired or the booking
  is cancelled. Decide that with the existing classifier, not with a new condition of your own.

## Constraints

- Branch `wt/patient-booking-card`. Commit only files you touched, by name. `git add -A` is forbidden.
- **Do not touch** (landed tonight or being edited in parallel):
  `apps/webapp/src/app/book/pay/**`, `apps/webapp/src/app/app/patient/booking/pay/**`,
  `apps/webapp/src/shared/lib/paymentStatusView.ts`,
  `apps/webapp/src/app/app/patient/booking/PatientBookingPaymentHistorySection.tsx`,
  `apps/webapp/src/app/app/patient/booking/BookingPastHistorySection.tsx`,
  `apps/webapp/src/modules/patient-booking/**`, `apps/webapp/db/drizzle-migrations/**`,
  `deploy/postgres/privileges/**`, and everything under `apps/webapp/src/app/app/doctor/**`.
  If a checkbox cannot be closed without one of them, STOP and report — do not edit it.
- Patient zone uses `@/shared/ui/patient/**` primitives and `patientVisual` classes. The ESLint zone
  rule is real; run it.
- This is NOT the Next.js in your training data — read the relevant part of
  `apps/webapp/node_modules/next/dist/docs/` before touching routing or server/client boundaries
  (`apps/webapp/AGENTS.md`).
- No new database, no migration, no new API route. DEV database is `bcb_webapp_dev`. PROD is
  untouchable, including reads.
- The main tree has unrelated uncommitted work by another agent; `pgJournalRetention.ts` and
  `journalRetention.ts` typecheck errors are NOT yours. Judge your own files.

## Tests

`AGENTS.md` §10a and §10. **Fewer tests is better than more.** This is presentation: a test that
fixes wording, element counts, or which class a div has is not evidence — do not write one. The one
place a test earns its keep here is «истёкший счёт всё ещё предлагает заплатить», because that
failure is expensive and silent. If you write it, prove it by injecting the break: red, then revert.

## Live check is part of done, not an extra

DEV runs on `:5200`. Log in as the owner's patient account (`kinesiospace@gmail.com`, password
`123456testTEST`), open `/app/patient/booking`, and show what you built:
1. Phone width: an unpaid card — state, amount, remaining time, «Оплатить».
2. The panel open on a phone, with «Показать QR» expanded.
3. Desktop width: the same panel as a modal with the QR visible.
4. The page header no longer puts «Шаг 1 из 4» above the list of existing bookings.
Save the screenshots under `docs/audit/evidence/patient-booking-card-2026-09-12/` and name them in
your report. Screenshots of source code are not screenshots.

If there is no unpaid booking on DEV to photograph, say so plainly instead of faking one, and show
the paid card plus the panel.

## Done

A numbered checklist returned closed, each line with its evidence, then an explicit «НЕ СДЕЛАНО»
section even if empty. `git status`/`git log` clean: only your files.

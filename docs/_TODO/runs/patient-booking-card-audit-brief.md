# Audit brief — patient cabinet: booking card opens, and payment can be recovered from it

Role: independent reviewer of code you did not write. Do not accept the author's report or a green
test run as evidence. This surface is what the owner looked at with his own eyes and called broken,
so **a prediction from reading is not an audit here — run the app and look at it.**

**First step — classify each claim: «тест или взгляд».** Say which you chose and why, then do it.
Most of this candidate is what a person sees and touches; for that, looking at the running page beats
any test. Where behaviour is a rule (a dead invoice must not be payable), test it.

Candidate: `6acf89b00` on branch `wt/patient-booking-card` in this clone (plus a merge of current
`feat`). Owner plan — the only source of done:
`docs/_TODO/PATIENT_BOOKING_CARD_AND_PAY_2026-09-12.md`, stages **P1–P4**.

Источник оракула: `docs/_TODO/PATIENT_BOOKING_CARD_AND_PAY_2026-09-12.md` — дословная диктовка
владельца: «Детали не открыть, то есть по идее я должен на неё ткнуть и открыть детали записи в
модалке, как и у врача. Но только те данные, которые нужны пациенту. А самое главное — как человек
будет оплатить, если он ссылку потерял, QR закрыл.»

## How to see it

The patient account on DEV is `kinesiospace@gmail.com` / `123456testTEST`, page
`/app/patient/booking`. Recipes for running the app from a clone and taking headless screenshots are
in `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`. Look at BOTH a phone viewport and a wide one.
If the DEV patient has no `awaiting_payment` booking, create the state you need on `bcb_webapp_dev`
(it is a scratch database), and say exactly how you created it.

## What to verify, in priority order

1. **P1 — an unpaid booking reads as unpaid at a glance.** State, amount and «осталось N» must sit
   together on the card, not as a badge in the corner. Judge it as a person, not as a diff: open the
   page and say whether you would understand, in one look, that this booking will be released. Check
   that «Оплатить» is visually stronger than «Перенести»/«Отменить», and that the countdown actually
   ticks and reaches the deadline without a reload.
2. **P3/P1.3 — a dead invoice must not be payable from anywhere.** The candidate reuses
   `classifyPrepaymentBookingStatus` and `classifyPaymentIntentStatus` from
   `@/shared/lib/paymentStatusView.ts`. Confirm there is no second set of rules: for an expired
   deadline, a cancelled appointment, and a paid-elsewhere booking (cash settled at the desk — see
   `app.settle_appointment_cash_prepayment`, which never touches the intent), the card and the panel
   must show no amount, no button, no link and no QR, and must say why. State which of these states
   you actually produced and which you only reasoned about.
3. **P2 — the panel.** Tapping the card must open the canonical patient container: bottom drawer on
   phone, dialog on wide. Inside — only patient data: when, format, service, specialist, address with
   a map link for in-person, price, payment state. Report any internal status, identifier, staff
   comment or machine token that leaks in. Keyboard and screen reader: Esc closes, focus returns to
   the card, the card itself is reachable by keyboard (the candidate covers the card with an absolute
   `<button>` and turns off pointer events on the content — check that this did not break focus, text
   selection or the nested «Перенести»/«Отменить» controls).
4. **P3 — the link and the QR can always be recovered.** Amount, live deadline, «Оплатить», the URL
   as copyable text, QR shown on wide and behind «Показать QR» on phone. Verify the QR encodes the
   same URL the button opens.
5. **P4 — the page header stops lying.** «Шаг 1 из 4» belongs to the new-booking wizard and must not
   stand above the list of existing bookings. Check the wizard itself still works end to end — the
   candidate moved sections into a new `beforeWizard` slot of `BookingWizardShell`, which every
   wizard step renders.
6. **Cost of the new read.** `page.tsx` now calls `listCurrentPatientHistory()` on every render to
   get specialist/branch/service names. Measure what that costs on live DEV (the root is
   `app.read_current_patient_appointment_history()`, `LIMIT 100`). Confirm it adds no new principal
   and no new door — the plan forbids new database doors in this workstream. Confirm the details
   actually resolve for UPCOMING bookings and that the panel does not silently say «Не назначен» for
   everyone.
7. **Tenant and identity walls.** The details are matched by `canonicalAppointmentId`. Confirm a
   patient cannot see another patient's booking detail, and that the map is built only from rows the
   patient's own principal returned.

## Boundaries

- You may change code temporarily to establish a fact; revert production code afterwards.
- Product fixes are NOT your job — report them.
- A finding with no matching checkbox in the owner plan is a QUESTION for the lead, not a FAIL. The
  plan's «НЕ ДЕЛАЕМ» section is binding: the new-booking wizard and the `/book/pay` screens are out
  of scope.
- Known and accepted as NOT done by the author: joining a video call from the panel (part of P2.3) —
  it needs an appointment→meeting read that does not exist yet. Report whether that read genuinely
  does not exist; do not implement it.
- DEV database is `bcb_webapp_dev`. PROD is untouchable, including reads.
- `AGENTS.md` §10a and §10 before accepting or writing any test. Fewer tests is better. A UI test
  that pins wording or element counts is not evidence — say so and look at the page instead.
- The clone needs `pnpm --dir packages/shared-contracts build` before `typecheck` — its `dist` is
  stale, and the resulting `hlsStorageLayout` error is not this candidate's.
- Heavy runs go through `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.

## Deliverable

A verdict line `PASS` or `FAIL`, then per item: what you ran or looked at, what you observed, and the
concrete failing input where you found one. Attach the screenshot paths. End with an explicit
«NOT CHECKED» list.

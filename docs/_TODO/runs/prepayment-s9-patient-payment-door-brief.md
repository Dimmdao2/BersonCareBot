# Worker brief — S9: the patient's payment-status door is dead

Owner plan — the only source of done:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage **S9** (S9.1–S9.4).

Источник оракула: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` — «Пациент читает
состояние оплаты своей брони под ПАЦИЕНТСКИМ принципалом, а не под принципалом организации.»

## The defect, already measured — do not re-derive it

`/api/booking/payment-status` throws for every patient. Reproduced in-process against live DEV:

```
THROWN: Failed query: select … from "patient_bookings" where (id = $1 and platform_user_id = $2)
CAUSE:  Missing declared webapp port capability: tenant_service
```

`payment-status/route.ts:23` wraps a patient-owned read in `withExplicitOrganizationPrincipal`. That
principal routes to the staff pool under context class `tenant_service`, which is allowed named SQL
roots only — arbitrary relational reads are refused by design. The architecture is right and the
route contradicts it.

Consequence, and why this matters more than it looks: both the patient pay screen
(`PatientBookingPayClient`) and the booking card in the cabinet poll this door. The patient never
sees the amount, the deadline or the countdown — only «Не удалось проверить статус оплаты». Stage S4
shipped believing otherwise; its audit only ever exercised the `not_found` branch, which returns
before the organisation principal is installed.

## What must be true when you are done

- **S9.1** The read runs under the PATIENT principal. The door is a named SQL root of class
  `patient`, built the same way as the two that already exist:
  `app.read_current_patient_booking_rows` (patient class) and `app.read_booking_payment_check`
  (pre-session class, added for S3 — read its migration
  `20260911T211513_a_payment_link_checks_its_invoice_before_opening_provider.sql` first; it answers
  almost the same question for an anonymous caller and is the closest precedent you have).
- **S9.2** The root returns exactly what the screen draws: amount, currency, intent status, OUR
  check URL (never the provider domain — `exposeIntentCheckoutUrl` /
  `buildAppointmentPaymentCheckUrl` is the single rule), payment deadline, appointment status.
  Nothing beyond that. The screen's current shape is the contract: read
  `PatientBookingPayClient.tsx` and `BookingUpcomingSection.tsx` for the exact fields consumed.
- **S9.3** The same call cannot read another patient's booking. The patient wall is «own data only»
  and is checked BY IDENTITY, never by organisation. Prove it with a rollback-only DEV fixture, not
  by reading the SQL.
- **S9.4** Live check on DEV: an unpaid booking shows the amount and the deadline instead of «Не
  удалось проверить статус оплаты».

## Rules that will otherwise cost you a rewrite

- The privilege declaration is the single truth: `deploy/postgres/privileges/declaration.ts` plus the
  generated artifacts for three databases. A `GRANT` living only in a migration is a fake —
  reconcile re-applies the declaration. Reading a column in a `WHERE` requires `SELECT` on that
  column. After changing the declaration run
  `node deploy/postgres/privileges/generate-cli.mjs --all` and `pnpm check:db-privileges-generated`.
- A new named root needs a port-context capability declared too — otherwise you will get the same
  «Missing declared webapp port capability» from the other side.
- Carry a `BCB-MIGRATION-VERIFY:` probe on the migration that actually checks the thing that would
  break, not just that the function exists.
- `AGENTS.md` is normative; §10a before writing any test. Fewer tests is better. What deserves one
  here is the wall (S9.3) and the fact that the door answers at all. Prove every test by fault
  injection (break the code, see it red, revert, see it green) and say so.
- Commit only your own files, by name. `git add -A` is forbidden.
- DEV database is `bcb_webapp_dev`; migrations via `bash deploy/host/migrate-dev.sh --execute` from
  the main checkout, or `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`. PROD is
  untouchable, including reads.
- The clone needs `pnpm --dir packages/shared-contracts build` before `pnpm --dir apps/webapp
  typecheck` if its `dist` is stale.
- Heavy runs go through `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.
- A dev server may already be listening on `:5200` from another tree. Do not kill it silently; if
  you need it, say so in your report and put it back.

## Deliverable

A commit on your branch, plus a short report: what you changed, what you ran, what you did not do.
Do not tick checkboxes in the owner plan — that is the lead's job after an independent audit.

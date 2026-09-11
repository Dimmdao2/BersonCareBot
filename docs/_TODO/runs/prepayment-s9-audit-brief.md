# Auditor brief — S9: the patient's payment-status door

You are an INDEPENDENT adversarial auditor. You did not write this code and you owe it nothing.
Your job is to find where it is empty, faked, or broken, and to prove whatever you claim.

Owner plan — the only source of both «todo» and «done»:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage **S9** (S9.1–S9.4).

Источник оракула: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` — «Пациент читает
состояние оплаты своей брони под ПАЦИЕНТСКИМ принципалом, а не под принципалом организации.»

Candidate: branch `wt/prepayment-s9-payment-door` in this clone. Base to diff against is the merge
base with `feat/doctor-ui-rebuild`.

## Why this stage exists (measured, do not re-derive)

`/api/booking/payment-status` threw for EVERY patient, because the route wrapped a patient-owned
read in `withExplicitOrganizationPrincipal`; that principal routes to the staff pool under context
class `tenant_service`, which may execute named SQL roots only. Consequence: the patient pay screen
and the cabinet card never showed amount, deadline or countdown — only «Не удалось проверить статус
оплаты». Stage S4 shipped believing otherwise; its audit only ever exercised the `not_found` branch.

## What the candidate claims to do

- adds the named root `app.read_current_patient_booking_payment_status(uuid)` of context class
  `patient`, owner seam `app_seam_patient_booking_owner`, identity from
  `app.current_patient_user_id()`;
- routes `getBookingPaymentStatus` through it and drops the old summary-based path;
- narrows the API response to what the screen draws and builds OUR check URL from the intent id via
  `buildAppointmentPaymentCheckUrl`, so the provider domain never leaves the server;
- updates the three booking-create call sites that consumed the old shape;
- carries a rollback-only DEV proof with two fault modes.

## What I already ran myself — reproduce it, do not trust it

Lead ran all of this in this clone before handing you the candidate; every line is reproducible:

- `RUN_PATIENT_BOOKING_PAYMENT_STATUS_DB=1 node --test
  deploy/postgres/privileges/patient-booking-payment-status.devDbProof.test.mjs` → 2 pass;
- same with `PATIENT_BOOKING_PAYMENT_STATUS_FAULT=deny_execute` → red;
- same with `PATIENT_BOOKING_PAYMENT_STATUS_FAULT=omit_identity_filter` → red;
- `node deploy/postgres/privileges/generate-cli.mjs --all` + `pnpm check:db-privileges-generated`
  → byte-identical;
- `pnpm --dir packages/shared-contracts build`, `pnpm --dir apps/webapp typecheck` → rc 0;
- the two touched route test files under vitest → 5 pass.

Green gates are not the question. The question is what they do not cover.

## Where to attack

1. **S9.1 — is the principal really the patient's?** Follow the route through
   `withPatientIdentityPrincipal` → `runWithDbPatientPrincipal` → pool selection
   (`webappPoolProvider.ts`, `selectPool`) → `app.require_accepted_context`. Does anything still
   reach the staff pool or the organisation principal on this path? Does the root work for a
   patient whose organisation was never resolved (the public-booking first-timer)?
2. **S9.2 — does the root leak more than the screen draws?** Read the returned columns against
   `PatientBookingPayClient.tsx`. Any column nobody draws is a finding. Specifically check that no
   provider URL, no other patient's data and no staff-only field can come out, and that the
   `checkout_intent_id` trick cannot be turned back into the provider URL by the client.
3. **S9.3 — the wall.** The patient wall is «own data only» and is checked BY IDENTITY, never by
   organisation. Try to break it: a booking of another patient inside the same organisation, a
   booking whose `canonical_appointment_id` points at another organisation's appointment, a
   booking with `platform_user_id` NULL, an intent belonging to a different appointment. Prove
   each attempt against the live DEV database inside a transaction you roll back.
4. **The LATERAL intent pick.** The root picks one intent per booking by a `CASE` ordering. Ask
   what happens with several intents on one appointment (a re-issued invoice), with an intent whose
   `organization_id` differs, and with `payment_ref` pointing at a payment of another organisation.
   Is the row the patient sees the row the payment webhook will settle?
5. **The three call sites.** `api/booking/create`, `api/booking/public/create` and
   `.../public/create/confirm` previously returned `summary?.intent?.checkoutUrl`. Establish what
   that value was BEFORE this candidate (check it, do not assume) and whether the new value changes
   what a patient receives right after booking.
6. **The response-shape change is a contract break.** `booking` and `summary` are gone from the
   response. Find every consumer in the repository and say plainly whether any of them is now
   broken. (One known consumer lives OUTSIDE this branch: the unlanded patient-card candidate
   `6acf89b00`. Name it in your report; it is not a defect of this candidate.)
7. **The tests.** For every test the candidate adds or changes, ask whether it would go red if the
   behaviour it names regressed. Break it yourself and say so. A test that passes on broken code is
   a finding.

## Rules of this audit

- **Scope is the owner's plan, not your taste.** A finding with no matching S9 checkbox is a
  QUESTION for the owner, and you must label it that way — not a FAIL. Do not invent requirements.
- **Prove, don't assert.** Every finding carries the exact command and its output, or a file and
  line. «Looks risky» is not a finding.
- **DEV database is `bcb_webapp_dev`; `psql` only as `sudo -n -u postgres psql`. PROD is
  untouchable, including reads.** Fixtures roll back.
- A dev server may not be running; if you start one, stop it when you are done and say so. It eats
  ~9 GiB and the box's memory guard kills it — that guard already cut one audit short.
- Heavy runs go through `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.
- Do not fix anything. You are the gate, not the author.

## Deliverable

`docs/audit/PREPAYMENT_S9_PATIENT_PAYMENT_DOOR_AUDIT_2026-09-12.md` committed on this branch, with
a verdict line per S9.1–S9.4 (PASS / FAIL / НЕ ПРОВЕРЕНО, and «не проверено» is an honest answer),
each finding numbered F1, F2, … with its proof, and a closing section «Что я НЕ проверил».

# Audit brief — S7 candidate: the expiry reaches the patient's own booking

Role: independent adversarial auditor. You did NOT write this code. Prove it broken; do not agree
with its report. A green run and a confident commit message are NOT evidence.

**First step — classify each claim: «тест или взгляд».** Say which you chose and why, then do it.
This candidate changes a `SECURITY DEFINER` SQL root that moves money-adjacent state, so a
prediction from reading where a rollback-only DEV run was possible makes the audit worthless.

Candidate: commit `32bac1db1` on branch `wt/prepayment-s7-patient-cancel` in this clone.
Owner plan — the only source of done:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage **S7** (S7.1, S7.2).

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K2 `PAY-APPT-11` —
«Если предоплата не поступила до дедлайна, бронь автоматически освобождается, а запись получает»
однозначный истёкший/отменённый статус согласно действующей модели.

Решение владельца 11.09: «никаких уведомлений ему приходить не должно» — про ВРАЧА. Если кандидат
где-то завёл врачу уведомление, это FAIL.

## What to attack, in priority order

1. **Least privilege on the new write.** The root now writes `public.patient_bookings`. Check what
   `app_seam_payment_webhook_owner` actually got in the declaration and in all three generated
   artifacts: is it exactly the four columns the root sets (`status`, `cancelled_at`,
   `cancel_reason`, `updated_at`), or did a table-wide grant sneak in? Re-run
   `check:db-privileges-generated` yourself and prove a hand-edited artifact would be caught.
   Remember the trap: a `GRANT` in a migration is not the truth — reconcile re-applies the
   declaration, so a grant that lives only in the migration is a fake.
2. **The update is unscoped by organization.** `UPDATE public.patient_bookings ... WHERE
   booking.canonical_appointment_id = v_appointment_id` carries no `organization_id` filter, while
   every other write in that loop does. Decide whether that is exploitable or merely inconsistent:
   can one organization's expiry tick ever touch another organization's projection row? Answer with
   the uniqueness/constraint facts you actually read, not with an assumption.
3. **Rows that do not exist and rows that already moved.** A doctor-created appointment with no
   `patient_bookings` row; a booking the patient cancelled himself a second earlier; the same tick
   running twice; two ticks racing. Does any of these lose the slot release, double-write, or
   overwrite a cancellation that was NOT a prepayment expiry? `cancel_reason` is now load-bearing
   for what the patient reads — check nothing else writes that same token.
4. **Where the booking goes afterwards.** The lead's reading: `cancelled` leaves `upcoming` and
   enters `history` via `app.read_current_patient_booking_rows` (the `p_kind` predicate in
   `20260906T140000_patient_booking_rows_carry_branch_timezone.sql`), which is why the candidate
   edited `BookingPastHistorySection.tsx` and not `BookingUpcomingSection.tsx`. Disprove it if you
   can — and check the patient is not left with a payable screen or a live countdown somewhere else
   after the projection flips (S4 landed the pay screens; they are in `feat`).
5. **The doctor's view is unchanged.** The badge «Отменена из-за неоплаты» is derived from history
   `payload.source = 'prepayment_expired'` (`pgBookingCalendar.ts`, `pgDoctorClients.ts`). Prove the
   candidate did not shift, duplicate, or break that derivation, and that no notification to the
   specialist was introduced.
6. **The proof test itself.** `expired-prepayment-patient-projection.devDbProof.test.mjs` is
   rollback-only and gated by an env flag. Check it actually fails when the projection update is
   removed — inject the break yourself rather than trusting the author's fault-injection claim — and
   check that a skipped run (flag unset) cannot be mistaken for a pass in CI.

## Boundaries

- You may break things temporarily to prove a point; revert production code afterwards.
- Product fixes are NOT your job — report them.
- A finding with no matching checkbox in the owner plan is a QUESTION for the lead, not a FAIL.
- DEV database is `bcb_webapp_dev`, rollback-only. PROD is untouchable, including reads.
- `AGENTS.md` §10a and §10 before accepting or writing any test. Fewer tests is better. A test that
  fixes wording, element counts or call arguments between our own functions is not evidence — say so.
- Heavy runs go through `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.

## Deliverable

A verdict line `PASS` or `FAIL`, then per attack item: what you ran or read, what you observed, and
the concrete failing input where you found one. End with an explicit «NOT CHECKED» list.

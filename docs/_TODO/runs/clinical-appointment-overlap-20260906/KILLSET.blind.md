# Blind kill-set — recorded BEFORE opening any test file
Candidate df87839fe50edca7e2c31b29a8540079145691a8 (work commit 2ca8475c1)
Source: authority IDs only (plan P4.6 + K1), AGENTS.md §1/§4a/§5/§10a/§10b/§16/§21/§22/§24.

## Classification «тест или взгляд» per ID
- ENCOUNTER-APPOINTMENT-04 — MIXED. "no second write path / no simplified entity" = разовое действие → взгляд (diff, grep, AST).
  "canonical date/time/branch/service/duration/price persisted" = повторяемое поведение → route+DB test.
- ENCOUNTER-APPOINTMENT-05 — ТЕСТ. Repeatable decision path, money+slot occupancy, silent+expensive failure.
- ENCOUNTER-APPOINTMENT-06 — MIXED. "OFF creates nothing" = поведение → route test; "linked follows normal contracts" = взгляд + test.
- PAY-APPT-01/02/03 — ВЗГЛЯД (form presentation + default seeding; plan header forbids UI text/class tests) + behaviour of snapshot persistence → cheapest layer = unit on the financial helper.
- PAY-APPT-04 — ТЕСТ (security contract: patient/public may not override money).
- PAY-APPT-05 — ВЗГЛЯД (absence of pay-link creation inside form = разовое действие).
- Confirmed defect (patient_principal_required) — ТЕСТ (route level, reproduces a real incident → auto-passes §10a filter).

## Named faults (K-numbers) — each is "подали X → система ошибочно делает Y"
K1  Second appointment INSERT exists outside the canonical booking service/repository (parallel write path).
K2  Manual door creates appointment with a canonical field missing/defaulted (branch, service, duration, price).
K3  A separate simplified appointment table/entity was introduced.
K4  Overlap consent enforced only in the UI; server accepts a conflicting create without any consent flag.
K5  Staff first (non-consented) create on an occupied slot is ACCEPTED → silent double-booking.
K6  Cancelling the confirmation still leaves a created row (appointment / membership / payment).
K7  Explicit consent does NOT actually allow the overlap (feature dead: still 409).
K8  public/patient caller sends allowOverlap and it is honoured → patient self-double-books.
K9  Two concurrent NON-consented creates for the same slot both succeed (no DB-level exclusion; app-level check races).
K10 reschedule/update path writes a conflicting time without consent (protection only on INSERT).
K11 Cross-org injection: specialistId / patientId / serviceId from another organization accepted by the manual door.
K12 Overlap predicate wrong on status: blocks on cancelled rows (false positive) or ignores active rows (false negative).
K13 Staff manual-create WITH patient fails `patient_principal_required` from the auto-package path (confirmed defect).
K14 Package linking lost: patient has an active package, appointment created but no membership link / no visit debit.
K15 Failure mid-flow leaves membership/payment garbage (no rollback).
K16 The auto-package fix widened the wall: staff path reads/links a membership of another org or another patient.
K17 Service default price/prepayment not applied → appointment saved with 0/NULL money snapshot.
K18 Manual price/prepayment override silently replaced by service default.
K19 Switching service overwrites an already saved manual snapshot.
K20 Patient/public payload carrying priceOverride/prepayment is honoured (same class as K8, money axis).
K21 Pay-link/QR generated inside the create form (before save).
K22 Edit after payment silently rewrites financial values.

## Migration / schema / rights kill-set
M1 Filename not `YYYYMMDDTHHMMSS_slug.sql`.
M2 GRANT/REVOKE/CREATE POLICY/ALTER ROLE/ALTER DEFAULT PRIVILEGES inside the migration.
M3 `meta/_journal.json` mutated (entries non-empty) or extra meta churn.
M4 Missing `-- BCB-MIGRATION-OWNER:` / `-- BCB-MIGRATION-BACKFILL` on a statement block; `postgres` as owner.
M5 No verifiable object / no `-- BCB-MIGRATION-VERIFY:` probe.
M6 New table/column/constraint not declared in `deploy/postgres/privileges/declaration.ts` (operations/columns/RLS).
M7 Generated privilege artifacts not byte-identical to generator output.
M8 New hot column without index in the same PR.
M9 Migration executed under an owner that lacks rights for the body (42501 at runtime, green at deploy).

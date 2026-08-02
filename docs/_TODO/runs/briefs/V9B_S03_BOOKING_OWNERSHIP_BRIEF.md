# В9б S03 — booking ownership writers + deterministic backfill (0309)

## Authority and human outcome

Read `AGENTS.md` §1 migrations/§3a/§4a/§5/§10b/§24, `README.md`, `docs/README.md`, server conventions,
then the exact S03 rows and matrices in
`docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md`. Reuse the current migration/journal patterns and
the accepted disposable PostgreSQL runner; do not create another harness.

Источник оракула: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` В9б — «данные недостижимы без принципала»;
`V9B_IMPLEMENTATION_SLICES.md` S03 — «S03 backfill is transactional and deterministic. It stamps only proven
canonical matches ... and raises an exception that aborts the whole migration if any count is non-zero».

Human break: `patient_bookings` and `appointment_records` do not carry clinic ownership. A database policy therefore
cannot distinguish clinic A from B; routes may look guarded while a new direct query under the broad staff role can
read or mutate both clinics.

Branch/worktree: `wt/v9b-s03-booking-ownership` / isolated worktree. Migration `0309` is already reserved on the
parallel board. The file must start with `-- TEMPORARY LOCAL MIGRATION NUMBER 0309`; lead removes only that marker at
land after re-reading the board.

## Required implementation

### Current and future writes

Use the already-resolved canonical `organizationId`; never infer a default clinic from user membership or client
input.

- Add `organization_id` to the existing Drizzle declarations for `patient_bookings` and `appointment_records`, with
  the repository-standard FK/index shape. Do not add another table.
- Thread the canonical organization through `CreatePendingPatientBookingInput` and the existing
  `PatientBookingsPort.createPending` insert. `canonicalCreate.ts` already resolves `orgId` before creating the
  pending projection; use that value.
- Thread `BeAppointment.organizationId` through the existing `AppointmentProjectionPort` and every native
  create/reschedule/cancel/no-show projection write. The PostgreSQL upsert must persist it and must not allow an
  existing row to be silently re-attributed to a different organization.
- The staff-delete tombstone resolves the canonical appointment before inserting; persist that resolved
  organization. No default, NULL compatibility branch or second writer is allowed for new rows.
- Update in-memory ports/types and existing behavior tests only as required by the contract.

### Migration/backfill

Before writing SQL, perform a read-only census of DEV using only the documented safe DB path; never print/source the
connection string and do not mutate DEV/TEST/PROD. Record the exact command and aggregate reason counts, not row PII.
The product must remain correct even when DEV has unresolved rows: do not massage shared data to make the migration
green.

Migration `0309` is one transaction and may stamp only ownership proved by canonical relations/keys already present
in the row. Derive the exact deterministic match rules from current writers and document each one in SQL comments and
the report. At minimum:

- native `patient_bookings.canonical_appointment_id` must resolve to exactly one `be_appointments` row and its
  `platform_user_id` must not contradict the booking owner;
- native `appointment_records` `be:<uuid>`/canonical payload identity must resolve to exactly one
  `be_appointments` row and must not contradict its platform user/provider identity;
- legacy/provider records may be stamped only when an existing immutable key proves one canonical organization;
  phone, display snapshot, current membership or “only clinic” are never ownership proof.

Classify every still-unresolved target row into the canonical five aggregate reasons:

`zero_match`, `multiple_match`, `deleted_parent`, `user_mismatch`, `provider_mismatch`.

If any reason count is non-zero, raise one exception containing all five counts and abort the whole migration,
including any earlier updates. Do not delete/deny rows, create quarantine/audit tables, fabricate an organization,
relax a mismatch, or leave a partial backfill. The schema must not claim NOT NULL unless the same transaction has
proved all five counts zero; reconcile the precise nullable/NOT NULL deploy order against the repository deploy
sequence rather than guessing.

Add indexes in the same migration for the new hot tenant filter/join columns. Do not add policy, ENABLE/FORCE RLS,
revoke, capability adoption or S04/S05 work.

## Required oracle and validation

Extend the existing disposable migration/PostgreSQL proof with fixtures for:

1. exact native patient booking and appointment record receive the canonical org;
2. new writer persists the same org end-to-end;
3. each of the five reason classes produces a non-zero named count and rolls back every stamp/schema transition;
4. mixed valid + invalid rows leave the valid row unchanged after abort;
5. cross-org user/provider mismatch is never silently stamped;
6. rerun after a zero-unresolved fixture is idempotent;
7. no deletion/quarantine/revoke/RLS/FORCE appears in `0309`.

Use behavior/runtime PostgreSQL assertions for rollback and writer semantics; use one inspection pass for the
one-time absence of destructive/RLS statements. Do not add permanent tests that merely search production source
text.

Run focused canonical booking/projection tests, the existing disposable PostgreSQL migration proof, migration/journal
gates, schema/grant generation checks affected by the two columns, scoped ESLint/typecheck, raw-SQL gate and
`git diff --check`. Update only S03 status/evidence in the canonical slice document in the same product commit; do not
close В9б or S04–S07. Commit explicit scoped paths with `#1081`, do not push, and report exact commands/counts/SHA.

## Forbidden scope

No row deletion, quarantine table, default clinic, RLS/ENABLE/FORCE, revoke/grant contraction, new role/accessor,
S04 caller conversion, TEST/DEV/PROD mutation, deploy, billing/quota/Track-D work, new database harness or push.

# Rubitime retirement R7 table disposition

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This is the explicit R7 table disposition for Rubitime retirement. It does not approve any archive/export/drop and does
not execute SQL. R7 remains blocked until R1-R6 are complete and the owner records the archive/drop decision.

repo-first DB cleanup sequence for the current prep scope:
`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`. It explains how this disposition is used to
hand off SaaS Foundation cleanup planning without treating live archive/drop as a current blocker and without
hiding remaining raw references.

Machine check:

```bash
pnpm run check:rubitime-r7-table-disposition
```

Final destructive gate:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-r7-table-disposition.mjs --require-drop-ready
```

The final gate must fail until `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md`,
`RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md`, archive export evidence and the owner archive/drop decision exist.

## Keep / Defer

| Table                                | Decision                 | Reason                                                                                                                                                  |
| ------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.patient_bookings`            | `keep`                   | Canonical patient booking history/runtime table. It is not Rubitime raw history and must not be dropped by Rubitime retirement.                         |
| `public.be_external_entity_mappings` | `keep`                   | Canonical external identity/mapping table. Rubitime rows can be handled by a later traceability policy, but the table itself remains live.              |
| `integrator.booking_calendar_map`    | `keep_until_replacement` | Active provider-neutral Google Calendar map while GCal sync is live. It may only be replaced by a tested canonical map/rekey migration.                 |
| `public.booking_*`                   | `defer_drop`             | Legacy public catalog compatibility. These tables are not Rubitime raw provider history and are not dropped by the Rubitime raw-table retirement batch. |

## Archive Before Drop

Archive/export decision is required before destructive migration:

- `public.appointment_records` -- **still open, BLOCKED by runtime references**, see "Track C — appointment_records
  disposition" below. Not archived, not dropped.
- `integrator.rubitime_records` -- **DONE**: archived (`pg_dump --data-only` + SHA256SUMS) and dropped on TEST, see
  "R7 raw-table batch — reconciled TEST status" below.
- `integrator.rubitime_events` -- **DONE**: archived and dropped on TEST, same batch.
- `public.rubitime_records`, if present -- confirmed **not present** on TEST
  (`SELECT to_regclass('public.rubitime_records')` returns NULL, checked 2026-07-24). Nothing to archive/drop.
- `public.rubitime_events`, if present -- confirmed **not present** on TEST, same check. Nothing to archive/drop.

The raw archive is archive-only; it must not resurrect integrator-only rows absent from CSV or expand the
canonical preservation set beyond the fresh Rubitime export.
Fresh Rubitime CSV remains the preservation canon. Integrator-only rows absent from the CSV are audit/rollback deltas,
not import targets and not standalone R1/R2/R7 blockers.
Integrator-led reconciliation is forbidden when the fresh CSV exists: raw integrator state cannot create a new import
backlog or block final gates for rows absent from the CSV.

## Drop Candidates

Drop candidates only after archive/export, R6 runtime removal, static no-reference proof and owner approval. All
five below are part of the same R7 raw-table batch as `rubitime_records`/`rubitime_events` above and are **DONE —
dropped on TEST** (see reconciled status below); kept listed here verbatim so this doc and the static disposition
gate (`check:rubitime-r7-table-disposition`) still name every table explicitly:

- `integrator.rubitime_api_throttle` -- DONE, dropped on TEST.
- `integrator.rubitime_booking_profiles` -- DONE, dropped on TEST.
- `integrator.rubitime_branches` -- DONE, dropped on TEST.
- `integrator.rubitime_services` -- DONE, dropped on TEST.
- `integrator.rubitime_cooperators` -- DONE, dropped on TEST.

`integrator.rubitime_create_retry_jobs` is not in this list: it was a legacy-Rubitime-named table already
repurposed into generic message-delivery infra (`kind='message.deliver'`), not Rubitime raw provider history.
Owner directive 2026-07-24: physically renamed now to `integrator.message_retry_jobs` (not deferred to R7) --
`apps/integrator/src/infra/db/migrations/core/20260724_0001_rename_rubitime_create_retry_jobs_to_message_retry_jobs.sql`.
It is not a drop candidate.

## R7 raw-table batch — reconciled TEST status (2026-07-24, worker verification)

**SUPERSEDES** the "Current Status" section below (kept underneath for history/audit trail; do not trust its
"not yet applied" line, it is stale).

A prior worker session reported "R7 applied on TEST" (commit `40a9f9bed`, merge `50880c042`). A later inventory
pass reported the drop migration as "unapplied even on TEST", creating an apparent conflict. Reconciled against
live TEST (`bersoncarebot_test`) on 2026-07-24 by this worker:

- **Tables**: all 7 raw tables are **gone**. `SELECT to_regclass('integrator.<table>')` returns NULL for
  `rubitime_records`, `rubitime_events`, `rubitime_api_throttle`, `rubitime_booking_profiles`, `rubitime_branches`,
  `rubitime_services`, `rubitime_cooperators`.
- **Migration ledger**: the migration IS tracked. `SELECT version, applied_at FROM integrator.schema_migrations
WHERE version = 'rubitime:20260724_0002_drop_r7_raw_tables.sql'` returns one row, `applied_at = 2026-07-24
17:34:46.503155+03` -- consistent with the merge commit timestamp (`50880c042`, 17:32:15+03) and the doc-update
  commit (`40a9f9bed`, 17:35:59+03) from the same session.
- **Verdict**: the "R7 applied on TEST" report was **correct**. The later "unapplied even on TEST" report was
  **stale/incorrect** -- most likely produced by reading this doc's own "Current Status" prose (which still said
  "not yet applied to any DB") instead of querying the live DB or the `integrator.schema_migrations` ledger.
  Lesson: this doc's prose is not a substitute for a live check; the ledger and `to_regclass` are ground truth.
- **Idempotency / re-deploy safety confirmed**: every statement in
  `apps/integrator/src/integrations/rubitime/db/migrations/20260724_0002_drop_r7_raw_tables.sql` is
  `DROP TABLE IF EXISTS ... CASCADE`. Even in a hypothetical world where the ledger row was missing (it is not),
  re-running the migration against a DB where the tables are already gone is a safe no-op. The migrator
  (`apps/integrator/src/infra/db/migrate.ts`) additionally treats already-applied DDL as idempotent via
  `applyMigration`'s `safePgCodes`/`safeMessages` fallback, so a fresh deploy that (re)discovers this migration
  cannot fail or double-drop.

## Current Status (historical — see reconciled section above for ground truth)

- Keep/defer decisions above are explicit and checked.
- Non-final post-R6 static reference audit is prepared in `RUBITIME_RETIREMENT_R7_STATIC_REFERENCE_AUDIT.md`.
- Archive/export of `integrator.rubitime_records` / `integrator.rubitime_events` done on TEST (owner-authorized
  destructive batch, TEST only; see `RUBITIME_RETIREMENT_TEST_R6_R7_PROGRESS_2026-07-24.md`).
- Last runtime reader removed: `apps/webapp/src/infra/platformUserFullPurge.ts` GDPR full-purge no longer
  deletes from `rubitime_records` / `rubitime_events` (purging rows in a table about to be dropped is moot).
- Drop migration generated: `apps/integrator/src/integrations/rubitime/db/migrations/20260724_0002_drop_r7_raw_tables.sql`.
  It drops all 7 tables (`rubitime_records`, `rubitime_events`, `rubitime_api_throttle`, `rubitime_booking_profiles`,
  `rubitime_branches`, `rubitime_services`, `rubitime_cooperators`) with `IF EXISTS ... CASCADE`, idempotent.
  Only internal FK found: `rubitime_booking_profiles` -> `rubitime_branches`/`rubitime_services`/`rubitime_cooperators`,
  all in the same batch; no table outside this batch references any of these 7 tables.
- ~~Non-prod restore/migrate proof is not complete~~ -- **SUPERSEDED**: the migration is applied and ledger-tracked
  on TEST, see reconciled section above. `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` (final owner-facing proof
  doc) still needs to be written up from this evidence before the `--require-drop-ready` gate goes green.
- R7 archive+code-removal+migration-authoring+TEST-apply is done for the 7 raw tables. Remaining Track C work is
  `public.appointment_records` (blocked) and the `public.booking_*` legacy catalog (blocked) -- see below.

## B-7(b) archive-then-drop tooling now EXISTS (2026-07-25)

The archive step was implemented by the historical one-shot now preserved as inert source evidence at
`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/archive-rubitime-retirement-tables.sh`. It implemented the
runbook §3 archive in one idempotent, fail-closed script (explicit `--execute` + exact
`--expected-database` gate, loopback-only, owner-gated `--allow-authorized-prod-target`, archive →
SHA256SUMS → verify-before-anything-destructive → drop hand-off through the normal migration chain). The
drop half is the repo migration
`apps/webapp/db/drizzle-migrations/0237_r7_drop_public_rubitime_mirror_tables.sql`.

Archive target list = exactly the five archive-before-drop tables named in this doc and in
`RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md` §Step 2. `pnpm run check:rubitime-r7-table-disposition` now
parses the script and the migration and FAILS if either diverges from the docs, names a KEEP-list table,
or drops `public.appointment_records`.

**Scope boundary the tooling encodes (drop ⊂ archive):**

- Archived (5): `public.appointment_records`, `integrator.rubitime_records`,
  `integrator.rubitime_events`, `public.rubitime_records` (if present), `public.rubitime_events` (if
  present). Archiving is non-destructive, so it covers everything the docs list.
- Dropped by migration 0237 (2): `public.rubitime_records`, `public.rubitime_events` only.
- **`public.appointment_records` drop remains UNAUTHORED and blocked** — see the Track C section below.
  Its archive is scripted; its drop is not, and this doc is the reason.
- The seven `integrator.rubitime_*` tables keep their existing landed drop migration
  (`20260724_0002_drop_r7_raw_tables.sql`); 0237 does not duplicate it. They are still _archive_ targets
  because a fresh pre-SaaS prod dump brings them back before that migration runs — confirmed live on
  2026-07-25, when the TEST rebuild restored `integrator.rubitime_records` (91 rows) and
  `integrator.rubitime_events` (418 rows) and the script archived both.
- The five `integrator.rubitime_*` **drop candidates** are deliberately NOT archive targets: they appear
  only under "Drop candidates"/"Drop/defer candidates", never under any "Archive candidates" list in the
  three R7 docs. Adding them would expand the doc-approved archive set.

**Recorded ambiguity (not guessed, not resolved by the worker):** `public.rubitime_records` /
`public.rubitime_events` are classified `archive_if_present` under the _Archive-before-drop_ heading in
`RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`:209 and appear under "## Archive Before Drop" here, but they
are absent from the runbook's explicit "Drop candidates" bullet list. The reading taken is that
"archive-before-drop" is itself the drop authorization, conditional on existence — which is why the
migration is `IF EXISTS`/no-op-safe. `to_regclass('public.rubitime_records')` and
`to_regclass('public.rubitime_events')` were both NULL on `bersoncarebot_test` on 2026-07-25 _after_ the
TEST rebuild had restored the fresh prod dump (proved by `integrator.rubitime_records` reappearing in the
same check), so on current evidence the pair is absent from the prod dump too and the migration is a no-op
everywhere today. It exists to close the docs' "if they exist" branch deterministically instead of
leaving an operator judgement call in the cutover. If the owner reads that differently, migration 0237 is
the single file to revert.

## Track C — `public.appointment_records` disposition: BLOCKED by runtime references (worker verification, 2026-07-24)

Not archived, not dropped, no migration authored. This table has heavy, active, bidirectional runtime references
on both webapp and integrator sides -- dropping it would break the live doctor appointments feature. Evidence
(`code-search.mjs "appointment_records" --repo bcb` + direct grep):

- **Writes (integrator)**: `apps/integrator/src/infra/db/repos/publicAppointmentRecordSync.ts` --
  `upsertAppointmentRecordFromBookingMutation` does a Drizzle `.insert(appointmentRecords)...onConflictDoUpdate`
  on every booking mutation.
- **Writes (webapp)**: `apps/webapp/src/infra/repos/pgAppointmentProjection.ts` -- multiple raw
  `INSERT INTO appointment_records (...) ON CONFLICT (integrator_record_id) DO UPDATE ...` and
  `UPDATE appointment_records SET deleted_at = now() ...` statements (lines ~179-471).
- **Reads (webapp, doctor-facing)**: `apps/webapp/src/infra/repos/pgDoctorAppointments.ts` -- ~15 `FROM
appointment_records` / `appointment_records AS a` queries backing the doctor appointments list/detail views
  (lines ~146-430).
- **Live admin API**: `apps/webapp/src/app/api/admin/appointment-records/[integratorRecordId]/soft-delete/route.ts`.
- **Drizzle schema declaration (integrator)**: `apps/integrator/src/infra/db/schema/integratorDomainRepos.ts:170-189`
  (`export const appointmentRecords = pgTable('appointment_records', ...)`), imported by
  `apps/integrator/src/infra/db/integratorDrizzleSchema.ts`.

**Disposition: KEEP for now, ARCHIVE+DROP deferred.** This matches the existing repo memory
("appointment_records drop later, still has runtime refs") and the runbook's Migration Rules ("Do not drop
`public.appointment_records` until every runtime reference is gone"). No archive command or drop migration is
authored for this table in this pass -- authoring an archive-then-drop plan for a table under active read/write
would be premature and the archived snapshot would go stale immediately.

## Track C — `public.booking_*` legacy catalog disposition: still BLOCKED after R3C-11 (worker verification, 2026-07-24)

**Corrects/supersedes** the line "legacy booking\_\* catalog drop (unblocked by R3C-11, separate step)" in
`RUBITIME_RETIREMENT_TEST_R6_R7_PROGRESS_2026-07-24.md`'s Status section -- that line is **inaccurate**, marked
`SUPERSEDED` there; the accurate status is here.

R3C-11 (commit `9745197c2`, merged `3bd10feb6`) removed exactly one thing: the dead
`bookingCatalog.resolveBranchService` compatibility method and its `booking_branch_services`/`booking_branches`/
`booking_cities`/`booking_services` JOIN, which was the last reachable call in the **patient/public** create path
(`RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md`). Its own commit message says explicitly: _"pgBookingCatalog's admin
CRUD + pgRubitimeMapping's admin mapping-status view keep their own booking\__ reads unchanged (out of scope,
still R7-disposition-tracked)."\* That remains true today -- verified live:

- **Live admin CRUD API (10 routes)**, all reading/writing `booking_cities` / `booking_branches` / `booking_services`
  / `booking_specialists` / `booking_branch_services` via raw SQL in
  `apps/webapp/src/infra/repos/pgBookingCatalog.ts` (e.g. lines 229, 290-294, 365-704):
  - `apps/webapp/src/app/api/admin/booking-catalog/cities/route.ts` (+ `[id]/route.ts`)
  - `apps/webapp/src/app/api/admin/booking-catalog/branches/route.ts` (+ `[id]/route.ts`)
  - `apps/webapp/src/app/api/admin/booking-catalog/services/route.ts` (+ `[id]/route.ts`)
  - `apps/webapp/src/app/api/admin/booking-catalog/specialists/route.ts` (+ `[id]/route.ts`)
  - `apps/webapp/src/app/api/admin/booking-catalog/branch-services/route.ts` (+ `[id]/route.ts`)
  - wired via `apps/webapp/src/app/api/admin/booking-catalog/_requireAdminBookingCatalog.ts` ->
    `buildAppDeps().bookingCatalogPort` -> `createPgBookingCatalogPort()`.
- **Admin mapping-status view**: `apps/webapp/src/infra/repos/pgRubitimeMapping.ts:165-168` --
  `FROM booking_branch_services bbs JOIN booking_branches br ... JOIN booking_specialists sp ... JOIN
booking_services svc ...`.

**Disposition: KEEP / defer_drop, unchanged from the Keep/Defer table above.** `branchServiceId` is only _partially_
retired (the patient/public compat resolver is gone; `patient_bookings.branchServiceId` stays as a historical
trace-only column, untouched by design). The tables themselves are not ref-free -- live admin CRUD depends on them.
No drop migration is authored for `booking_*` in this pass. To actually unblock the drop, the admin
booking-catalog CRUD surface (`pgBookingCatalog.ts` + its 10 routes) and the `pgRubitimeMapping.ts` admin view
would need to be migrated onto `be_*` (canonical) tables or explicitly retired -- that is unstarted, separate work,
not covered by R3C-11.

# Rubitime retirement R7 archive/drop runbook

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This is the prepared `RR-PROOF-10-DROP-RESTORE` runbook. It does not approve or execute any drop.

repo-first DB cleanup sequence for the current prep scope:
`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`.
That sequence is the TEST/disposable-DB handoff package for SaaS Foundation. It prepares archive/drop/defer order,
validation and rollback contracts without live-environment work, final proof placeholders, or destructive migrations.

R7 must not start until R1-R6 are complete, including a completed `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md`.

> **Track C current-milestone gate — non-executable.** Do not run any archive/export, drop, reset, fresh-restore,
> schema-audit, migration or rehearsal command in this document until R1-R6 are complete **and** the owner has
> explicitly authorized the selected TEST/disposable destructive batch. This includes commands that are otherwise
> read-only prerequisites. Until then, every command below is final-reference material only; R7 remains open.

> **Owner authorization 2026-07-25 (TEST only), and what has actually run.** The owner authorized the
> destructive batch **on the local TEST database `bersoncarebot_test` only**; PROD (135.x) remains
> untouchable. Under that authorization the archive step of §3 is now a script and has been executed
> against `bersoncarebot_test` (3 tables archived + verified, 2 recorded missing), and the drop migration
> of §4 has been applied and re-applied on a disposable scratch database. That does **not** make R7 green
> on prod: §2.5 of `SAAS_PROD_DEPLOY_PROCESS.md` still needs its own prod rehearsal + owner GO, and
> `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` is still unwritten.

Table disposition manifest: `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md`.
Prepared non-final static reference audit: `RUBITIME_RETIREMENT_R7_STATIC_REFERENCE_AUDIT.md`.

Static disposition check:

```bash
pnpm run check:rubitime-r7-table-disposition
```

## Non-Negotiable Keep List

Do not drop these tables as part of Rubitime retirement:

- `public.patient_bookings`
- `public.be_external_entity_mappings`
- `integrator.booking_calendar_map` while Google Calendar sync is active, unless a tested replacement exists
- `public.booking_*` catalog tables until R3-CATALOG compatibility removal is separately completed

## Archive Candidates

Archive before any destructive migration:

- `public.appointment_records`
- `integrator.rubitime_records`
- `integrator.rubitime_events`
- populated public shadow `rubitime_records` / `rubitime_events`, if they exist

The raw archive is archive-only; it must not resurrect integrator-only rows absent from CSV or expand the
canonical preservation set beyond the fresh Rubitime export.
Integrator-led reconciliation is forbidden when the fresh CSV exists: archived/raw integrator state cannot create a
new import backlog or block final gates for rows absent from the CSV.
Fresh Rubitime CSV remains the preservation canon even during R7. Raw integrator archives are for traceability and
rollback; they do not create new import targets and do not turn integrator-only rows into blockers.

Drop candidates after archive, R6 removal, static no-reference proof, and owner approval:

- `integrator.rubitime_api_throttle`
- `integrator.rubitime_booking_profiles`
- `integrator.rubitime_branches`
- `integrator.rubitime_services`
- `integrator.rubitime_cooperators`

`integrator.rubitime_create_retry_jobs` is not in this list: it is a legacy-Rubitime-named table already repurposed
into generic message-delivery infra, not Rubitime raw provider history. Owner directive 2026-07-24: physically
renamed now to `integrator.message_retry_jobs` (not deferred to R7) --
`apps/integrator/src/infra/db/migrations/core/20260724_0001_rename_rubitime_create_retry_jobs_to_message_retry_jobs.sql`.

## 1. Read-Only Schema Audit

Run on the same TEST/disposable fresh-copy DB used for the cleanup rehearsal. This is read-only.

```bash
set -a && source <env-for-the-selected-test-or-disposable-db> && set +a
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/01_audit.ts
```

Save JSON output into the R7 proof.

## 2. Static Reference Audit

Run in repo checkout after R6 removal branch is applied:

```bash
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6
node /home/dev/brain/tools/code-search.mjs "rubitime_records rubitime_events rubitime_api_throttle rubitime_booking_profiles appointment_records booking_calendar_map" --repo bcb -k 100
rg -n "rubitime_records|rubitime_events|rubitime_api_throttle|rubitime_booking_profiles|rubitime_branches|rubitime_services|rubitime_cooperators|appointment_records|booking_calendar_map" \
  apps packages docs \
  --glob '!docs/archive/**' \
  --glob '!docs/archive/legacy-underscore/**'
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/05_drop_deprecated.ts --repo-root ../..
```

The existing `05_drop_deprecated.ts` is a dry-run scanner only. Its hardcoded reasons may lag behind current R6 work; use it as a reference detector, not as approval to drop.

Pass criteria:

- Runtime code has no references to planned drop tables.
- Remaining references are only docs, archives, old migrations, or the R7 proof itself.
- `booking_calendar_map` remains referenced only as the active provider-neutral GCal map or has a tested replacement.

## 3. Archive Export — SCRIPTED (B-7(b), 2026-07-25)

**This section is no longer prose-only.** The archive-then-drop step is now one reusable, idempotent,
fail-closed script now preserved as inert archive evidence:
`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/archive-rubitime-retirement-tables.sh`.
It must not be run; the command below records the historical invocation only.
for the selected TEST/disposable DB (the script itself refuses everything else).

```bash
bash docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/archive-rubitime-retirement-tables.sh \
  --execute \
  --via-sudo-postgres \
  --database-url='postgresql:///bersoncarebot_test?host=/var/run/postgresql' \
  --expected-database=bersoncarebot_test \
  --archive-dir=<local-or-test-archive-dir-OUTSIDE-the-repo>
```

Prod cutover (owner-authorized operator only; same explicit-flag shape as §3.5 of
`SAAS_PROD_DEPLOY_PROCESS.md` / `deploy/postgres/test-strict-rls-finalizer.sql`) adds:

```bash
  --allow-authorized-prod-target --authorized-prod-database="$PROD_DB"
```

What it does, in this fixed order:

1. **GATE.** Refuses without `--execute` (default = refuse). Refuses unless `current_database()` equals
   the operator-supplied `--expected-database` **exactly**. Always refuses a non-loopback /
   non-local-socket DB host — the prod flag never relaxes that, so PROD is only ever reachable _from the
   prod host itself_. Refuses a `prod`/`production`/`live`-named database unless BOTH
   `--allow-authorized-prod-target` and a verbatim-matching `--authorized-prod-database` are given.
   Refuses an archive directory inside the repository.
2. **ARCHIVE.** `pg_dump --data-only` per target table into
   `<archive-dir>/rubitime-retirement-<UTC>/`. Targets are exactly this runbook's archive candidates
   (§"Archive Candidates" above / `RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md` §Step 2):
   `public.appointment_records`, `integrator.rubitime_records`, `integrator.rubitime_events`,
   `public.rubitime_records`, `public.rubitime_events`. A missing table is recorded as
   `<table>.MISSING.txt` with its `to_regclass(...)` evidence — never treated as archived by silence.
3. **SHA256SUMS** over every produced artifact.
4. **VERIFY, before anything destructive:** `sha256sum -c --strict`, every archive file readable and
   non-empty, and the row count inside each `COPY` block equal to the live table's `count(*)`. Any
   failure aborts and nothing destructive is reachable. On success it writes `ARCHIVE_MANIFEST.json`
   and an `ARCHIVE_VERIFIED` marker.
5. **DROP hand-off.** Never an ad-hoc `DROP TABLE` (see §4). With `--then-drop` the script runs the
   normal repo migration chain (`pnpm run migrate`) and re-checks `to_regclass` afterwards; without it
   the archive simply ends verified and prints the exact migration command.

The target list is machine-verified against these docs by
`pnpm run check:rubitime-r7-table-disposition`, which fails if the script's list, the docs' list, or the
drop migration's table set ever diverge.

## 4. Migration Rules

- Generate a normal repo migration; do not run ad hoc `DROP TABLE`.
- The authored drop migration is
  `apps/webapp/db/drizzle-migrations/0237_r7_drop_public_rubitime_mirror_tables.sql`
  (journal entry `idx 237`). It drops **only** `public.rubitime_records` and `public.rubitime_events`
  (`IF EXISTS ... CASCADE`, idempotent). The seven `integrator.rubitime_*` raw tables are already
  covered by the landed
  `apps/integrator/src/integrations/rubitime/db/migrations/20260724_0002_drop_r7_raw_tables.sql`.
  **No drop migration exists — or may be authored — for `public.appointment_records`** while it still
  has runtime readers/writers (see the rule below and `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md`
  "Track C — `public.appointment_records` disposition"). Its _archive_ is scripted; its _drop_ is not.
- Drop only owner-approved candidates.
- Keep rollback backup/archive available through the approved horizon.
- Do not drop `booking_calendar_map` unless GCal replacement is implemented and tested.
- Do not drop `public.appointment_records` until every runtime reference is gone and archive decision is recorded.

## 5. TEST/disposable Restore/Migrate Proof

Run on a TEST/disposable fresh-copy restore:

```bash
pnpm install --frozen-lockfile
pnpm migrate
pnpm --dir apps/integrator typecheck
pnpm -C apps/webapp run typecheck
pnpm run check:rubitime-retirement-r0
git diff --check
```

Then rerun the static reference audit from Section 2.

## Proof Template

Save completed proof as `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` with:

- R6 proof link and commit hash;
- owner archive/drop decision;
- schema audit JSON;
- `rubitime-r6-r7-static-inventory.mjs --expect-post-r6` output;
- static reference audit output;
- archive directory and SHA256SUMS;
- statement that raw archive is archive-only and must not resurrect integrator-only rows absent from CSV;
- statement that integrator-led reconciliation is forbidden when the fresh CSV exists;
- migration file name;
- fresh restore + migrate output;
- typecheck/lint/test output;
- explicit rollback horizon.

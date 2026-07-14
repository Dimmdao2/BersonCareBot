# Rubitime retirement R7 archive/drop runbook

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This is the prepared `RR-PROOF-10-DROP-RESTORE` runbook. It does not approve or execute any drop.

R7 must not start until R1-R6 are complete, including a completed `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md`.

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
- `integrator.rubitime_create_retry_jobs`
- `integrator.rubitime_booking_profiles`
- `integrator.rubitime_branches`
- `integrator.rubitime_services`
- `integrator.rubitime_cooperators`

## 1. Read-Only Schema Audit

Run on production host or a fresh production dump restore. This is read-only.

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
cd /opt/projects/bersoncarebot
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/01_audit.ts
```

Save JSON output into the R7 proof.

## 2. Static Reference Audit

Run in repo checkout after R6 removal branch is applied:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6
node /home/dev/brain/tools/code-search.mjs "rubitime_records rubitime_events rubitime_api_throttle rubitime_booking_profiles appointment_records booking_calendar_map" --repo bcb -k 100
rg -n "rubitime_records|rubitime_events|rubitime_api_throttle|rubitime_create_retry_jobs|rubitime_booking_profiles|rubitime_branches|rubitime_services|rubitime_cooperators|appointment_records|booking_calendar_map" \
  apps packages docs \
  --glob '!docs/archive/**' \
  --glob '!docs/_ARCHIVE/**'
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/05_drop_deprecated.ts --repo-root ../..
```

The existing `05_drop_deprecated.ts` is a dry-run scanner only. Its hardcoded reasons may lag behind current R6 work; use it as a reference detector, not as approval to drop.

Pass criteria:

- Runtime code has no references to planned drop tables.
- Remaining references are only docs, archives, old migrations, or the R7 proof itself.
- `booking_calendar_map` remains referenced only as the active provider-neutral GCal map or has a tested replacement.

## 3. Archive Export

Run only after owner approval. Use a timestamped directory.

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
ARCHIVE_DIR="/opt/backups/postgres/rubitime-retirement-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$ARCHIVE_DIR"

pg_dump "$DATABASE_URL" --data-only --table=public.appointment_records --file="$ARCHIVE_DIR/public.appointment_records.sql"
pg_dump "$DATABASE_URL" --data-only --table=integrator.rubitime_records --file="$ARCHIVE_DIR/integrator.rubitime_records.sql"
pg_dump "$DATABASE_URL" --data-only --table=integrator.rubitime_events --file="$ARCHIVE_DIR/integrator.rubitime_events.sql"

sha256sum "$ARCHIVE_DIR"/*.sql > "$ARCHIVE_DIR/SHA256SUMS"
ls -lh "$ARCHIVE_DIR"
cat "$ARCHIVE_DIR/SHA256SUMS"
```

If any table is missing, record `to_regclass(...)` output in the proof instead of treating the archive as successful by silence.

## 4. Migration Rules

- Generate a normal repo migration; do not run ad hoc `DROP TABLE`.
- Drop only owner-approved candidates.
- Keep rollback backup/archive available through the approved horizon.
- Do not drop `booking_calendar_map` unless GCal replacement is implemented and tested.
- Do not drop `public.appointment_records` until every runtime reference is gone and archive decision is recorded.

## 5. Non-Prod Restore/Migrate Proof

Run on a fresh production dump restore, not directly on production:

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

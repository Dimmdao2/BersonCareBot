# Rubitime retirement R6 cutoff/drain runbook

> **HISTORICAL / NON-EXECUTABLE:** Rubitime выведено 2026-07-27. PROD ниже всегда означает только
> `135.106.162.170` (`adelaide`); текущий `151.241.228.122` — DEV/RELAY/TEST. Команды не выполнять.

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

> **PRODUCTION / FINAL REFERENCE ONLY — NON-EXECUTABLE FOR 2026-07-22 TRACK C TEST.** This document retains the
> final R6 evidence contract and production commands. Current routine verification is an incremental TEST deploy over
> the existing TEST DB with forward migrations only. Do not run, adapt, or substitute TEST paths for any command
> below; no fresh PROD dump, TEST reset, cutover, backfill, drain, archive, or R7 drop belongs to that routine path.
> A TEST cutoff/drain requires separate owner evidence and a TEST-valid runbook.

This is the prepared `RR-PROOF-09-CUTOFF-DRAIN` runbook. It does not record a completed cutoff.

No production DB, env, service, webhook, or Rubitime endpoint was changed while writing this document.

## Source Of Truth

- Fresh Rubitime export CSV is canon.
- The approved export is the one-specialist context: `89643805480` / tail `9643805480`.
- Reconcile it through the existing city/branch mappings.
- `integrator.rubitime_records` is audit-only when the fresh CSV exists.
- Integrator-only rows absent from the fresh CSV must not be imported into canonical.
- Run destructive or disabling steps only after owner approval and a recorded cutoff timestamp.

## Required Inputs

- Owner-approved provider cutoff timestamp: `YYYY-MM-DDTHH:mm:ss+03:00`.
- Fresh Rubitime CSV exported after cutoff.
- Host access to `saas-prod`.
- Repo on host: `/opt/projects/bersoncarebot`.
- Env files:
  - `/opt/env/bersoncarebot/api.prod`
  - `/opt/env/bersoncarebot/webapp.prod`

## 0. Backup Before Any Change

Run on production host:

```bash
cd /opt/projects/bersoncarebot
/opt/backups/scripts/postgres-backup.sh manual
```

If `/opt/backups/scripts/postgres-backup.sh` is missing, install the repo canonical script first as documented in `deploy/postgres/README.md`; do not improvise backup commands in this runbook.

## 1. Read-Only Drain Snapshot

Run on production host. This is read-only.

```bash
set -a && source /opt/env/bersoncarebot/api.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT now() AS checked_at;

SELECT 'projection_outbox' AS queue, status, count(*)::bigint AS rows
FROM integrator.projection_outbox
GROUP BY status
ORDER BY status;

SELECT 'projection_outbox_due' AS metric, count(*)::bigint AS rows
FROM integrator.projection_outbox
WHERE status = 'pending' AND next_try_at <= now();

SELECT 'projection_outbox_dead' AS metric, count(*)::bigint AS rows
FROM integrator.projection_outbox
WHERE status = 'dead';

SELECT 'message_retry_jobs' AS queue, status, count(*)::bigint AS rows
FROM integrator.message_retry_jobs
GROUP BY status
ORDER BY status;

SELECT 'message_retry_jobs_due' AS metric, count(*)::bigint AS rows
FROM integrator.message_retry_jobs
WHERE status = 'pending' AND next_try_at <= now();

SELECT 'message_retry_jobs_dead_or_failed' AS metric, count(*)::bigint AS rows
FROM integrator.message_retry_jobs
WHERE status IN ('dead', 'failed');
SQL
```

Pass criteria before route removal:

- `projection_outbox_due = 0`
- `projection_outbox_dead = 0`, or every dead row is owner-reviewed and waived/archived
- `message_retry_jobs_due = 0`
- `message_retry_jobs_dead_or_failed = 0`, or every row is owner-reviewed and waived/archived

Note (2026-07-24): the physical table `integrator.rubitime_create_retry_jobs` was renamed to
`integrator.message_retry_jobs` -- it is permanent generic message-delivery infra
(`apps/integrator/src/infra/db/migrations/core/20260724_0001_rename_rubitime_create_retry_jobs_to_message_retry_jobs.sql`),
not a Rubitime raw-table drain/archive/drop target. These queries still make sense as an operational health check of
the retry queue, but they are not part of the Rubitime provider cutoff/drain proper.

Optional existing helper:

```bash
set -a && source /opt/env/bersoncarebot/api.prod && set +a
cd /opt/projects/bersoncarebot
pnpm --dir apps/integrator run projection-health
```

## 2. Runtime Rubitime Traffic Snapshot

Run on production host. This is read-only.

```bash
set -a && source /opt/env/bersoncarebot/api.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT 'rubitime_records_recent_24h' AS metric, count(*)::bigint AS rows
FROM integrator.rubitime_records
WHERE updated_at >= now() - interval '24 hours';

SELECT 'rubitime_events_recent_24h' AS metric, count(*)::bigint AS rows
FROM integrator.rubitime_events
WHERE created_at >= now() - interval '24 hours';

SELECT 'rubitime_api_throttle_recent_24h' AS metric, count(*)::bigint AS rows
FROM integrator.rubitime_api_throttle
WHERE updated_at >= now() - interval '24 hours';
SQL
```

The acceptable result after cutoff is zero recent provider writes, except explicitly explained audit rows.

## 3. Fresh CSV Reconciliation After Cutoff

Place the fresh Rubitime CSV on the host, for example:

```bash
mkdir -p /tmp/rubitime-retirement
# copy owner-approved fresh export to:
# /tmp/rubitime-retirement/records-cutoff.csv
```

Run read-only diagnosis:

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
cd /opt/projects/bersoncarebot
pnpm --dir apps/webapp run backfill-canonical-from-legacy-appointments -- \
  --csv=/tmp/rubitime-retirement/records-cutoff.csv \
  --summary-only
```

Pass criteria:

- CSV-present missing canonical delta is zero, or every CSV-present missing row is imported/owner-waived with ids and reason.
- Stale-vs-CSV is zero for active canonical/UI rows.
- The proof records the one-specialist context `89643805480` / tail `9643805480` and city/branch mapping basis.
- Integrator-only rows absent from CSV are recorded as audit-only, not import targets.

If the command reports import candidates, do not proceed to R6 removal. Return to R1/R2 remediation with the same fresh CSV.

## 4. Disable Provider Traffic

This section is intentionally not a command because it requires owner approval and depends on the Rubitime-side control panel / webhook registration.

Record in the proof:

- cutoff timestamp;
- who disabled external Rubitime webhook ingress;
- who disabled outbound Rubitime create/update/remove bridge, or the commit/env change that makes it impossible;
- exact confirmation that no new provider writes appear in Section 2 after the cutoff.

Do not remove code before Sections 1-3 pass after provider traffic is disabled.

## 5. R6 Code Removal Gate

Only after Sections 1-4 pass:

- run the static inventory in pre-removal mode and save the output:

```bash
pnpm run check:rubitime-retirement-inventory
```

- remove/unmount Rubitime webhook route;
- remove/unmount Rubitime `/slots`, `/create-record`, `/update-record`, `/remove-record`;
- keep `/api/bersoncare/booking/lifecycle-event`;
- remove the Rubitime-named lifecycle compatibility alias only after the bounded rollout window;
- remove Rubitime connector/api2/throttle/post-create projection code;
- replace Rubitime runtime tests with canonical lifecycle/GCal/reminder tests.

Validation after code removal:

```bash
pnpm --dir apps/integrator test
pnpm --dir apps/integrator typecheck
pnpm -C apps/webapp run typecheck
pnpm -C apps/webapp run lint
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs --expect-post-r6
pnpm run check:rubitime-retirement-r0
git diff --check
```

Known current caveat: full `pnpm --dir apps/integrator lint` currently has pre-existing `no-secrets/no-secrets` false positives around `DB_PRINCIPAL_CONTEXT_MODE=locked`; do not count those as R6 regressions unless touched in the removal batch.

## Proof Template

Save the completed cutoff proof as `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_PROOF.md` with:

- cutoff timestamp;
- backup filename;
- Section 1 SQL output;
- Section 2 SQL output before and after provider disable;
- fresh CSV filename, size, date span, and reconciliation output;
- explicit statement that fresh CSV is canon and integrator-only rows absent from CSV are audit-only;
- explicit statement that integrator-led reconciliation is forbidden when the fresh CSV exists;
- owner waivers, if any;
- commit hash for R6 route/code removal;
- pre-removal and post-removal `rubitime-r6-r7-static-inventory.mjs` outputs;
- validation commands and results.

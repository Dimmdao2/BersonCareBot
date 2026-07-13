# Rubitime retirement R1 dual-source report

Run id: `R1-DUAL-SOURCE-HISTORY-codex-2026-07-14`

Scope: Phase R1 only. Read-only/dry-run stage. No `--commit`, no SQL writes, no `/opt` env, no production DB, no PII output. R2 was not started.

## Summary

R1 is **blocked by environment** in this worktree: no local `.env`, `apps/webapp/.env.dev`, `.env.cutover.dev`, or `.env.cutover` file is present, and `DATABASE_URL` is not set after loading the allowed local env paths.

A sanitized opt-in diagnostic script was added:

- `docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs`

Sol audit fixer update:

- source CTEs now include every non-empty Rubitime external id, including rows with `record_at IS NULL`;
- both sources now report explicit `record_at_null` / `record_at_not_null` counts;
- freshness classification now reports both `raw_newer_updated_at` and `legacy_newer_updated_at`;
- `record_at` null asymmetry is reported in both directions;
- mapping coverage now validates canonical target existence, canonical soft-delete state, mapping/canonical organization mismatch, canonical source, and expected mapping metadata;
- DB guard now includes a post-connect `current_database()` verification inside a read-only transaction before the business query;
- samples default to disabled (`--sample-size=0`), and opt-in samples are hash-only with a per-run salt that is not printed.

The script is read-only by construction:

- refuses non-dev DB names;
- refuses `/opt` env paths;
- refuses selected `/opt`-backed env references such as `PGPASSFILE` / `PGSERVICEFILE`;
- verifies the connected database name is dev and not prod before the main query;
- uses `BEGIN READ ONLY` / `SET LOCAL statement_timeout`;
- runs SELECT-only aggregate SQL via `psql`;
- does not select `payload_json`, names, phones or emails;
- does not print external-id samples by default; opt-in samples are hash-only, with no raw tail.

## Existing script inspection

| Script | Finding | R1 usability |
| --- | --- | --- |
| `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` | Dry-run by default and writes only with `--commit`. However, diagnosis can print phone/name samples for duplicate/stale/conflict rows. | Not run in this environment because dev DB can contain real PII and the script output is not sanitized. Needs sanitized mode or trusted no-PII DB before R1 evidence can use it. |
| `apps/webapp/scripts/reconcile-appointments-domain.mjs` | Read-only comparison, but requires `DATABASE_URL` + `INTEGRATOR_DATABASE_URL`, loads cutover env candidates including `/opt/env/bersoncarebot/cutover.prod`, prints raw missing external id samples, and does not cover full R1 proof matrix. | Not run. Not suitable for this requested stage as-is. |
| `apps/webapp/scripts/rubitime-appointment-mapping-audit.sql` | Read-only SQL, but header documents production `/opt` env usage and sample output includes canonical appointment fields. It also references unqualified `rubitime_records`, not the required direct `integrator.rubitime_records` source. | Inspected only. Not run. |
| `apps/integrator/src/infra/scripts/compare-rubitime-records.ts` | Read-only local-vs-Rubitime-API audit, but it calls the external Rubitime API and can include mismatch reasons with phone/name/email fields. | Not relevant for local dual-source DB proof; not run. |

## Diagnostic script coverage

`rubitime-r1-dual-source-audit.mjs` is intended to produce the `RR-PROOF-01-DUAL-SOURCE` DB aggregate evidence when a safe dev `DATABASE_URL` is available:

- `appointment_records.integrator_record_id` vs `integrator.rubitime_records.rubitime_record_id` anti-joins;
- total non-empty external-id counts, explicit `record_at` null/not-null counts, live counts, and max `record_at` / `updated_at` freshness for both sources;
- raw-only count;
- legacy-only count;
- status mismatch count;
- `record_at` mismatch count;
- raw-newer-than-legacy and legacy-newer-than-raw `updated_at` counts;
- raw-null/legacy-not-null and legacy-null/raw-not-null `record_at` asymmetry counts;
- canonical mapping coverage in `be_external_entity_mappings`;
- mapping validation for canonical target existence, canonical soft-delete state, organization consistency, `source = 'rubitime_projection'`, and expected mapping metadata;
- orphan Rubitime mapping count where canonical appointment is missing;
- optional hash-only external-id samples for owner/reviewer triage, disabled by default.

Expected safe run command once dev env is present:

```bash
set -a
source .env
source apps/webapp/.env.dev
set +a
node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs --threshold-minutes=5
```

Default run keeps `--sample-size=0`. Use a non-zero sample size only when the reviewer explicitly accepts hash-only external-id sample output.

The database name in `DATABASE_URL` must include `dev` and must not include `prod`, otherwise the script refuses before opening `psql`. After connecting, the script separately verifies `current_database()` under `BEGIN READ ONLY`; a non-dev or prod connected database is refused before the main business query.

## Commands run

| Command | Result |
| --- | --- |
| `pwd && git status --short --branch && git rev-parse HEAD && git remote -v` | PASS. Worktree `/home/dev/dev-projects/bcb-walls`, branch `auto/code-pg-delta`, HEAD `69dfc8b2ce03f9fdf9f46e30def71e5c1951e1ee` before this fixer commit. |
| `sed -n ... AGENTS.md`, `docs/ORCHESTRATION_BINDINGS.md`, `README.md`, `docs/README.md`, required `.cursor/rules/*`, R0 report, R1 plan sections | PASS. Required rules/docs read. |
| `node /home/dev/brain/tools/code-search.mjs "backfill-canonical-from-legacy-appointments rubitime_records appointment_records reconciliation" --repo bcb -k 50` | PASS. Ran before broad/exact file inspection. |
| `sed -n ... apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` | PASS. Inspected; dry-run is read-only, but output is not PII-safe. |
| `sed -n ... apps/webapp/scripts/reconcile-appointments-domain.mjs` | PASS. Inspected; not suitable as-is for requested proof. |
| `sed -n ... apps/webapp/scripts/rubitime-appointment-mapping-audit.sql` | PASS. Inspected only. |
| `sed -n ... apps/integrator/src/infra/scripts/compare-rubitime-records.ts` | PASS. Inspected only. |
| `find . -maxdepth 3 \( -name '.env' -o -name '.env.dev' -o -name '.env.local' -o -name '.env.cutover' -o -name '.env.cutover.dev' \) -print` | PASS, empty result. No allowed local env file found in this worktree. |
| `set -a; [ -f .env ] && source .env; [ -f apps/webapp/.env.dev ] && source apps/webapp/.env.dev; set +a; node ...` | BLOCKED. `DATABASE_URL missing`. |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs --help` | PASS. Usage printed, no DB access. |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs` | BLOCKED as expected. Exit 2: `DATABASE_URL is not set after loading local .env files.` |
| `DATABASE_URL='postgres://u:p@127.0.0.1:5432/bcb_webapp_prod' node docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs` | PASS fail-safe. Refused non-dev DB before connecting. |
| `node --check docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs` | PASS. |
| `pnpm run check:rubitime-retirement-r0` | PASS. R0 guard still active. |
| `git diff --check` | PASS. |
| `pnpm exec eslint docs/_TODO/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs` | PASS. |

## R1 checklist status

Closed in this run:

- None of the data-proof checkboxes can be closed without a safe dev DB connection and actual aggregate results.

Open / blocked:

- `appointment_records` vs `integrator.rubitime_records` anti-join is run.
- max `record_at` / freshness comparison is recorded for both sources.
- raw-only records are imported to canonical or owner-waived with ids and reason.
- legacy-only records are classified.
- status/freshness mismatches are classified.
- canonical mapping coverage is recorded.
- `backfill-canonical-from-legacy-appointments` dry-run output is saved.
- owner reviews `UNMAPPED`, `DUPLICATE`, `STALE`, `CONFLICTS`.
- commit run is approved before any `--commit`.
- commit run completes, if approved.
- post-run diagnosis shows zero deltas/conflicts or approved exceptions.
- doctor calendar/list/KPI smoke confirms expected historical records.

## RR-PROOF-01-DUAL-SOURCE

Status: **BLOCKED / DRAFT**

Reason: the proof artifact structure and read-only diagnostic script are prepared, but the actual DB aggregate evidence was not collected because this worktree has no allowed local dev DB env. The legacy backfill dry-run was also not run because its current output can expose PII.

## Residual risks and owner decisions

- Owner/dev-lead needs to provide a safe dev `DATABASE_URL` in allowed local env files for `/home/dev/dev-projects/bcb-walls`, or run the command above in a safe shell and attach sanitized output.
- `backfill-canonical-from-legacy-appointments` needs either a PII-safe output mode or execution against a no-PII DB snapshot before this R1 worker can save its dry-run output.
- No raw-only/legacy-only/status/freshness/mapping facts are known from this run; entering R2 remains blocked.
- No `--commit` run was requested or executed.

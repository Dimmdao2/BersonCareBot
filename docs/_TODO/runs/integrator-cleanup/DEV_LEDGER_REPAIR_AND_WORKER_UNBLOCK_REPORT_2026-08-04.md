# DEV ledger repair + delivery-worker unblock — done, standard path verified

Response to `DEV_SCHEMA_SYNC_BRIEF_2026-08-04.md` / `DEV_SCHEMA_SYNC_REPORT_2026-08-04.md`. Branch
`wt/dev-schema-sync`. No push, no merge into `feat`. PROD/TEST not touched — every action below ran against
`bcb_webapp_dev` only (superuser `sudo -u postgres`) or edited this worktree's local, gitignored
`apps/webapp/.env.dev`.

## 1. Watermark: origin, then repair

### Origin

`drizzle.__drizzle_migrations` on DEV carried **six** contaminated rows, not one — the original report only
measured the topmost (`id=377`), which is the one that actually breaks the watermark, but five more sat at
the same slots as the four missing tags:

| id  | hash (first 8) | created_at        | slot belongs to                | verdict |
|-----|-----------------|--------------------|---------------------------------|---------|
| 371 | `17409cf6`      | …105 (0360's `when`) | none — matches no current file | alien |
| 373 | `b6880ccf`      | …106 (0361's `when`) | none — matches no current file | alien |
| 374 | `8b710551`      | …107               | **0360's real hash**, wrong slot | misplaced |
| 375 | `17409cf6`      | …108 (0365's `when`) | same alien hash as 371, again  | alien |
| 376 | `682a2cb2`      | …109 (0366's `when`) | none — matches no current file | alien |
| 377 | `9dd7b31a`      | …110 — **above the entire journal's max (109)** | none | **watermark poison** |

Cross-checked every hash above against `sha256sum` of the 363 current migration files (matches drizzle's own
`crypto.createHash('sha256').update(query)` in `pg-core/dialect.js`) — none of 371/373/375/376/377 match
anything currently committed; only 374 matches (0360's file, but stamped under 0361/0362's own `when`
window instead of its own).

This is **the same contamination class already diagnosed and fixed for TEST today**, in commit `06e01af66`
("reconcile 0360's contaminated ledger slot on TEST"): residue from an earlier manual "temporary elevation"
session that hand-applied temporarily-numbered migration files straight against a live database via
`migrate-dev.sh`, before this branch's final renumbering assigned today's tags (0360/0361/0362/0365/0366).
That commit's own header names it explicitly: *"residue from the earlier manual 'temporary elevation' VK-fix
session predating this branch's final migration renumbering."* TEST was hit at exactly one slot (0360's) and
got an append-only forward-reissue fix (0366). **DEV was hit at five slots**, and additionally picked up a
sixth row whose synthetic timestamp (110) exceeds every currently-defined journal slot — that is what turned
"a few stale rows" into "`migrate()` silently does nothing at all": drizzle-orm's installed migrator
(`pg-core/dialect.js:56-71`) reads a single `ORDER BY created_at DESC LIMIT 1` watermark *once* before the
loop and applies every journal entry whose `folderMillis` exceeds it — with `id=377` present, nothing in the
journal exceeds 110, so every one of 0361/0362/0365/0366 (and, harmlessly, 0360) was skipped, with no error.

The exact commit content for the five alien hashes (as opposed to the misplaced-but-real one) is not
recoverable from this repo's git history — no deleted/renamed file in the 0355-0369 range matches — because
per the failure mode itself, the temp-numbered file that produced them never existed under a name this repo's
history tracks; it lived only in whichever clone ran `migrate-dev.sh` against it before being renamed away.

### Repair

Verified all five files this leaves pending (0360 re-run + 0361/0362/0365/0366 genuinely new) are idempotent
by their own SQL: `GRANT` (0361, natively idempotent), `CREATE OR REPLACE FUNCTION` + `INSERT … ON CONFLICT
DO UPDATE` (0362), `CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP FUNCTION IF EXISTS`
+ `CREATE FUNCTION`, `REVOKE ALL` (0365), `DROP POLICY IF EXISTS` + `CREATE POLICY` (0360, 0366). Re-running
0360 (unavoidable once its misplaced record is cleared) is a confirmed no-op per its own file header.

SQL executed against `bcb_webapp_dev` (superuser, no application credentials used):

```sql
DELETE FROM drizzle.__drizzle_migrations WHERE id IN (371,373,374,375,376,377);
```

**Before:** 370 ledger rows, `max(id)=377`, `max(created_at)=1793539230110`.
**After:** 364 ledger rows, `max(id)=372`, `max(created_at)=1793539230104` (the last genuinely-matching row,
0358).

No other row was touched. Nothing was inserted by hand.

## 2. Standard path applied itself — verified two ways

```
bash deploy/host/migrate-dev.sh --preflight   # PASS
bash deploy/host/migrate-dev.sh --execute     # PASS
...
[migrate] Drizzle migrations complete count=363 direct=353 reconciled=10
migrate-dev: PASS (ordinary pending migrations applied to existing DEV)
```

No migration DDL was run by me — only the ledger cleanup above, then this stock command. Structural check:
`to_regclass('public.patient_specialist_links')` now returns the table (was `NULL` in the original report).

Independent re-check with the exact same standalone method the original report used
(`inspectMigrationLedgerCompleteness` / `readMigrationReconciliations`, fed hash sets read via
`sudo -u postgres psql`, no live connection):

```
[DEV]  total=363 direct=353 reconciled=10 missing=0
[TEST] total=363 direct=350 reconciled=13 missing=0
```

TEST's numbers are unchanged from the original report (`350/13/0`) — TEST was never touched this turn.

## 3. Delivery worker on DEV — root cause was not a query, and not the ledger

The four missing migrations touch nothing the worker's startup path reads — confirmed by running the worker
**before** touching the ledger; it failed identically. Root cause, found by running `pnpm run worker:dev`
directly and reading the DB-side of the failure (not from the redacted log, which always shows
`err: {"type":"Error"}` by design):

- DEV's `apps/webapp/.env.dev` sets `DB_PRINCIPAL_CONTEXT_MODE=locked` (this leaks into the integrator
  process too — `apps/integrator/src/config/loadEnv.ts` loads `webapp/.env.dev` as one of its sources). In
  locked mode, `apps/integrator/src/infra/db/integratorPoolProvider.ts`'s `selectPool()` requires a
  **dedicated** connection pool per technical role (`DATABASE_URL_DIAGNOSTIC` / `_DELIVERY_WORKER` /
  `_SCHEDULER`) and throws synchronously if the one the current DB-principal source classifies to is unset —
  before any query even runs. DEV had none of these three variables set at all.
- This exact chase already happened once, live, earlier today (2026-08-04, "D30 §Ш7") — commit `42a9a70a7`
  ("fix(track-d): close DEV C4 grant gaps, surface FOR-UPDATE-in-READ-ONLY worker crash-loop") landed six
  DEV-only, idempotent, guarded SQL overlays (`deploy/postgres/dev-c5` through `dev-c10`) that close exactly
  this gap for DEV's topology — **one shared login (`bcb_webapp_dev_user`) granted SET-only membership in the
  `app_operational_*` capability roles**, instead of PROD/TEST's four distinct operator-provisioned logins
  (`deploy/host/provision-c4-operational-runtime.sh` is hardcoded to refuse running against DEV's topology —
  see `dev-c5`'s own header). Those commits' own text confirms they were verified live against a working
  worker on 2026-08-04. **The live grants were not present in the database when I checked** (`bcb_webapp_dev_user`
  had only `app_identity_bootstrap` membership) and `DATABASE_URL_DELIVERY_WORKER` was not in
  `apps/webapp/.env.dev` — the code (git) and the live DEV database/env had drifted apart since that session;
  how is not established this turn (out of scope to chase further — flagged in §5).
- The two `[db][query] error` log lines with `queryFingerprint=d4373283fb2acf60` that both the original brief
  and my own first run show are a **red herring, not the crash**: they come from
  `initIntegratorErrorTracking` reading `error_tracking_enabled`/`error_tracking_dsn` with no DB principal
  set — that call is wrapped in its own try/catch ("dark-launch failures, never startup failures") and does
  not stop the process; they still print after the fix (harmless, pre-existing, out of this task's scope).
  The actual fatal error, from `assertDeliveryWorkerPoolReady()`'s connection probe, never reaches
  `client.ts`'s fingerprinted logger at all (that probe checks out a raw pool client directly, bypassing the
  `DbPort.query()` wrapper) — it only shows up as `Runtime worker crashed` with no fingerprint.

### Fix applied

1. Appended `DATABASE_URL_DELIVERY_WORKER` to `apps/webapp/.env.dev`, reusing the exact same connection
   string already in `DATABASE_URL` (DEV's one shared login, per `dev-c5`'s documented topology — no new
   credential created).
2. Ran the six already-committed, idempotent, self-asserting overlays against `bcb_webapp_dev` as `postgres`
   superuser, in order: `dev-c5` (membership), `dev-c6` (telemetry UPDATE grant), `dev-c7` (schema/table
   grants), `dev-c8` (remaining function grants), `dev-c9` (`release_principal_context` EXECUTE), `dev-c10`
   (platform-integration-availability EXECUTE). All six printed their own `OK` line; every file's internal
   `DO $assertions$` block passed.

This is the canonical path named in the brief, not a one-off session command: these six files are permanent,
git-committed, guarded SQL (`RAISE EXCEPTION` on wrong database/role/precondition), meant to be re-run
whenever DEV's grants drift — I ran the existing artifact, I did not write new one-off DDL.

### Proof — live run, holding cycles

```
$ timeout 65 pnpm run worker:dev
...
[INFO] Saas isolation telemetry writer ready (probeFailures: 0)
[INFO] Runtime worker started
# no crash, no tick failure, across ~65s / ~13 poll cycles (pollIntervalMs=5000) — killed by the 65s
# timeout itself (exit 143), not by the process dying
```

An earlier 25s run additionally showed `outgoing_delivery_scope_quarantined` for one real queued row —
normal operational handling of a quarantined item, not a crash.

## 4. Findings not fixed this turn

- The non-fatal `[db][query] error` pair (`queryFingerprint=d4373283fb2acf60`, from
  `initIntegratorErrorTracking`'s unprincipaled reads of `error_tracking_enabled`/`error_tracking_dsn`) still
  logs on every worker start. Harmless (swallowed), but noisy — worth its own narrow fix (wrap those two
  reads in `runWithDbInfraPrincipal`) if error-tracking is ever turned on for DEV.
- Why the `dev-c5`..`dev-c10` grants and the `DATABASE_URL_DELIVERY_WORKER` env line — both verified live
  earlier today per their own commit messages — were absent when this turn started is not established. Two
  candidates, neither confirmed: a DEV env-file edit or DB action after that session reverted them, or that
  session's "verified live" was against a database/env state that itself did not persist (e.g. a subsequent
  `bcb_webapp_dev` refresh). Same shape of problem as the migration ledger in §1 — DEV state silently drifting
  from what a past session already fixed.

## 5. What stops DEV falling behind / drifting back (proposal, not implemented)

Per the brief, this is a proposal for the owner, not a change landed this turn — every item below is more than
the "one or two lines" bar for doing it inline.

1. **Make `migrate-dev.sh --preflight` also run the ledger completeness check** (§1's read-only
   `inspectMigrationLedgerCompleteness`, proven above to work with no live connection — just three `psql`
   reads). Today `--preflight` only validates identity/role shape; it has no opinion on whether DEV's schema
   is actually current. Any agent could run this cheap check before trusting a DEV-based "verified live"
   claim, the same way I just did by hand.
2. **A `dev-c-grants --check` / `--apply` runner**, mirroring `dev-c0`..`dev-c10`'s own guard/assert idiom,
   that (a) lists every `dev-c*.sql` overlay, (b) for each, runs only its `DO $assertions$` block to report
   drift without writing, and (c) applies whichever are missing. Today these six files are undiscoverable
   except by reading `deploy/postgres/` directly — nothing lists them, nothing re-applies them, and (per §4)
   they can silently stop being true without any signal.
3. **A repeatable "does DEV's worker actually start" smoke check**, e.g. a `timeout 10s pnpm run worker:dev`
   wrapped to report "started" vs "crashed" cheaply, callable the same way `--preflight` is, so this class of
   regression is caught before an agent spends a session diagnosing it from scratch again.

None of these are implemented this turn.

## Scope discipline

- PROD: not touched.
- TEST: not touched — only read (two `SELECT hash …` queries, no writes).
- DEV data: not reset, not dumped, not recreated — only the six `drizzle.__drizzle_migrations` ledger rows
  named in §1 were deleted, and the grants named in §3 were applied via existing, git-committed SQL.
- No push, no merge into `feat`.

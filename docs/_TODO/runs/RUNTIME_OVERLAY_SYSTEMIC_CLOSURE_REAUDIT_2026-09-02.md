# Runtime-overlay systemic closure — bounded re-acceptance — 2026-09-02

Candidate: current clean `wt/runtime-overlay-current-state-20260902` HEAD `3acee2605`, carrying the
systemic correction `68b7b2c6e` and the lead's post-cutover-replay follow-up `4ab1cf72e`, merged with
current `feat/doctor-ui-rebuild`.

Authority: `AGENTS.md` §1, §9–§10b, §24; `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`;
historical FAIL `docs/_TODO/runs/RUNTIME_OVERLAY_CURRENT_STATE_AUDIT_2026-09-02.md` (F1–F3, candidate
`95e315101`).

This is a bounded acceptance recovery, not a repository-wide re-exploration. Scope is exactly the four
binary points named in the brief. No PROD command, full reset, service stop, destructive DB action, live
DB, deploy, or full CI was run.

## Overall acceptance: FAIL

Points 1 and 4 hold. Point 3 (and, as a consequence, the safety half of point 2) does not: the last
correction (`4ab1cf72e`) removed the post-B *object-body* replay from `test-settings-override.sql` but,
in doing so, left the file's own `DROP TRIGGER` with nothing to restore it — the DB-level settings lock
that schema B ships is now dropped once per full reset and never recreated. This is new since `95e315101`;
it was not present in the historical audit's F1–F3 and is not covered by the existing oracle.

## Point-by-point

### 1. Single writer, no reachable overlay/app_owner/post-B body/second writer/deleted-migration replay — PASS

- `deploy/host/runtime-overlay-rehydrate-lib.sh` is deleted (`68b7b2c6e`, confirmed absent on disk).
- `deploy/postgres/e1-webapp-runtime-config.sql` is deleted (`68b7b2c6e`).
- `run_strict_post_migration_closure`, `rehydrate_post_restore_runtime_overlays`,
  `runtime_overlay_apply_post_migration_chain`, `--post-migration-closure` are absent from
  `deploy-test-saas.sh` (test: *"the retired second closure is not reachable from the engine"*, PASS).
- Both public entrypoints (full reset → `run_port_context_test_release` →
  `cutover-postgres-port-context.sh`; code-only → `deploy-test.sh`) converge on
  `generate-cli.mjs --shared-role-baseline` + `reconcile-access.mjs` — proven by the live-stub trace test
  *"the public post-migration access closure installs declared access before releasing TEST"* (PASS) and
  *"the default full-reset path ends in that same access closure, not a second one"* (PASS).
- No SQL file reachable from `executedSqlRoots()` names `app_owner` (test PASS). Files that still name
  `app_owner` on disk (`organization-member-invites-rls.sql`, `patient-invites-rls.sql`,
  `specialist-signup-public-bootstrap-rls.sql`, `test-strict-rls-finalizer.sql`, etc., 23 files by `rg -l`)
  are unreferenced by the executed closure — named out-of-boundary in `68b7b2c6e`'s commit message and
  confirmed here by the same reachability test that would fail if any of them were wired back in.
- No post-cutover executed SQL creates a schema object outside schema B (test PASS; static proof the 44
  formerly-replayed objects all resolve in `generated/prod-to-target/schema-{pre,post}.sql` or an active
  forward migration, per `68b7b2c6e`'s message — re-verified structurally by re-running the test, not
  re-derived by hand here since it is unchanged since the last green run).

### 2. Full-reset still reaches required service/liveness/safety steps — FAIL (safety step lost; see finding below)

- Service/liveness: PASS. The trace test proves the access closure runs before any
  `systemctl restart bersoncarebot-*` and before the `/api/health` probe, and the engine's own end-state
  self-check (`deploy-test-saas.sh` step 8) still runs unchanged.
- Isolation-coverage: not a finding. The full reset never called the isolation-coverage producer in
  practice (it sat inside the now-removed unreachable closure), so nothing reachable regressed; wiring a
  producer into the reset path is a separate decision, as named in `68b7b2c6e`. No false-green or lost
  evidence path was found for this item specifically.
- DB-level settings lock (`system_settings_test_lock` on `public.system_settings`): **FAIL**, see Finding
  below. This is a required safety step in the file's own stated purpose and it is now silently dropped
  and never restored by the one place that invokes the file (`deploy-test-saas.sh` step 7, `reset` mode).

### 3. `test-settings-override.sql` is data-only; env-owned settings not restored as rows or controls — FAIL

- The env-owned keys (`dev_mode`, `debug_forward_to_admin`, `max_debug_page_enabled`,
  `integration_test_ids`, `test_account_identifiers`) are `DELETE`d, not re-inserted — correct, confirmed
  by reading the current file (`deploy/postgres/test-settings-override.sql:40-47`).
- The one previously-named exception (replaying `system_settings_test_lock_guard()`'s body) is gone:
  `4ab1cf72e` removed the `CREATE OR REPLACE FUNCTION` and the recreated `CREATE TRIGGER` that pointed at
  it, and its paired oracle/exception in `prod-to-target-cutover-path-resolvable.test.mjs` was removed in
  the same commit. Confirmed by reading both diffs and the current file end-to-end (lines 1–139): no
  `CREATE`/`CREATE OR REPLACE` statement remains in the file.
- But the file is **not data-only**: it opens with `DROP TRIGGER IF EXISTS system_settings_test_lock ON
  public.system_settings;` (line 37) — a DDL statement, needed only to bypass schema B's own lock while
  the upserts below run — and nothing after it recreates the trigger before `COMMIT` (line 136). The
  trailing `SELECT tgname, ... FROM pg_trigger WHERE tgname = 'system_settings_test_lock';` (line 138) is
  a diagnostic outside the transaction; it does not restore anything and silently returns zero rows now,
  where every prior version of this file (traced back through `c9a70b3af` .. `592ed97e8`) returned one.

## Finding

### F4 — MUST FIX — full-reset silently disables schema B's DB-level settings-lock trigger

`deploy/host/deploy-test-saas.sh` step 7 runs `test-settings-override.sql` once, in `reset` mode, as the
last content-mutating step of every full reset. That file:

1. drops `system_settings_test_lock` (`test-settings-override.sql:37`) — required because the trigger's
   function, shipped by schema B, raises on `UPDATE` of `patient_app_maintenance_enabled`,
   `specialist_signup_enabled`, `patient_program_discussion_ui_enabled`, `dev_mode` and
   `test_account_identifiers` (`deploy/postgres/generated/prod-to-target/schema-pre.sql:23895-23910`,
   `schema-post.sql:5767`), three of which this file's own upserts target;
2. never recreates it. No other file in the repo issues `CREATE TRIGGER system_settings_test_lock`
   (confirmed: `rg -n "CREATE TRIGGER system_settings_test_lock"` over the tracked tree returns exactly one
   hit, `schema-post.sql:5767`, applied once during migration, before this file runs); `deploy-test.sh`
   (the ordinary code-only path) never invokes `test-settings-override.sql` at all.

Net effect: every TEST full reset ends with the DB-level lock permanently absent for the life of that
database, contradicting the file's own header ("Enforces maintenance-on and identity-role normalization,
**and a DB-level lock**", line 4–5) and silently reopening exactly the accidental-UI-flip risk the trigger
existed to close (see the trigger's own `RAISE EXCEPTION` message, still shipped by B, calling itself a
safety lock). No existing oracle catches this: `prod-to-target-cutover-path-resolvable.test.mjs`'s
post-cutover object-body check only matches `CREATE`/`CREATE OR REPLACE` statements
(`OBJECT_BODY` regex, line 120), not a bare `DROP TRIGGER`, and nothing asserts the trigger is present at
end-state.

**Reachable consequence:** after any TEST full reset, an operator or an automated flow can flip
`patient_app_maintenance_enabled`, `specialist_signup_enabled` or `patient_program_discussion_ui_enabled`
through the ordinary settings-update path with no DB-level guard, which is the exact accident class the
lock was added to close (`c9a70b3af`, "durable identity role-allowlist normalization").

**Fix shape (not applied — this report only accepts/rejects, per brief):** recreate the trigger against the
existing schema-B function after the upserts, without replaying the function body, e.g.
`CREATE TRIGGER system_settings_test_lock BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE
FUNCTION public.system_settings_test_lock_guard();` before `COMMIT`. This does not reintroduce F1–F3: it
names the schema-B function by reference, it does not recreate it.

## Evidence reused / re-run

- Focused path oracle: re-ran `node --test deploy/host/deploy-test-full-reset.test.mjs
  deploy/host/prod-to-target-cutover-path-resolvable.test.mjs` → **13/13 pass** (0 fail) on current HEAD.
  (The brief's "9/9" is the second file alone; combined with the first file's 4 tests this is 13/13, all
  green — no regression in the existing oracle itself.)
- Generator byte check: re-ran `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs
  --check` → all four artifacts (`privileges`/`allowlist` × `bcb_webapp_dev`/`bersoncarebot_test`) match
  byte-for-byte.
- All-host-tests (57→58/58) and shell syntax/diff checks from the lead's `68b7b2c6e`/`4ab1cf72e` commit
  messages were not re-run: nothing in this bounded review touched a different host script, so that
  evidence is reused as-is per the audit-validation reuse rule (`AGENTS.md` §10 "Strong reuse rule").
- No DB, service, deploy, or full-CI command was run.

## Point 4 — oracle shape — PASS

- `executedSqlRoots()` (`prod-to-target-cutover-path-resolvable.test.mjs:34-43`) derives the executed-SQL
  set from the engine's own `"$DEPLOY_REPO/$VAR"` / `"$SRC_REPO/$VAR"` argument sites, not a hand-copied
  keep-set — directly answering audit finding K7 (frozen keep-set class) from the historical FAIL.
- Two required fault injections are present and each names the fault class from the brief:
  - *"fault injection: dropping the closure call from the public path is caught"* (line 280) — removed
    closure call, asserted to make `assertDeclarationClosureRunsBeforeRelease` throw.
  - *"fault injection: a retired-owner or object body reintroduced after the cutover is caught"* (line 293)
    — reintroduced object body + retired owner, asserted to be visible to both the object-body and
    retired-owner oracles.
- Both injections are transient in-memory string/tempfile mutations (`injected = ...`, a temp copy of the
  engine file), not tracked-tree edits; no restoration step was needed because nothing under `deploy/host`
  was written to in place.

## Commands run in this pass

```
node --test deploy/host/deploy-test-full-reset.test.mjs deploy/host/prod-to-target-cutover-path-resolvable.test.mjs
# -> 13 pass, 0 fail

node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check
# -> ok x4, "--check: артефакты соответствуют декларации побайтно."

rg -n "CREATE TRIGGER system_settings_test_lock" .
# -> exactly one hit: deploy/postgres/generated/prod-to-target/schema-post.sql:5767

grep -n "OVERRIDE\|test-settings-override" deploy/host/deploy-test.sh
# -> no output: the code-only path never invokes this file at all
```

## NOT DONE

- No fix for F4 was applied: the brief scopes this pass to acceptance (PASS/FAIL), not correction. F4 is
  reported as a MUST-FIX for the next execution pass, not silently patched here.
- No live TEST/DEV/PROD check was performed (out of the bounded scope and unavailable in this pass).
- Full host-test suite (58/58) and shell syntax checks were not re-run; reused per the strong-reuse rule
  since nothing in this pass's scope touched files outside the two re-run test files.

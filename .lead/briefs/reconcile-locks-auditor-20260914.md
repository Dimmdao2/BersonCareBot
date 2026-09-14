# Audit brief — access reconcile no longer locks every table, plus four measured prod fixes

Rules canon: `AGENTS.md` (single normative text; read it first, including §24 on audit roles).

## Test or view

**Both, and the split is fixed for you.**

- **TEST (run it, do not reason about it)** — everything about the access reconcile and the generated
  privilege artifact: the psql `\if` guards, the policy digest comparison, `lock_timeout`, the retry
  loop. There is a live `bcb_webapp_dev` database on this box and `sudo -n -u postgres psql` works.
  Claims about what PostgreSQL locks or skips must come from a run, not from reading.
- **VIEW (read and judge)** — whether the two SQL function migrations preserve the live security
  guard and whether the archived overlay note is accurate.

Start your report by saying which findings came from a run and which from reading.

## What was changed (the candidate you are auditing)

Branch `wt/audit-reconcile-locks` at `4b95edce5`. Five commits, newest last:

1. `e498547e6` — access reconcile stops taking ACCESS EXCLUSIVE on every table each deploy.
   - `deploy/postgres/privileges/generate.mjs`: new helpers `guardVariable`, `guardedExclusiveDdl`,
     `relationStateProbe`, `policyDigest`, `policySetProbe`. Section 6 (tables) and section 1b
     (private port-context relations) now wrap `ALTER TABLE … OWNER TO`, the two RLS-flag `ALTER
     TABLE`s and the `DROP POLICY`/`CREATE POLICY` block in psql `\gset` + `\if` guards. Policies
     carry `COMMENT ON POLICY … IS 'bcb1:<16 hex>'`, a digest of the exact `CREATE POLICY` text;
     the guard compares the live set of `polname || '|' || comment` with the declared array.
     Section 1a cursors got `AND pg_get_userbyid(...) <> 'app_object_owner'`. The relation-wall
     registry owner pass became a `DO` loop filtered on divergence.
   - `deploy/postgres/privileges/reconcile-access.mjs`: `SET LOCAL lock_timeout = '3s'` after
     `BEGIN`, plus a retry loop (`RETRY_BACKOFF_SECONDS = [5,15,45,90]`) that retries the whole
     transaction only when the output matches `lock timeout|deadlock detected|55P03|40P01`.
   - Regenerated `deploy/postgres/generated/privileges.*.sql` (three files).
   - `deploy/postgres/privileges/relation-access.test.mjs`: `full_description_markdown` added to the
     exact INSERT column list for `public.clinic_public_directory_entries`.
2. `401250900` — migration `20260914T120000_…email_probe…sql`: `app.open_or_touch_operator_probe_incident`
   and `app.resolve_operator_probe_incidents` learn the two email round-trip classes.
3. `d51d49ba7` — `deploy/postgres/c4-operational-runtime.sql` marked archive with a `\if` refusal.
4. `4b95edce5` — blocked-preview count moved out of a direct `SELECT` on `media_files` into
   `app.read_curated_system_health()` (`mediaPreview.blockedCount`), migration
   `20260914T130000_…`.

Both migrations are already applied to `bcb_webapp_dev`, and the reconcile has already run there
through the new code path.

## The three properties the owner asked for, in his words

1. «Трогать только то, что разошлось» — an ordinary deploy that changes nothing must take **zero**
   ACCESS EXCLUSIVE locks.
2. «Брать замок с ожиданием, а не намертво» — a busy object must not park the reconcile (and every
   later reader of that table) in the lock queue.
3. «Не держать всё одной транзакцией» — **NOT implemented**, deliberately. Judge that call too:
   the author's argument is that after (1) the steady-state transaction holds no table locks at all,
   and that splitting would trade a rare wait for a half-applied permission set. Say plainly whether
   you agree, and if not, what concretely breaks.

## Attack it here — this is where it is most likely wrong

- **The policy digest can go stale silently.** The comment dies with the policy, so a hand-run
  `DROP POLICY`/`CREATE POLICY` is caught. What about `ALTER POLICY … USING (…)`, which keeps the
  policy oid and its comment? Prove what happens. Is there any path where a declared predicate
  changes in `declaration.ts` and the guard still reports "unchanged"? Remember that policy names
  are index-numbered, so a name change is not a reliable signal.
- **Restore / fresh-cluster paths.** The artifact is also applied by `migrate-local.mjs` and on a
  `--no-owner` restore. Does a table that exists with the wrong owner, or a relation that does not
  exist at all, still fail loudly? Does the guard ever skip DDL that a restore genuinely needs?
- **psql meta-commands.** `\gset` and `\if` are client features. Prove that every consumer of
  `deploy/postgres/generated/privileges.*.sql` feeds it to psql and nothing parses it in a way the
  new lines break. Check the test helpers that read `CREATE POLICY "` lines out of the artifact.
- **The retry loop.** Does it ever retry something that is not lock contention? Does a genuine
  privilege error still fail loudly and fast? Does `SET LOCAL lock_timeout` actually cover the
  advisory lock and every statement in the transaction?
- **The two function migrations.** The live bodies carry
  `app.require_attested_context_for_roles(...)`. Confirm on `bcb_webapp_dev` that both replaced
  functions still carry their guard and that no guard was duplicated or dropped. Confirm the email
  dedup-key prefixes the application actually sends
  (`apps/integrator/src/infra/db/repos/operatorHealthDrizzle.ts`) are exactly the ones the function
  now accepts, and that `resolve_operator_probe_incidents` can actually close those rows (mind the
  `v_page_on_first_only` class filter).
- **The curated blocked-preview count.** `curatedSystemHealthSnapshotSchema` is `.strict()`. What
  happens to the health tick if the app is newer than the DB, or the DB newer than the app? Is the
  banner path (`collectCriticalHealthSignalsBase`) now doing a second expensive read?
- **The archive note on `c4-operational-runtime.sql`.** Verify the claims in its header against the
  live cluster: do `app_owner` and `app_operational_diagnostic` really not exist? Do all ten
  function bodies in that file really lack the guard the live ones have? Does the `\if` refusal
  actually stop the file, and does `provision-c4-operational-runtime.sh --self-test` still pass?

## Hard constraints

- **PROD IS OFF LIMITS.** Do not touch `135.106.187.95` (new prod) or `135.106.162.170` (old prod).
  Everything you need is on this box: `bcb_webapp_dev` and the repo.
- Never read env files with broad grep patterns. If you must know which keys exist in a file, use
  only `grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' <file> | tr -d '='`.
- You may break things temporarily on DEV to prove a point (fault injection) — roll it back. You may
  leave a deliberate acceptance test and your audit artifact. You do **not** write the product fix.
- Harmful tests are forbidden: nothing that pins counts, fixed strings, names, table names, list
  order or intermediate object shape. Tests target security and behaviour.

## Deliverable

One artifact file under `docs/_TODO/runs/` with, for each finding: what you ran, what you saw, and
whether it is CONFIRMED or a hypothesis. End with an explicit verdict on each of the three owner
properties (1 done / 2 done / 3 deliberately skipped — agree or not), and an explicit
«НЕ ПРОВЕРЕНО: …» section listing what you did not get to.

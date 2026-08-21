# D15b/6 — rollback-only named-DEV preflight, retry 4 (result, 2026-08-21)

Role: `auditor-live` in `wt/d15b6-audit-20260821`, per
`D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RETRY4_BRIEF_2026-08-21.md`. Repeat of the same saved live gate
after the language-usage metadata fix, against the exact candidate commit. Not a new blind audit, not a
product fix, not a migration apply.

Oracle: `AGENTS.md` §1 — «До аудита и landing кандидат миграции обязан пройти owner-aware rollback-only
preflight против именованной DEV из точного candidate checkout».

## Exact candidate gate

```text
git merge-base --is-ancestor 84de240b8ad113cd9bc7333313c0dbb22fd3fc32 HEAD
  -> 84de240b8 IS ancestor of HEAD

git rev-parse HEAD
  -> 878c61e23a48abff131e0eccefe5f665a47b9abe

git log --oneline 84de240b8ad113cd9bc7333313c0dbb22fd3fc32..HEAD
  878c61e23 Merge branch 'feat/doctor-ui-rebuild' into wt/d15b6-audit-20260821
  696cc534a docs(orchestration): register D15 live gate classification
  7d7a51d58 docs(#987): classify D15 live preflight gate
  9aba39ca4 Merge branch 'feat/doctor-ui-rebuild' into wt/d15b6-audit-20260821
  4f3939a92 docs(orchestration): queue D15 retry 4
  0ee353f64 docs(#987): brief D15 named-DEV preflight retry 4
  5f0a86983 docs(orchestration): queue final fixture canon pass
  d46704707 docs(orchestration): accept final D30 plan hygiene
  -> orchestration/result/queue/merge docs only, no migration diff

git log --oneline 84de240b8ad113cd9bc7333313c0dbb22fd3fc32..HEAD -- apps/webapp/db/drizzle-migrations/
  -> (empty)

git rev-parse HEAD:apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
  -> eef3e05c62b29aba3d3919efeda599e0e3c5ef12
git rev-parse 84de240b8ad113cd9bc7333313c0dbb22fd3fc32:apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
  -> eef3e05c62b29aba3d3919efeda599e0e3c5ef12
  -> exact match, matches brief's declared blob

git status --porcelain=v1 (before env copies, and again after cleanup)  -> (empty both times)
```

No later owner decision overrides this brief:

```text
grep -n "d15b6\|D15B6\|cut_over_canonical_contacts" docs/OWNER_DECISIONS.md \
  docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md
  -> no matches in either canon file

grep -n "d15b6\|D15B6\|cut_over_canonical_contacts" \
  docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md
  -> only pre-existing references to this same slice/migration/evidence file, nothing later overriding

node /home/dev/brain/tools/code-search.mjs "cut_over_canonical_contacts preflight retry4" --repo bcb -k 10
  -> only existing evidence/plan docs already accounted for; nothing newer touching this migration

ls docs/_TODO/runs/integrator-cleanup/ | grep -i D15B6
  -> only the known brief/result chain through retry3 + the retry4 brief itself; no newer ruling
```

## Mechanics

Candidate worktree carries no env. Created regular mode-0600 copies at candidate paths from the
canonical files (`/home/dev/dev-projects/BersonCareBot/.env` →
`<candidate>/.env`; `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` →
`<candidate>/apps/webapp/.env.dev`), verified neither is a symlink and both mode `0600`. A detached
(`setsid`) runner script in `/tmp` ran the wrapper with a `trap … EXIT` that deletes only those two
copies, logging to `/tmp/d15b6-candidate-preflight-retry4-20260821.log` and recording the child PID in
`/tmp/d15b6-candidate-preflight-retry4-20260821.pid`. Waited for terminal exit in this turn (process
finished in well under a minute).

Command:

```
bash deploy/host/migrate-dev.sh --preflight
```

Target: named DEV `bcb_webapp_dev` on `151.241.228.122`, via the unmodified entrypoint only (no
`--execute`, `--reapply`, direct `psql`, manual SQL, fixture, disposable DB, TEST/PROD).

## Result

**PASS** — exit code `0`. Safe last lines of the log (no env/URL/password/contact/PII values; only SQL
command tags and the wrapper's own summary/status lines):

```text
DO
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=20 reapplied=0 foreign-ledger-rows=0 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

`deploy/host/migrate-dev.sh` prints exactly this `PASS` line immediately followed by `exit 0`
(`deploy/host/migrate-dev.sh:221-222`) — confirming the run's exit status without a separate probe. No
`ERROR:` line anywhere in the 476-line log (checked with `grep -n "ERROR" <log>` → no match), unlike
retry 3's `permission denied for language plpgsql` failure. The prior `DO` statement (the
`app_object_owner`-owned `DO $d15b6_dependencies$` block that retry 3 failed on) now succeeds, confirming
the retry-4 language-usage marker fix (`-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` added ahead of that
block) holds under the real preflight path, not just the unit tests cited in the fix result.

## Rollback / ledger evidence

The wrapper's rollback-only batch is one `psql -v ON_ERROR_STOP=1` script: `BEGIN` is the third line of
the log (after two unrelated `DELETE`/`INSERT` lines from the registry-seed step), and the batch runs
uninterrupted — every subsequent statement tag succeeds (`GRANT ROLE` × many, `SET`/`RESET` pairs per
owner switch, `CREATE FUNCTION` × 34 for the `app.*` functions, further owner-scoped DDL, the previously
failing `DO` block, then a long run of `REVOKE`/`REVOKE ROLE` cleanup) through to an explicit `ROLLBACK`
as the literal last SQL statement in the log, immediately followed by the wrapper's own summary line and
`PASS`. Unlike retry 3 (where `ON_ERROR_STOP=1` aborted before reaching the trailing `ROLLBACK;` text and
the server rolled back the still-open transaction on disconnect), this run reached and executed the
`ROLLBACK` statement itself — an explicit, not implicit, rollback. The summary line's
`reapplied=0 dropped-foreign=0 unapplied=0` and the immediately-following `PASS` confirm no ledger write
occurred (`migrate-local.mjs`'s `INSERT INTO drizzle.__drizzle_migrations` only runs on `--execute`, not
`--preflight`). `git status --porcelain=v1` on the candidate tree is empty both before and after the run —
no ledger, apply or other state persisted anywhere the wrapper can reach.

## Cleanup confirmation

```text
ls <candidate>/.env <candidate>/apps/webapp/.env.dev
  -> both: No such file or directory (removed by trap)

cat /tmp/d15b6-candidate-preflight-retry4-20260821.pid; ps -p <that pid>
  -> pid 2705804 (the setsid child); ps -p 2705804 -> no such process (terminated)

pgrep -af "migrate-dev"
  -> no live migrate-dev process (only this audit's own transient grep matched itself)

fuser /tmp/bcb-dev-migrate.*.lock
  -> no output: lock not held

rm -f /tmp/d15b6-candidate-preflight-retry4-20260821.pid  (transient PID file removed post-verification)

git status --porcelain=v1
  -> (empty; candidate tracked tree clean)
```

## PASS|FAIL

**PASS.** The exact candidate `84de240b8ad113cd9bc7333313c0dbb22fd3fc32` (migration blob
`eef3e05c62b29aba3d3919efeda599e0e3c5ef12`) passes the owner-aware rollback-only named-DEV preflight gate
cleanly: all owner-scoped DDL, all 34 `app.*` function creates, and the previously-failing
`app_object_owner` `DO` block now succeed, and the batch reaches an explicit `ROLLBACK` with no ledger
write. This clears the live-gate precondition in `AGENTS.md` §1 for this candidate; it does not itself
constitute landing, independent audit acceptance, or execution.

NOT DONE: landing / execute migration / D31 combined preflight / live login-bind-delivery gate / TEST /
deploy / push / full CI.

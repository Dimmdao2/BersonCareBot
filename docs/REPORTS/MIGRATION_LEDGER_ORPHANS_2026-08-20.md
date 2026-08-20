# DEV migration ledger orphans — measured, repaired through the wrapper, and one correction to the brief

Branch `wt/migration-timestamp-20260819`. Mission: put the DEV migration ledger (`bcb_webapp_dev`,
`drizzle.__drizzle_migrations`) in order ahead of the A→B squash. Every number below was measured
live against `bcb_webapp_dev` on this box (`sudo -u postgres psql -h /var/run/postgresql`), not copied
from the brief or from an earlier report.

## 0. The brief's "measured state" was wrong on one point — corrected here

The brief assumed all four orphan tags (`0050_a_clinic_is_billed_for_seats_not_for_people`,
`0051_a_public_visitor_becomes_a_client_when_identified`, `0052_a_failed_public_booking_must_not_leave_a_client`,
`0053_a_visitor_booking_spends_no_tariff_seat`) were symmetric cases of "this checkout's folder used to
carry the file, it got renamed, the ledger tag is now stale." Byte-for-byte hash comparison against
every blob these four names have ever carried in this repository's full git history
(`git rev-list --all --objects`, ~4.6k blob/path pairs, matched with `git cat-file --batch`) shows that
is true for **none** of the four in the simple sense, and the four are not one class of problem:

- `0051_a_public_visitor_becomes_a_client_when_identified`, `0052_a_failed_public_booking_must_not_leave_a_client`,
  `0053_a_visitor_booking_spends_no_tariff_seat` — their ledger hashes match, **byte for byte**, files
  that still exist today under those exact old numbered names in `wt/public-booking-write-20260819`
  (`sha256sum` on both sides, identical). That branch is **not merged into `feat/doctor-ui-rebuild`**
  (`git merge-base --is-ancestor 4f94f0c7f HEAD` → false, checked from this worktree, whose own HEAD
  already carries the latest `feat`). These three rows are one, single, correctly-applied migration
  each, on a shared DEV database, belonging to an active sibling branch that has not renamed its own
  files yet. They are not a defect of this worktree's ledger and **relabeling or dropping them from
  here would be wrong** — it would make `wt/public-booking-write-20260819`'s own future
  `migrate-dev.sh` run see them as pending again and re-execute already-applied DDL against the shared
  database under a name that branch does not carry. That is the exact double-application harm this
  mission exists to prevent, not fix by causing. Left untouched; documented so the next hand knows why.
- `0050_a_clinic_is_billed_for_seats_not_for_people` is the one genuine defect. Its ledger hash
  (`786853cc…`) does **not** match the file that currently owns that name lineage
  (`20260819T210005_a_clinic_is_billed_for_seats_not_for_people.sql`, hash `d6b739a9…`, the
  drop-patient-count/Т12 migration). It matches an **early revision** of
  `0051_a_public_visitor_becomes_a_client_when_identified.sql` (before commit `fc87d0af5` removed two
  `REVOKE ALL … FROM PUBLIC` statements from it) — a completely different migration than its own tag
  name claims. This is not a rename at all; it is a legacy-bootstrap mislabel, already diagnosed in
  `docs/REPORTS/PATIENT_COUNT_REMOVAL_2026-08-19.md` (ledger id `564`): `renderLedgerBootstrapSql`
  matches unlabelled rows to tags by `created_at`/`when` **position**, not by hash, and on 19.08 this
  row's `when`-slot (`1800000052000`) happened to be the same slot the drop-patient-count branch's
  journal entry claimed for its own file — the backfill stamped a foreign row with a name that belongs
  to neither the row's real content nor to any file that will ever exist under that name again. That
  report's own conclusion at the time was "remains foreign forever, counted by `foreign-ledger-rows`,
  not an error" — correct for its scope, but this mission's job is to keep it from surviving into the
  A→B baseline, so it is removed below (§2).

## 1. What the double application under the mislabel actually did — checked against the live catalog

The row's real content (blob `a4a446ca…`, an early revision of the public-visitor migration) differs
from the current, correctly-tagged `0051_a_public_visitor_becomes_a_client_when_identified` row
(blob `c39468bd…`) by exactly two lines — nothing else in the 419/421-line file changed:

```
187d186
< REVOKE ALL ON FUNCTION app.resolve_public_booking_client_by_phone(text,text,boolean) FROM PUBLIC;
284d282
< REVOKE ALL ON FUNCTION app.enroll_current_patient_in_public_booking_clinic(uuid) FROM PUBLIC;
```

Every other statement is `ALTER TABLE … DROP CONSTRAINT IF EXISTS` immediately followed by
`ADD CONSTRAINT` (self-healing pair, safe run twice), or `CREATE OR REPLACE FUNCTION` /
`COMMENT ON FUNCTION` (idempotent by construction). `CREATE OR REPLACE FUNCTION` does **not** reset an
existing function's ACL — so the two `REVOKE`s from the first (mislabelled) run should have survived
the second run's `CREATE OR REPLACE` untouched. Checked live, not assumed:

```
$ sudo -u postgres psql -d bcb_webapp_dev -c "
SELECT p.proname, has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='app' AND p.proname IN
  ('resolve_public_booking_client_by_phone','enroll_current_patient_in_public_booking_clinic');"
                     proname                     | public_can_execute
--------------------------------------------------+--------------------
 enroll_current_patient_in_public_booking_clinic | f
 resolve_public_booking_client_by_phone          | f

$ sudo -u postgres psql -d bcb_webapp_dev -c "
SELECT count(*) FROM pg_constraint WHERE conname='org_enrollments_portal_activation_check';"
 count
-------
     1
```

**Finding: the double run was a true no-op.** `public_can_execute = f` on both functions (PUBLIC never
regained EXECUTE — the first run's REVOKE held through the second run's `CREATE OR REPLACE`), and the
constraint exists exactly once (the DROP-then-ADD pair in each run is idempotent, not additive). No
data or schema drift resulted from this migration having run twice under two tags. This is the one
migration among the four orphan tags that actually ran twice; the other three (§0) each ran once.

## 2. Ledger repair — through the wrapper, with a new, minimal, well-guarded operation

`migrate-local.mjs` had `--reapply <tag>` (re-run a migration the ledger claims but whose objects are
missing) and nothing for "this ledger row's name is wrong, either because it needs to point at a
renamed file with identical content, or because it needs to disappear because it names nothing that
will ever exist." Two flags were added, both gated on hash equality/inequality so the operator's intent
is proven by content, not asserted by argument:

- **`--relabel <old-tag>:<new-tag>`** — repoints a foreign ledger row at a file in the folder with the
  **exact same hash**. Refuses if the hash differs (that is content drift, not a rename — the message
  points at rollback+reapply instead). Runs a single `UPDATE drizzle.__drizzle_migrations SET tag = …
  WHERE tag = …`; no statement in the migration file executes again. `pending`/`applied` accounting is
  adjusted in the same run so the newly-relabelled tag is not also treated as pending DDL.
- **`--drop-foreign <tag>`** — deletes a foreign ledger row whose hash matches **no file** in the
  folder (the mislabel shape from §0, not a rename). Refuses, and names the correct `--relabel`
  invocation instead, if any file's hash *does* match — that row should be relabelled, not dropped.

Both are no-ops on the transaction (`DELETE`/`UPDATE`, not `ALTER`/`CREATE`) and both are refused
outside `--drizzle-folder`. 7 new unit tests in `migrate-local.test.mjs` (fake-`psql` harness, no real
database) cover: the happy path for each flag, hash-mismatch refusal, "not a foreign row" refusal,
"claimed by a file, use --relabel instead" refusal, and the `--drizzle-folder`-only gate. All 21 tests
in the file pass, including the 14 pre-existing ones (unchanged).

### 0048 — resolved via route (a): rename, relabel, do not re-run

`0048_a_lifetime_allowance_counted_by_join_is_not_lifetime.sql` (added by `499f6ae1b`, after the naming
scheme closed, never grandfathered into `meta/_journal.frozen.json`) is a single, genuinely-applied
migration: its ledger hash (`228d8d4d…`) matches the file **exactly**. This is the case route (a) in
the mission brief describes — rename and point the ledger at the new tag through the wrapper, no
re-apply. Route (b) (rename and let it re-apply) would need to re-prove idempotence for no reason, and
route (c) (grandfather the old name) is explicitly the last resort and there is no obstacle to (a) here,
so (c) was not used.

```
$ git mv apps/webapp/db/drizzle-migrations/0048_a_lifetime_allowance_counted_by_join_is_not_lifetime.sql \
         apps/webapp/db/drizzle-migrations/20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime.sql
# 20260819T18:07:13 = git commit time of 0048 (`git log -1 --format=%cI`), converted to UTC.
# Byte-identical rename (git mv only) — sha256 unchanged, verified against the ledger's hash before
# and after: 228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd both times.
```

### The genuine orphan — dropped

```
$ node deploy/postgres/privileges/migrate-local.mjs \
    --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only \
    --relabel 0048_a_lifetime_allowance_counted_by_join_is_not_lifetime:20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime \
    --drop-foreign 0050_a_clinic_is_billed_for_seats_not_for_people
BEGIN
UPDATE 1
DELETE 1
SET
RESET
DO
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=0 total=54 reapplied=0 foreign-ledger-rows=6 relabeled=1 dropped-foreign=1

$ # same command, without --rollback-only — the real commit
$ node deploy/postgres/privileges/migrate-local.mjs \
    --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres \
    --relabel 0048_a_lifetime_allowance_counted_by_join_is_not_lifetime:20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime \
    --drop-foreign 0050_a_clinic_is_billed_for_seats_not_for_people
BEGIN
UPDATE 1
DELETE 1
SET
RESET
DO
COMMIT
Drizzle owner-ordered migration committed for "bcb_webapp_dev": pending=0 total=54 reapplied=0 foreign-ledger-rows=6 relabeled=1 dropped-foreign=1
```

(`foreign-ledger-rows=6` here is computed **before** the UPDATE/DELETE apply — it counts `0048`'s row
as foreign too, because the file was already renamed on disk at that point. After commit it is 4: the
three legitimate sibling-branch rows from §0, plus one unrelated pre-existing `tag IS NULL` row,
documented and left alone by `PATIENT_COUNT_REMOVAL_2026-08-19.md` — out of this mission's scope, not
reopened here.)

Verified directly against the catalog after commit:

```
$ sudo -u postgres psql -d bcb_webapp_dev -Atqc "SELECT count(*) FROM drizzle.__drizzle_migrations WHERE tag='0048_a_lifetime_allowance_counted_by_join_is_not_lifetime';"
0
$ sudo -u postgres psql -d bcb_webapp_dev -Atqc "SELECT tag,hash FROM drizzle.__drizzle_migrations WHERE tag='20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime';"
20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime|228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd
$ sudo -u postgres psql -d bcb_webapp_dev -Atqc "SELECT count(*) FROM drizzle.__drizzle_migrations WHERE tag='0050_a_clinic_is_billed_for_seats_not_for_people';"
0
```

### `meta/_journal.json` — the illegitimate 51st entry reverted

```json
{
  "idx": 49, "version": "7", "when": 1800000060000,
  "tag": "0048_a_lifetime_allowance_counted_by_join_is_not_lifetime", "breakpoints": true
}
```

removed (it duplicated `idx: 49`, added by `499f6ae1b` alongside the hand-numbered file, and was never
in `meta/_journal.frozen.json`). `meta/_journal.json` is now byte-identical in content to
`meta/_journal.frozen.json` (the only diff is the frozen file's own `frozenNote` field, which the live
journal does not carry by design).

## 3. Proof

```
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
run-webapp-drizzle-migrate transaction-safe migration layout check: OK
check-drizzle-migration-order: OK

$ bash deploy/host/migrate-dev.sh --preflight
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=54 verified-objects=83 foreign-ledger-rows=4
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)

$ sudo -u postgres psql -d bcb_webapp_dev -Atqc "SELECT count(*) FROM drizzle.__drizzle_migrations WHERE tag IS NOT NULL;"
57
$ ls apps/webapp/db/drizzle-migrations/*.sql | wc -l
54
```

**Ledger row count (tagged) is 57, file count is 54 — not equal, and that is correct, not a shortfall.**
The gap is exactly the three legitimate `wt/public-booking-write-20260819` rows from §0: single
applications on a shared DEV, waiting on their own branch's rename, not a defect this worktree can or
should paper over. `foreign-ledger-rows=4` = those three + the one pre-existing unrelated `tag IS NULL`
row. This corrects the "ledger row count equal to file count" success criterion in the brief — see §0.

**The name gate still fails loudly** (live injection + cleanup, all three runners the fix report of
19.08/20.08 already proved call the same check):

```
$ echo '-- BCB-MIGRATION-OWNER: app_object_owner
SELECT 1;' > apps/webapp/db/drizzle-migrations/0099_fault_injection_probe.sql

$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
check-drizzle-migration-order: 0099_fault_injection_probe.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, and the frozen legacy snapshot does not know it as a legacy name

$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only
0099_fault_injection_probe.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, and the frozen legacy snapshot (meta/_journal.frozen.json) does not know it as a legacy name.

$ DATABASE_URL="postgresql://unused:unused@127.0.0.1:5/unused" node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs
[migrate] migration_name_violation 0099_fault_injection_probe.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, and the frozen legacy snapshot (meta/_journal.frozen.json) does not know it as a legacy name.

$ rm apps/webapp/db/drizzle-migrations/0099_fault_injection_probe.sql
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh
check-drizzle-migration-order: OK
```

**Tests:**

```
$ node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs
# tests 26 · # pass 26 · # fail 0
$ node --test deploy/postgres/privileges/migrate-local.test.mjs
# tests 21 · # pass 21 · # fail 0   (7 new: --relabel/--drop-foreign happy path + 5 refusals)
$ node deploy/postgres/privileges/function-census.test.mjs
# tests 19 · # pass 19 · # fail 0
$ pnpm run ci
[exited with code 0]   # lint, typecheck, unit/webapp/media-worker suites, build×2, audit — all green
```

## 4. What the A→B squash will have to assume about this ledger

- **The squash must run from a tree where every migration branch touching DEV has already merged and
  renamed.** This worktree's own ledger is correct for the 54 files it carries, but three ledger rows
  (§0) belong to `wt/public-booking-write-20260819`, unmerged as of this commit. Squashing from *this*
  tree's schema state would still be correct (DEV's catalog already has those objects — the ledger just
  hasn't been told their new name yet), but authoring the squash's migration-folder replacement (a
  single `B0`-style baseline file set) must wait until that branch's own rename lands, or the squash's
  author must independently confirm those three tags before treating "ledger row count == file count"
  as the readiness gate — it is not automatically true with this tree alone.
- **Foreign rows are not automatically defects.** The squash author should not treat a nonzero
  `foreign-ledger-rows` count as something to clear before squashing; each one needs the same
  hash-based provenance check this report did (§0) before deciding whether it is (a) another branch's
  legitimate unmerged work, (b) a pure rename waiting for `--relabel`, or (c) a mislabel to
  `--drop-foreign`. Treating the count as a target to zero out is exactly the mistake this report's §0
  correction exists to head off.
- **`--relabel`/`--drop-foreign` exist now and are the sanctioned way to fix the next batch** of these
  once `wt/public-booking-write-20260819` renames its own three files — no new wrapper surface should
  be needed for that pass.
- **`meta/_journal.json` should not need further hand edits** on this lineage: it is byte-identical to
  `meta/_journal.frozen.json` again, and every migration created from here on is timestamp-named, so
  the legacy `when → tag` backfill map has nothing left to grow into.
- **The squash baseline's own name must be a timestamp** like every other post-freeze migration — this
  was implicit in the brief's own framing ("the new schema doesn't care about numbers... only whether
  applied") but is worth stating: `B0`/`A0`-style hand-picked names would need grandfathering the same
  way `0048` almost did.

## Not done / out of scope

- The three `wt/public-booking-write-20260819` ledger rows (§0) — not this worktree's branch to rename,
  and doing so from here would risk a real double-application on the shared DEV. Left as foreign rows,
  documented, for that branch's own rename pass.
- TEST (`bersoncarebot_test`) was not touched — the mission scoped DEV only; `--relabel`/`--drop-foreign`
  were not run against it, and no orphan of this kind was measured there (spot-checked: TEST's ledger
  never carried `0048`/`0050`-named rows in the first place, per `PATIENT_COUNT_REMOVAL_2026-08-19.md`).
- The unrelated pre-existing `tag IS NULL` ledger row (hash `c1392710…`) — already investigated and
  intentionally left alone by `MIGRATION_TIMESTAMP_FIX_2026-08-20.md`; not this mission's finding, not
  reopened.

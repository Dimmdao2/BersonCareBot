# D15b/6 — schema CREATE preflight marker fix (result, 2026-08-21)

Role: same-branch worker/fixer in `wt/d15b6-audit-20260821`, per
`D15B6_SCHEMA_CREATE_MARKER_FIX_BRIEF_2026-08-21.md`. Mechanical fix of a saved live finding, not a new
audit cycle and not a migration apply.

Oracle: `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` — «It then failed at the first
`CREATE OR REPLACE FUNCTION app.*` with `permission denied for schema app`». Exact live evidence:
`D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RETRY2_RESULT_2026-08-21.md` — 34 `CREATE OR REPLACE FUNCTION app.*`
statements, 16 distinct seam owners, `BCB-MIGRATION-SCHEMA-CREATE` marker count `0` before this fix.

No later owner decision was found overriding this brief:

```text
grep -n "SCHEMA-CREATE\|d15b6\|D15B6\|cut_over_canonical_contacts" docs/OWNER_DECISIONS.md \
  docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md WORK_ORDER.md
-> no matches

node /home/dev/brain/tools/code-search.mjs "BCB-MIGRATION-SCHEMA-CREATE" --repo bcb -k 10
-> only parser/order/privilege tests and existing marker usages in sibling migrations; nothing later
   touching this migration
```

## Fix

Single file: `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`.

For every statement in this file that begins `CREATE OR REPLACE FUNCTION app.*`, inserted exactly one
`-- BCB-MIGRATION-SCHEMA-CREATE: app` line immediately after the existing `-- BCB-MIGRATION-OWNER: …` line
and immediately before the existing `-- BCB-MIGRATION-LANGUAGE-USAGE: …` line — matching the marker order
used by sibling timestamp-forward migrations, e.g.
`20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql:1-3` and
`20260819T170216_a_public_visitor_becomes_a_client_when_identified.sql:68-70`.

Command used (every `LANGUAGE-USAGE` line in this file precedes only these 34 function-create statements,
verified below, so a single global substitution on that anchor is exact):

```bash
sed -i 's/^-- BCB-MIGRATION-LANGUAGE-USAGE:/-- BCB-MIGRATION-SCHEMA-CREATE: app\n-- BCB-MIGRATION-LANGUAGE-USAGE:/' \
  apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
```

Nothing else changed: no SQL bodies, signatures, owners, languages, statement breakpoints, backfill,
constraints, `VERIFY` line, statement order, or other files. No `GRANT`/`REVOKE` added; migrator/wrapper
untouched.

## Census (exact structural proof)

Preconditions checked before the edit:

```text
grep -c "^CREATE OR REPLACE FUNCTION app\." apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> 34

grep -c "^-- BCB-MIGRATION-LANGUAGE-USAGE:" apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> 34

grep -c "^-- BCB-MIGRATION-SCHEMA-CREATE:" apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> 0

# every LANGUAGE-USAGE line is immediately preceded by an OWNER line, no marker between (34/34, 0 mismatches)
awk '
/^-- BCB-MIGRATION-OWNER:/ { ownerline=NR; next }
/^-- BCB-MIGRATION-LANGUAGE-USAGE:/ { if (NR-1==ownerline) c++; else print "MISMATCH at", NR; next }
END { print "matched:", c }
' apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> matched: 34
```

Postconditions after the edit:

```text
grep -c "^-- BCB-MIGRATION-SCHEMA-CREATE: app$" apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> 34

grep -c "^-- BCB-MIGRATION-LANGUAGE-USAGE:" apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> 34   (unchanged)

grep -c "^-- BCB-MIGRATION-OWNER:" apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> 41   (unchanged; 34 function-create owners + 7 owners for non-function statements, none of which
         gained a marker)

wc -l apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> 4351 (was 4317; +34 inserted lines, exactly the marker count)

# every SCHEMA-CREATE marker sits directly between its OWNER and LANGUAGE-USAGE line (34/34, 0 mismatches)
awk '
/^-- BCB-MIGRATION-OWNER:/ { o=NR }
/^-- BCB-MIGRATION-SCHEMA-CREATE:/ { s=NR; if (s-o!=1) print "BAD schema-create order at", s }
/^-- BCB-MIGRATION-LANGUAGE-USAGE:/ { l=NR; if (l-s!=1) print "BAD language-usage order at", l; sc++ }
END { print "blocks:", sc }
' apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> blocks: 34   (no BAD lines printed)

# every SCHEMA-CREATE marker leads to a CREATE OR REPLACE FUNCTION app.* statement (34/34)
awk '
/^-- BCB-MIGRATION-SCHEMA-CREATE:/ { sc=NR; next }
/^CREATE OR REPLACE FUNCTION app\./ { if (sc>0) n++; sc=0 }
END { print "schema-create -> function creates matched:", n }
' apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> schema-create -> function creates matched: 34
```

Result: 34/34 `CREATE OR REPLACE FUNCTION app.*` statements now carry exactly one correctly ordered
`-- BCB-MIGRATION-SCHEMA-CREATE: app` marker block (`OWNER` → `SCHEMA-CREATE` → `LANGUAGE-USAGE` →
`CREATE OR REPLACE FUNCTION app.*`); the 7 other `OWNER` lines in the file (non-function statements) carry
no marker.

## Diff inspection

```text
git diff --check
-> (empty, no whitespace errors)

git diff --stat -- apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> 1 file changed, 34 insertions(+)
```

Full diff manually reviewed: every hunk is a single added line
(`+-- BCB-MIGRATION-SCHEMA-CREATE: app`) inserted between the pre-existing `OWNER` and `LANGUAGE-USAGE`
lines of each of the 34 blocks; no other line in the file changed.

## Gates re-run (static only, no DB touched)

```text
node --test \
  deploy/postgres/privileges/migrate-local-parse.test.mjs \
  deploy/postgres/privileges/migrate-local.test.mjs \
  deploy/postgres/privileges/migration-order.test.mjs \
  deploy/postgres/privileges/migrate-local-objects.test.mjs \
  deploy/postgres/privileges/relation-access.test.mjs \
  deploy/postgres/privileges/function-census.test.mjs \
  deploy/postgres/privileges/port-context-callsite-catalog.test.mjs \
  deploy/postgres/privileges/port-context-catalog.test.mjs \
  deploy/postgres/privileges/retired-db-security-oracles.test.mjs \
  deploy/postgres/privileges/reminder-materialization-declaration.test.mjs
-> tests 152, pass 152, fail 0, cancelled 0, exit code 0
```

These are the migration/parser/order/privilege declaration gates from the accepted D15b/6 evidence
(`*.devDbProof.test.mjs` files excluded — they require a live DB, out of scope here).

## Not touched

No direct `psql`, no wrapper preflight/execute/reapply, no manual SQL, no fixture/disposable DB, no
DEV/TEST/PROD, no landing, no deploy, no push, no full CI. `git status --porcelain` shows only the intended
migration file modified plus this untracked result file before commit.

## Commit

Staged explicitly (no `git add -A`):

```text
git add apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql \
        docs/_TODO/runs/integrator-cleanup/D15B6_SCHEMA_CREATE_MARKER_FIX_RESULT_2026-08-21.md
git commit -m "fix(db): add missing schema-create markers for D15b/6 app.* function creates"
```

SHA and exact `git show --stat` output for this commit are appended below after commit.

NOT DONE: candidate named-DEV rollback-only preflight / landing / execute / D31 combined preflight / TEST /
deploy / push / full CI.

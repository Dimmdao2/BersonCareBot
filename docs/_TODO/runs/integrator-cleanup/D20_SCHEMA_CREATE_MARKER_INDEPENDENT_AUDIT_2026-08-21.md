# D20 schema CREATE marker: independent audit — 2026-08-21

## Scope and authority

- Worker branch: `wt/d20-schema-create-marker-20260821`.
- Worker SHA: `48673d707370f34062765fab38758f4b1c4aedce`.
- Comparison base: `feat/doctor-ui-rebuild` at `0af8a7885635c1854069542d35153eff2c3ffd93`.
- Authority: `AGENTS.md` §1 migration rules, §5, §10 and §24; D20 in
  `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`;
  `docs/_TODO/runs/integrator-cleanup/TRACK_D_ORCHESTRATION_HANDOFF_2026-08-21.md`;
  `docs/REPORTS/RUNTIME_MIGRATION_WRAPPER_FINAL_AUDIT_2026-08-17.md`; and the canonical transcript:

  ```text
  SET LOCAL ROLE app_seam_delivery_scope_owner
  ERROR: permission denied for schema app
  ```

This is one §24.4 quality-of-a-one-off-action audit. It does not open another behavioral audit or product scope.

## Binary verdict

**PASS.** Worker `48673d707` is the minimal valid metadata completion for the existing
`app.enqueue_integrator_outgoing_delivery(...)` function statement owned by
`app_seam_delivery_scope_owner`. It adds only the recognized marker
`-- BCB-MIGRATION-SCHEMA-CREATE: app`; executable migration SQL is unchanged. The wrapper translates the marker
into temporary `CREATE ON SCHEMA app` for that owner inside the migration transaction, executes the function DDL
under `SET LOCAL ROLE`, then revokes the schema privilege before the post-state assertion and `COMMIT`.

No reachable failure or repository-rule violation remains in the candidate. Findings: **none**.

## Exact evidence

### Diff surface and minimality

```bash
git diff --name-status feat/doctor-ui-rebuild...HEAD
```

Result:

```text
M apps/webapp/db/drizzle-migrations/20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql
```

```bash
git diff --stat feat/doctor-ui-rebuild...HEAD
```

Result: `1 file changed, 1 insertion(+)`. The exact diff is one metadata comment immediately after the existing
owner marker. Therefore there is no new migration file, function, abstraction or test, and no edit outside the
single permitted migration file.

The resulting header is owner → schema-create → language-usage → verify, followed by the existing
`CREATE FUNCTION app.enqueue_integrator_outgoing_delivery(...)`. Direct parser execution on the candidate returned:

```json
[
  {
    "owner": "app_seam_delivery_scope_owner",
    "schemaCreate": "app",
    "languageUsage": "plpgsql",
    "backfill": false
  },
  {
    "owner": "app_seam_delivery_scope_owner",
    "schemaCreate": null,
    "languageUsage": null,
    "backfill": false
  }
]
```

The marker is attached only to the function-creation statement. The later `DROP FUNCTION IF EXISTS` statement
does not receive an unnecessary schema-create or language marker.

### Executable SQL invariance and forbidden SQL

Only the recognized migration metadata families `OWNER`, `SCHEMA-CREATE`, `LANGUAGE-USAGE`, `VERIFY` and
`BACKFILL` were removed for this comparison:

```bash
diff -u \
  <(git show feat/doctor-ui-rebuild:apps/webapp/db/drizzle-migrations/20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql | sed -E '/^[[:space:]]*--[[:space:]]*BCB-MIGRATION-((OWNER|SCHEMA-CREATE|LANGUAGE-USAGE|VERIFY):|BACKFILL([[:space:]]|$))/d') \
  <(sed -E '/^[[:space:]]*--[[:space:]]*BCB-MIGRATION-((OWNER|SCHEMA-CREATE|LANGUAGE-USAGE|VERIFY):|BACKFILL([[:space:]]|$))/d' apps/webapp/db/drizzle-migrations/20260821T001200_parameterize_integrator_outgoing_delivery_enqueue.sql)
```

Exit `0`, no diff. An independent in-memory SHA-256 comparison of those stripped streams returned the same hash
for base and worker:

```text
d675d5644dbf33887bfe24b15cad2d1d8b41dffbccc4c8e328cc85adf53765cf
```

The same in-memory scan returned `forbidden_acl_role_rls_executable_lines: []`. This agrees with the repository
static migration gate below: there is no executable `GRANT`, `REVOKE`, role DDL, policy DDL or RLS toggle in the
candidate migration. The only new text is wrapper metadata, not executable ACL SQL.

### Wrapper transaction and cleanup

`parseOwnerStatements` consumes `SCHEMA-CREATE` after the owner marker and removes it from the SQL passed onward.
`migrate-local.mjs` deduplicates owner/schema pairs, starts with `BEGIN`, renders `GRANT CREATE ON SCHEMA`, changes
session authorization and uses `SET LOCAL ROLE` for the DDL, restores authorization, renders the matching
`REVOKE CREATE ON SCHEMA`, performs its post-state assertion, and only then emits `COMMIT`.

A one-off execution of the real wrapper against a temporary migration folder and a temporary fake `psql` captured
the actual stdin stream without opening a PostgreSQL socket. The captured order was:

```text
BEGIN
→ temporary owner membership
→ GRANT CREATE ON SCHEMA app
→ GRANT USAGE ON LANGUAGE plpgsql
→ SET LOCAL SESSION AUTHORIZATION
→ SET LOCAL ROLE app_seam_delivery_scope_owner
→ CREATE FUNCTION app.d20_probe()
→ RESET ROLE / RESET SESSION AUTHORIZATION
→ REVOKE CREATE ON SCHEMA app
→ REVOKE USAGE ON LANGUAGE plpgsql
→ revoke temporary membership
→ post-state assertion
→ COMMIT
```

The executable capture asserted that the schema revoke precedes both the post-state assertion and `COMMIT`; exit
was `0`. Because grant, DDL and revoke are in the same `ON_ERROR_STOP` transaction, any earlier error rolls them
back together, while a successful run commits only after explicit cleanup.

## Gates

```bash
node --test deploy/postgres/privileges/migrate-local-parse.test.mjs
```

Exit `0`: 6 passed, 0 failed.

```bash
node --test deploy/postgres/privileges/migration-order.test.mjs
```

Exit `0`: 22 passed, 0 failed, including rejection of every forbidden access-statement family and acceptance of
all active timestamp migrations.

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
```

Exit `0`: all four generated privilege/allowlist artifacts are byte-identical to the declaration.

```bash
git diff --check feat/doctor-ui-rebuild...HEAD
```

Exit `0`.

Additional existing fake-Postgres wrapper coverage:

```bash
node --test deploy/postgres/privileges/migrate-local.test.mjs
```

Exit `0`: 29 passed, 0 failed.

## Safety and handoff boundary

No DEV, TEST or PROD database, environment, service, migration entrypoint or deploy command was accessed or
mutated. No migration or full CI was run. The only wrapper execution used a temporary fake `psql`; its temporary
directory was removed after capture. The lead retains the post-land live DEV preflight named in the brief.

# Runtime migration wrapper fix: independent audit (2026-08-17)

## Scope

- Candidate: `8da88d798d932efb1dc5296b63cbabe2bacdc383`.
- Parent: `05f65bb885f78824d07f0093ee9b370fd1eeb079`.
- Fresh full clone: `/home/dev/dev-projects/bcb-wt-runtime-migration-wrapper-audit-20260817`, branch
  `wt/runtime-migration-wrapper-audit-20260817`.
- Authority: `AGENTS.md` migration, test and orchestration rules plus the bounded audit brief.
- Audit only: no product fix and no database, DEV, TEST, PROD, deploy, migration, or reconcile command.

## Verdict

**PASS.** All six statements in migration `0019` now begin with the exact
`BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner` marker required by the owner-ordered parser. The
schema-create and language-usage metadata occur only on the first statement, where the wrapper collects them once
for the migration. The other five statements have neither metadata field. The candidate changes no executable SQL:
after removing only owner/schema/language/temporary-number comment lines, parent and candidate are byte-identical.

The full migration parses into six owner steps. Independent fault injection removed and displaced the marker in
each statement separately: all **12/12** mutations were rejected at the exact affected statement. Generator
byte-identity, B0-baseline, raw-SQL and diff checks are green.

## Candidate inspection

`git diff --no-ext-diff --no-renames 8da88d7^ 8da88d7` contains only:

- movement of the existing first owner/schema/language marker block ahead of the temporary-number comment;
- one owner marker inserted immediately after each of the remaining five statement breakpoints;
- parser-shape coverage for migration `0019` and a six-statement displacement mutation test.

No SQL token, journal entry, generated artifact, schema declaration, runtime code or deployment surface changed.

## Commands and evidence

Fresh-clone dependencies were restored without network or lockfile change:

```bash
pnpm install --offline --frozen-lockfile
```

Exit `0`.

```bash
node --test deploy/postgres/privileges/migrate-local-parse.test.mjs
```

Exit `0`: **5 passed, 0 failed**. This includes the full active B0-forward journal, exact six-step shape for `0019`,
and the candidate's displacement mutation for every statement.

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
```

Exit `0`: all four DEV/TEST privilege and allowlist artifacts are byte-identical to the declaration.

```bash
node scripts/check-b0-migration-baseline.mjs
```

Exit `0`: `B0 roots + 19 webapp and 0 integrator forward migrations; no legacy chain`.

```bash
node scripts/check-no-new-raw-sql.mjs
```

Exit `0`: production raw-SQL debt `0`.

An independent in-memory audit imported `parseOwnerStatements`, parsed the complete `0019` source, asserted the
six exact owners and metadata shape, then removed and displaced each marker individually. It also compared parent
and candidate after stripping only migration metadata comments. Result:

```json
{"parsed":6,"owner":"app_seam_reminder_materialization_owner","metadata":[["app","plpgsql"],[null,null],[null,null],[null,null],[null,null],[null,null]],"marker_mutations_killed":12,"sql_semantics_identical_after_marker_strip":true}
```

```bash
git diff --check 8da88d7^ 8da88d7
```

Exit `0`.

## Safety

No live wrapper was run. No environment file, database, service, server, worker, scheduler or external channel was
read or changed by this audit.

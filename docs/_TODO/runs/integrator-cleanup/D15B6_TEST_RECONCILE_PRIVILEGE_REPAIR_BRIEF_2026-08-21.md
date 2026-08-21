# D15b/6: repair migration → reconcile-access contract before TEST recovery

Role: critical worker/debugger. Read `AGENTS.md` headings first, then §1 migration/server rules, §5, §24, `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/42-d15b6-canonical-contacts-cutover.md`, `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` Ф6 and the canonical generator entrypoint.

## Incident authority

Landed D15b/6 removed legacy contact columns, including `public.platform_users.email`. The next canonical TEST deploy step, `reconcile-access`, failed closed on:

`ERROR: column "email" of relation "platform_users" does not exist`

The current tree still names that removed column in `deploy/postgres/privileges/function-census.ts`, `deploy/postgres/privileges/declaration.ts` and generated privilege SQL. TEST services were not restarted after the failed deploy. The orchestrator explicitly accepted responsibility and the owner ordered: «исправляй».

## Required coherent repair

- Start from current clean `feat/doctor-ui-rebuild` in an isolated branch/worktree.
- Use `code-search` before exact `rg`. Trace every active function/declaration entry that still names removed `platform_users` contact columns and compare it with the post-D15 canonical function body/source. Do not blindly delete a column from metadata if executable SQL still reads it; the function must already use `user_contacts`, or the same coherent fix must correct the canonical function source in scope.
- Update the executable source of truth (`function-census.ts`, `declaration.ts`, and any directly proven canonical function source required by the incident), then regenerate canonical artifacts with the existing generator. Never hand-edit generated SQL as the source of truth.
- Keep least privilege exact: substitute the canonical `user_contacts` relation/columns actually used; do not broaden table grants, add raw GRANT/REVOKE in a migration, or bypass the generator.
- Add/adjust the smallest durable regression test that makes the exact stale-column contract red before the repair and green after it, using existing generator/census test patterns.
- Run at minimum:
  - `node deploy/postgres/privileges/generate-cli.mjs --check`
  - `node deploy/postgres/privileges/generate-cli.mjs --census`
  - `node --test deploy/postgres/privileges/function-census.test.mjs`
  - the directly relevant declaration/generator/reconcile static tests found in the repository
  - `git diff --check`
- Add a concise result artifact next to this brief, stage only explicit paths, and commit before finishing.

## Hard boundaries

No direct SQL, no DB access, no TEST/DEV/PROD mutation, no deploy/restart, no disposable database, no fixtures/accounts/data, no migration execute/reapply, no push, no full CI. Do not repair the generated file alone. Do not weaken fail-closed reconcile behavior.

This worker does not accept itself. A critical independent auditor must verify exact least-privilege mapping and regression evidence before landing. After landing, the orchestrator will run canonical DEV gates and then resume the failed TEST deploy/recovery through documented wrappers.

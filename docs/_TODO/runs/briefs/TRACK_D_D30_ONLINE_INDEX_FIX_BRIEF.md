# Track D D30 — transactional migration / online-index fix

## Authority and exact finding

- `AGENTS.md` § «Миграции: индекс на горячую колонку — в том же PR».
- `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`, Ш1/B2.
- Accepted D30 product branch commit `316342d7b` in `wt/trackd-d30-specialist`.

Root acceptance proved that `apps/webapp/db/drizzle-migrations/0328_d30_specialist_task_delivery_queue_local.sql`
contains `CREATE INDEX CONCURRENTLY`, while the installed `drizzle-orm` PostgreSQL dialect executes pending
migrations inside `session.transaction(...)`. PostgreSQL rejects `CREATE INDEX CONCURRENTLY` in a transaction.
The current candidate therefore cannot be landed or applied.

## Required fix

1. Keep the additive `organization_id` column and the rest of the accepted D30 SQL in migration `0328`, but
   remove every transaction-forbidden concurrent-index statement from the Drizzle migration.
2. In the same change add one repository-managed standalone autocommit SQL artifact for the exact existing hot
   table index `public.outgoing_delivery_queue(organization_id, status, next_retry_at)`:
   - `\set ON_ERROR_STOP on`;
   - remove only an invalid/unready residue of that exact index on retry;
   - `CREATE INDEX CONCURRENTLY IF NOT EXISTS`;
   - fail unless the final index is valid, ready, btree, non-unique, non-partial, expression-free, and has the
     exact ordered key columns.
   Use `deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql` as the repository pattern; do not invent a
   second migration runner.
3. Wire this version-matched artifact immediately after successful Drizzle migration and before service restart
   in every ordinary path that can apply `0328`: `deploy/host/migrate-dev.sh --execute`, `deploy/host/deploy-test.sh`,
   `deploy/host/deploy-test-saas.sh`, and `deploy/host/deploy-prod.sh`. Modify PROD code only; do not execute or
   connect to PROD. Respect each wrapper's existing role/env/psql conventions and cleanup traps.
4. Add a structural gate/self-test that rejects transaction-forbidden `CREATE/DROP INDEX CONCURRENTLY` inside
   any Drizzle migration and proves the standalone artifact is referenced by all four wrappers in post-migrate
   order. Prefer extending an existing migration/deploy gate over a new framework.
5. Update the D30 evidence report and audit queue with the exact finding and validation. Do not close D30 Ш3:
   DEV apply and live specialist-task delivery remain pending.

## Acceptance

- Red-first proof: current `0328` is rejected before the fix; a temporary reinjection is rejected afterward.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` and migration runner self-test PASS.
- Shell syntax checks for all touched wrappers and standalone SQL shape checks PASS.
- Existing D30 targeted tests, both typechecks, scoped lint, raw-SQL gate and `git diff --check` PASS.
- No DEV/TEST/PROD mutation; no service or port changes.
- One focused commit, clean tree, no push.

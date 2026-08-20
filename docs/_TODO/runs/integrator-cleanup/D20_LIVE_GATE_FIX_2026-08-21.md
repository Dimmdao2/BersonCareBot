# D20 post-migration live gate fix — 2026-08-21

## Result

`app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid,integer)` is now the only producer boundary for enqueue plus sent-row retention. It accepts bounded `doneRetentionDays`, preserves both protected `specialist_task_reminder` cases, and does not touch `public.notification_delivery_attempts`.

The application reads `app.read_outgoing_delivery_reclaim_config()` and invokes the literal named root inside the existing `delivery-handler` infra scope. The direct runtime cleanup helper was removed; the delivery worker keeps its declaration-derived SELECT/UPDATE-only queue access.

`operatorDeliveryAttempts.integration.test.ts` now serializes its derived `attempt_row`, avoiding the PostgreSQL resolution of the selected integer `attempt` column as `row_to_json`'s argument.

Forward migration `20260821T002100_move_outgoing_delivery_retention_to_producer_root.sql` creates the eight-argument root and drops the superseded seven-argument signature. It has owner/schema/language/verify markers and contains no ACL, role, policy, or RLS operation. Declaration capability, exact typed arguments, callsite catalog, function surface, and generated privilege/port-context artifacts match the new signature.

## Evidence

Executed locally; no DEV/TEST/PROD migration, deploy, or live fixture run was performed.

- `/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-d20-live-gate-fix-20260821 && pnpm --dir apps/integrator exec vitest run src/infra/db/repos/outgoingDeliveryQueue.namedRoot.unit.test.ts src/infra/db/repos/outgoingDeliveryReclaimSettings.test.ts src/infra/db/repos/operatorDeliveryAttempts.test.ts"` — 3 files, 8 passed.
- `pnpm --dir apps/integrator typecheck` — exit 0.
- Scoped integrator ESLint — exit 0.
- `node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs` — 5/5.
- `node --test deploy/postgres/privileges/function-census.test.mjs` — 19/19.
- `node --test deploy/postgres/privileges/migration-order.test.mjs` — 22/22.
- `node deploy/postgres/privileges/generate-cli.mjs --check` — all generated artifacts byte-identical.
- `pnpm test:db-privileges` — 154 passed, 29 skipped, 0 failed (183 total).
- `git diff --check` — exit 0.

The preserved four-file real-Postgres live gate remains for the lead after sanctioned named-DEV migration/reconcile; it was intentionally not weakened or executed here.

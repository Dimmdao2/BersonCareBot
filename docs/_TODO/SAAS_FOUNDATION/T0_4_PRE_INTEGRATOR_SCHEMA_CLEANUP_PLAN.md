# T0.4-pre integrator/public schema cleanup plan

Status: active execution plan for taskdb `#635`.

This plan replaces the missing prompt-referenced artifact in the current checkout. It is scoped to cleanup readiness before T0.4 tenant-context cutover. It does not start T0.4 runtime cutover work.

Owner ruling 2026-07-29 supersedes the settings-mirror hold recorded below: the duplicate settings table,
its webapp→integrator push route/outbox kind, tests and U9A enqueue capability are removed by taskdb `#1076`.
Integrator now reads `public.system_settings` directly and accepts the existing cache TTL of at most 60 seconds.

## Goal

Make every integrator/public duplicate or legacy table in the T0.4 runtime perimeter explicitly classified:

- canonical public business data;
- canonical or retained technical integrator state;
- transitional mirror/cache/fallback;
- deprecated legacy adapter with a concrete freeze/drop gate;
- owner-decision item that must not be silently resolved by an agent.

## Inputs

- `docs/_TODO/SAAS_FOUNDATION/CORRECTED_PLAN.md`
- `docs/_TODO/SAAS_FOUNDATION/P0_4_BATCHES.md`
- `docs/_TODO/SAAS_FOUNDATION/P0_7_WRITER_CENSUS.md`
- `docs/_TODO/SAAS_FOUNDATION/P0_8_CODE_FACTS.md`
- `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`
- `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`
- `docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`
- `docs/INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md`

## Deliverables

- Inventory: `T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md`
- Matrix: `scope-derivation/t0-4-pre-table-matrix.tsv`
- ADRs: `T0_4_PRE_SCHEMA_CLEANUP_ADR.md`
- Dry-run-first scripts: `apps/webapp/scripts/integrator-schema-cleanup/`
- Cutover checklist update: `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md`
- DB access surface update: `T0_DB_ACCESS_SURFACE.md`
- Execution log entry: `LOG.md`

## Batches

### Batch A: inventory and ADR

Status: active.

Use code index first, then targeted reads. No prod access and no PII output.

Domains:

- retired settings mirror (historical inventory only);
- reminder rules/occurrences/delivery state;
- Rubitime legacy/projection tables;
- channel identity and `integrator.contacts`;
- conversations/questions/message drafts;
- queues/logs/idempotency/provider audit state.

### Batch B: dry-run scripts

Status: active.

Scripts are dry-run by default and must not print secrets or PII. Write modes, where present, require `--commit` and must be limited to mirror/backfill operations that are already safe by ADR.

### Batch C: safe cleanup

Status: pending.

No destructive table drop is currently planned in this batch. Static inventory found live runtime references for reminders, Rubitime, contacts, and conversations/questions. Safe cleanup is limited to:

- docs and matrix;
- non-PII audit/reconcile/drop-safety tooling;
- stale documentation correction;
- dead-code removal only where source references prove no runtime caller exists.

### Batch D: validation and audit

Status: pending.

Minimum validation:

- `pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/01_audit.ts --help`
- `pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/03_reconcile.ts --repo-root ../..`
- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/webapp run lint`
- `pnpm run check:saas-db-regression`

Escalate to full CI only if code changes cross app/package boundaries or before an integration checkpoint.

## Current decision summary

- `public.system_settings` is canonical and the former duplicate table/push path are removed by owner ruling 2026-07-29.
- Reminder business rules are canonical in `public.reminder_rules`; bot-linked dispatch still runs from `integrator.user_reminder_*`.
- Rubitime is still live adapter/runtime, not removable. Canonical appointment cutover must happen first.
- `integrator.contacts` remains transitional fallback while `integrator_linked_phone_source=public_then_contacts` is the default.
- Integrator conversations/questions/drafts are still active transport state; public support tables are canonical product read models.
- Queues/idempotency/throttle/provider logs are technical state; add retention, do not collapse into business audit tables.

## Blocked destructive actions

These actions require owner approval or a separate cutover proof:

- drop `integrator.user_reminder_*`;
- flip reminder scheduling to public-only;
- drop or archive `integrator.rubitime_records/events`;
- drop `public.appointment_records` or legacy `public.booking_*`;
- remove `integrator.contacts` fallback;
- drop integrator conversations/questions/message draft tables.

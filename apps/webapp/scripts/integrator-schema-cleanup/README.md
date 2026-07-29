# Integrator schema cleanup scripts

> HISTORICAL ONE-SHOT TOOL — Rubitime выведено 2026-07-27. The suite remains only for reproducible
> integrator-schema migration audits and is not a live runtime workflow.

Dry-run-first tooling for `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_INTEGRATOR_SCHEMA_CLEANUP_PLAN.md`.

These scripts are intentionally conservative:

- default mode is read-only/dry-run;
- outputs are aggregate counts and table/status names only;
- no secrets or patient identifiers are printed;
- production execution must follow `docs/ARCHITECTURE/SERVER CONVENTIONS.md` and is not automatic.

## Scripts

```bash
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/01_audit.ts
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/03_reconcile.ts --repo-root ../..
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/04_disable_writers.ts
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/05_drop_deprecated.ts --repo-root ../..
```

## Expected workflow

1. Run `01_audit.ts` against a safe non-prod or approved target DB to collect aggregate counts.
2. Run `03_reconcile.ts` in the repo to prove drop candidates still have runtime references.
3. Use `04_disable_writers.ts` to print the exact owner-gated writers that must be disabled before destructive cleanup.
4. Use `05_drop_deprecated.ts` only to generate blocked/drop-safety output. It refuses to print destructive SQL unless a table is in the locally safe allowlist and source references are clear.

## Current policy

The current T0.4-pre ADR blocks destructive drops for reminders, Rubitime, contacts fallback, and conversations/questions transport state. Scripts therefore produce evidence and runbook output rather than dropping those tables.

# Upstream sync and SAAS DB regression checklist

Status: active pre-P0.6 gate.

Use this checklist after any upstream merge into `codex/saas-roadmap-foundation`, before starting large
SAAS micro-stages that touch DB access (`P0.6`, `P0.7`, `P0.8`, `P0.11`), and before full-CI/push
checkpoints.

## What the guard blocks

The root command `pnpm run check:saas-db-regression` runs:

- DB chokepoint guard: no new `new Pool`, `.connect()`, or guarded-layer raw SQL outside sanctioned providers/helpers/allowlist.
- DB chokepoint self-test: proves the guard still catches a synthetic offender.
- `system_settings` guard: no direct `system_settings` reads outside canonical accessors.
- SAAS P0.4 batch manifests: the 111 `organization_id` table assignments and two `be_*` FK-path declarations still match the canonical scope artifacts.
- SAAS P0.5 role split artifact guard: the scratch proof remains guarded and documents non-bypass app-role semantics.

`pnpm run audit` and therefore full `pnpm run ci` also run this guard.

## Local baseline gate

Run through the host wrapper:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && git diff --check"
```

For an upstream merge with code conflicts, also run targeted tests/lint for the conflicted files before
continuing the SAAS stage.

## Blockers

Stop and fix before continuing if any of these appear:

- a new DB pool provider is added without being named and reviewed in the DB_ACCESS funnel;
- a new `.connect()` site appears outside the checkout helpers or documented ops KEEP path;
- new SQL appears in `modules/**`, `app-layer/**`, `route.ts`, `page.tsx`, or `actions.ts` without an explicit guard allowlist decision;
- direct `system_settings` reads bypass the accessor path;
- P0.4/P0.5 artifacts no longer validate.

## What this does not prove

- It does not run the full repository test/build matrix.
- It does not execute RLS on real tables.
- It does not replace P0.7 writer census or P0.10 table-tier invariants.
- It does not authorize a push; pre-push still requires wrapped full CI.

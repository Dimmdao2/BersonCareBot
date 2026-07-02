# S2 PLAN — system_settings accessor + guard

Scope: R0/S2 only. No org_id, RLS, tenancy, billing, UI polish, production access, or mirror rewrite.

## Goal

All direct webapp runtime reads of `system_settings` go through `apps/webapp/src/infra/repos/pgSystemSettings.ts`, and CI has a guard that fails on new direct `SELECT ... FROM system_settings` outside sanctioned accessors/tests/scripts.

## Micro-stages

### S2A — central read helpers

- Add typed read helpers to `pgSystemSettings.ts` for admin-scope value reads used by runtime code:
  - raw envelope read;
  - string inner value;
  - boolean inner value with default;
  - positive integer inner value with bounds/default if needed by booking scheduling.
- Move `modules/system-settings/configAdapter.ts` DB reads onto those helpers while preserving TTL cache and env fallback behavior.
- Move `pgBookingEngine.ts`, `pgBookingRubitimeBridge.ts`, and `pgBookingScheduling.ts` direct reads onto the same helper.
- Update focused tests/mocks.

### S2B — grep guard

- Add a lightweight repo script/test that scans production `.ts` files for direct `SELECT ... FROM system_settings`.
- Allow only canonical accessors:
  - `apps/webapp/src/infra/repos/pgSystemSettings.ts`
  - `apps/integrator/src/infra/db/publicSystemSettings.ts`
  - media-worker accessors until a separate process accessor is introduced
  - documented cleanup/sync write paths and tests/scripts.
- Wire the guard into existing CI through the least disruptive existing script path.

### S2C — docs/log closure

- Update `db-access-map.md` S2 section with the new accessor/guard status.
- Add final S2 log entry with checks.

## Validation

- Targeted Vitest:
  - `src/modules/system-settings/configAdapter.test.ts`
  - `src/infra/repos/pgSystemSettings.repo.test.ts`
  - affected booking repo tests.
- Wrapped local eslint on changed files.
- `git diff --check`.
- Run new guard directly.
- Broader `pnpm --dir apps/webapp typecheck` if shared signatures change.

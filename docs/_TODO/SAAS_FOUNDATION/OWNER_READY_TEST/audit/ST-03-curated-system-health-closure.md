# ST-03 — curated System Health read closure

Date: 2026-07-16

## Result

The global-admin System Health endpoint keeps its existing admin-mode HTTP guard. Cross-tenant
diagnostics that fail under the locked principal-aware pool now use one protected operator pool and
one `SECURITY DEFINER` aggregate function.

The function owner is `NOLOGIN`, has no members, and receives `SELECT` only on the closed health
source inventory. The protected runtime login inherits only the existing `saas_telemetry_operator`
execute capability and has no direct application-table reads. Ordinary app roles cannot execute the
function.

The projection contains bounded counts, booleans, allow-listed statuses and timestamps. It does not
return row identifiers, tenant identifiers, recipients, payloads, error text, or configuration values.

## Evidence

- `node docs/_TODO/SAAS_FOUNDATION/scripts/check-curated-system-health-diagnostics.mjs` — PASS.
- `node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` — PASS.
  The disposable PostgreSQL proof verifies staff denial, protected execute, direct-table denial,
  FORCE-RLS cross-tenant aggregation, exact aggregate counts, and sentinel non-disclosure.
- Targeted Vitest: 9 files / 41 tests — PASS, including global-admin route guard and error semantics.
- Webapp TypeScript typecheck — PASS.
- ESLint on all changed TypeScript/TSX files — PASS.

No TEST deployment or full CI was run by this change set.

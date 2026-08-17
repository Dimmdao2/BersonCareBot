# #1057 / #1069 — registration tariff hardening

Worker evidence only; it is not an independent audit and did not touch DEV, TEST, or PROD.

Implemented:

- Both platform tariff deactivation paths now reject the stable `tariff_used_by_registration_tariff_policy` error when global registration policy has that tariff.
- C5A raises `registration_tariff_policy_tariff_invalid` for a non-NULL registration tariff that is missing or inactive, so the outer provisioning transaction rolls back. NULL remains legal and leaves tariff selection to the clinic.
- Production deploy fail-fast checks and applies C5A after specialist provisioning and before the dependent reference-catalog overlay.

| Command | Result |
| --- | --- |
| `bash -n deploy/host/deploy-prod.sh && node --check docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md && node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md --static-only` | PASS. Static contract includes deploy order and invalid-reference source guard. |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/modules/org-entitlements/service.test.ts src/app/api/admin/commercial/route.route.test.ts"` | PASS — 2 files, 49 tests. |
| `node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` | PASS — private disposable PostgreSQL only; proves NULL policy provisions without tariff/trial and invalid non-NULL reference raises the stable error with no organization or membership left. |
| `pnpm --dir apps/webapp exec eslint src/infra/repos/pgPlatformEntitlements.ts src/infra/repos/inMemoryPlatformEntitlements.ts src/modules/org-entitlements/service.test.ts` | PASS. |
| `pnpm --dir apps/webapp typecheck` | PASS. |
| `node scripts/check-no-new-raw-sql.mjs && git diff --check` | PASS. |
| `bash -n deploy/host/deploy-prod.sh` plus targeted deploy-order assertion in the static smoke | PASS. |

The full smoke initially exposed its stale minimal bootstrap: it omitted migrations `0289` and `0291`, now included in its existing private migration list. No migration, journal, schema, environment, role, queue, or host state was changed.

## Race fix round

The independent acceptance found that concurrent registration-policy assignment and tariff archival could
both commit. This round changes only `pgPlatformEntitlements.ts`: the active-tariff authority read and both
tariff deactivation paths acquire `FOR UPDATE` on the same `saas_tariffs` row. The losing transaction then
observes the winner's committed state and returns the existing domain error.

| Command | Result |
| --- | --- |
| `node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` | PASS — the saved disposable PostgreSQL race acceptance is green. |
| `pnpm --dir apps/webapp exec vitest run src/modules/org-entitlements/service.test.ts` | PASS — 1 file, 48 tests. |
| `node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md --static-only && bash -n deploy/host/deploy-prod.sh && node --check docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` | PASS. |
| `pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp run typecheck` | PASS. |
| `pnpm --dir apps/webapp exec eslint src/infra/repos/inMemoryPlatformEntitlements.ts src/infra/repos/pgPlatformEntitlements.ts src/modules/org-entitlements/service.test.ts && node scripts/check-no-new-raw-sql.mjs && git diff --check` | PASS — raw-SQL gate: integrator manifest files 7; webapp manifest files 21. |

No DEV, TEST, or PROD action ran; no migration, schema, journal, deploy ordering, test suite, or audit scope changed.

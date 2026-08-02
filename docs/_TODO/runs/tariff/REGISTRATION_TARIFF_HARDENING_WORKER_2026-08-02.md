# #1057 / #1069 — registration tariff hardening

Worker evidence only; it is not an independent audit and did not touch DEV, TEST, or PROD.

Implemented:

- Both platform tariff deactivation paths now reject the stable `tariff_used_by_registration_tariff_policy` error when global registration policy has that tariff.
- C5A raises `registration_tariff_policy_tariff_invalid` for a non-NULL registration tariff that is missing or inactive, so the outer provisioning transaction rolls back. NULL remains legal and leaves tariff selection to the clinic.
- Production deploy fail-fast checks and applies C5A after specialist provisioning and before the dependent reference-catalog overlay.

| Command | Result |
| --- | --- |
| `bash -n deploy/host/deploy-prod.sh && node --check docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs --static-only` | PASS. Static contract includes deploy order and invalid-reference source guard. |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/modules/org-entitlements/service.test.ts src/app/api/admin/commercial/route.route.test.ts"` | PASS — 2 files, 49 tests. |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs` | PASS — private disposable PostgreSQL only; proves NULL policy provisions without tariff/trial and invalid non-NULL reference raises the stable error with no organization or membership left. |
| `pnpm --dir apps/webapp exec eslint src/infra/repos/pgPlatformEntitlements.ts src/infra/repos/inMemoryPlatformEntitlements.ts src/modules/org-entitlements/service.test.ts` | PASS. |
| `pnpm --dir apps/webapp typecheck` | PASS. |
| `node scripts/check-no-new-raw-sql.mjs && git diff --check` | PASS. |
| `bash -n deploy/host/deploy-prod.sh` plus targeted deploy-order assertion in the static smoke | PASS. |

The full smoke initially exposed its stale minimal bootstrap: it omitted migrations `0289` and `0291`, now included in its existing private migration list. No migration, journal, schema, environment, role, queue, or host state was changed.

Remaining: independent audit only. PROD was not run.

# Correction report — dirty-tree salvage 2026-08-17

## Fixed root causes

- Removed the active disposable/A0 and generated PROD A→B0 cutover surfaces, their commands, and tracked runtime/debug output. `check-b0-migration-baseline.mjs` now rejects those executable topologies structurally.
- `deploy-prod.sh` no longer invokes the DEV-only migrator; it performs only the B0 structural check while the owner-deferred production schema transition has no executable entrypoint.
- `deploy-test.sh` takes its exclusive lock before allocating a unique `mktemp` transcript.
- Patient practice completion and material-rating write ports now call exact patient named roots, each enforcing the attested patient context plus active org enrollment. Material ratings are explicitly enabled by the registry default; an existing runtime DB override still takes precedence and must be checked on named DEV.

## Patient mutation inventory

All `apps/webapp/src/app/api/patient/**/route.ts` write routes were reviewed. The two demonstrated direct-table paths are repaired above. Existing capability paths cover booking, current-patient LFK sessions, booking reminder preference, and reminder occurrence actions; non-DB analytics/cache actions are safe. Program-item discussion and reminder-rule CRUD retain direct RLS/Drizzle paths and therefore remain a named-DEV verification/capability-conversion blocker rather than a false PASS.

## Commands and exact results

- `node scripts/check-b0-migration-baseline.mjs` → PASS: `B0 roots + 14 webapp and 0 integrator forward migrations; no legacy chain`.
- `bash -n deploy/host/deploy-test.sh && bash -n deploy/host/deploy-prod.sh` → PASS.
- `node deploy/postgres/privileges/generate-cli.mjs --all && ... --check` → PASS; generated declaration artifacts match.
- `pnpm --dir apps/webapp exec vitest --run src/app/api/tariffMechanics.route.test.ts` → 42/42 PASS.
- `pnpm --dir apps/webapp typecheck` → PASS.
- `node --test scripts/checked-push-security.test.mjs` → 2/2 PASS.
- `gitleaks git . --no-banner --redact --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore --report-format sarif --report-path /tmp/bcb-gitleaks-dirty-tree-salvage.sarif` → 0 findings (7,272 commits; 183.55 MB).

## Named blocker

No TEST or PROD action was run. Live named-DEV proof is still required for appointment `end_at` classification, program-comment mutation/readback, reminder-settings mutation/readback, and the current DB override state of `material_ratings_enabled`; none is claimed PASS here.

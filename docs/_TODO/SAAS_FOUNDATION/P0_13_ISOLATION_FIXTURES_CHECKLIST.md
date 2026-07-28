> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# P0.13 Isolation Fixtures Checklist

Status: executable checklist for P0.13.1-P0.13.3.

Purpose: prove tenant and patient isolation with synthetic data under non-bypass roles, then confirm current
single-clinic behavior remains unchanged in dormant mode.

## P0.13.1 Synthetic Fixture Factory

Checklist:

- [x] Create synthetic second organization fixture. (✓ scripts/p0-13-synthetic-fixtures.mjs + smoke-p0-13-synthetic-fixtures.mjs | check-p0-13-synthetic-fixtures.mjs PASS)
- [x] Create synthetic patient/user pairs for at least two organizations. (✓ syntheticFixtureIds patientA1/A2/B1 in p0-13-synthetic-fixtures.mjs)
- [x] Create scoped rows across representative direct-org, FK-path, denorm-path, bootstrap, and integrator tables. (✓ renderP013SyntheticFixtureScratchSql in p0-13-synthetic-fixtures.mjs)
- [x] Guard fixture execution so it never writes to dev/prod PII DB without explicit scratch opt-in. (✓ bcb*saas*..._scratch name guard, refuses bcb_webapp_(dev|prod|test), in smoke-p0-13-synthetic-fixtures.mjs)
- [x] Use deterministic IDs and cleanup/rollback strategy. (✓ deterministic syntheticFixtureIds UUIDs; scratch DB dropped per run)

Forbidden:

- No fixture writes to `bcb_webapp_dev` by default.
- No real patient identifiers.
- No external-channel delivery.

## P0.13.2 DB-Level Isolation Assertions

Checklist:

- [x] Run under non-bypass app role in scratch/non-prod. (✓ CREATE ROLE ... NOLOGIN NOBYPASSRLS + SET ROLE in smoke-p0-13-db-isolation.mjs; scratch DB only)
- [x] Correct org sees own SCOPED rows. (✓ smoke-p0-13-db-isolation.mjs org-A/org-B SELECT assertions | check-p0-13-db-isolation.mjs PASS)
- [x] Wrong org sees zero rows. (✓ smoke-p0-13-db-isolation.mjs cross-org zero-row assertion — SCRATCH proof, prod stays dormant)
- [x] Missing/empty org fails closed in enforce mode. (✓ "missing app.org must fail closed" USING(false) in smoke-p0-13-db-isolation.mjs — scratch enforce, not live prod)
- [x] Patient wall blocks cross-patient access inside the same org where patient predicate applies. (✓ "patient A1 must not see patient A2" in smoke-p0-13-db-isolation.mjs)
- [x] Bootstrap global rows remain readable where intended. (✓ "bootstrap global row must remain readable" assertion)
- [x] INFRA/TELEMETRY/LEGACY treatment matches descriptors. (✓ INFRA/TELEMETRY readable, LEGACY frozen-deny assertions in smoke-p0-13-db-isolation.mjs)

## P0.13.3 App-Level Dormant Smoke

Checklist:

- [x] Current single-clinic doctor smoke unchanged. (✓ e2e/doctor-pages-inprocess.test.ts | check-p0-13-app-dormant-smoke.mjs RAN vitest 2026-07-23 PASS)
- [x] Current patient smoke unchanged. (✓ e2e/patient-playback-inprocess.test.ts, in-process, DATABASE_URL="" | dormant-smoke vitest PASS)
- [x] Dev-bypass still works in development. (✓ devBypassPolicy.ts nodeEnv==='development' guard + appEntryClassification.test.ts)
- [x] No subagent starts a dev server unless the stage explicitly requires UI smoke. (✓ in-process tests, no server spawn; USE_REAL_DATABASE=0)
- [x] No real external channels are triggered. (✓ getTelegramBotToken/getMaxBotApiKey stubbed to "" in exchangeIntegratorToken.devBypassPhoneTrust.test.ts)

## Local Gate

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <fixture/isolation tests> && git diff --check"
```

Full CI is appropriate at the P0.13 integration checkpoint before push/merge readiness.

## Definition Of Done

- Fixture factory is scratch-safe by default.
- DB-level org and patient walls fail closed under non-bypass role.
- App-level dormant mode preserves existing single-clinic behavior.

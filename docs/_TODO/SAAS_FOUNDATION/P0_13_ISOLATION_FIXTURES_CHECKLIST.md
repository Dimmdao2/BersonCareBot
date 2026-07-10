# P0.13 Isolation Fixtures Checklist

Status: executable checklist for P0.13.1-P0.13.3.

Purpose: prove tenant and patient isolation with synthetic data under non-bypass roles, then confirm current
single-clinic behavior remains unchanged in dormant mode.

## P0.13.1 Synthetic Fixture Factory

Checklist:

- [x] Create synthetic second organization fixture.
- [x] Create synthetic patient/user pairs for at least two organizations.
- [x] Create scoped rows across representative direct-org, FK-path, denorm-path, bootstrap, and integrator tables.
- [x] Guard fixture execution so it never writes to dev/prod PII DB without explicit scratch opt-in.
- [x] Use deterministic IDs and cleanup/rollback strategy.

Forbidden:

- No fixture writes to `bcb_webapp_dev` by default.
- No real patient identifiers.
- No external-channel delivery.

## P0.13.2 DB-Level Isolation Assertions

Checklist:

- [x] Run under non-bypass app role in scratch/non-prod.
- [x] Correct org sees own SCOPED rows.
- [x] Wrong org sees zero rows.
- [x] Missing/empty org fails closed in enforce mode.
- [x] Patient wall blocks cross-patient access inside the same org where patient predicate applies.
- [x] Bootstrap global rows remain readable where intended.
- [x] INFRA/TELEMETRY/LEGACY treatment matches descriptors.

## P0.13.3 App-Level Dormant Smoke

Checklist:

- [x] Current single-clinic doctor smoke unchanged.
- [x] Current patient smoke unchanged.
- [x] Dev-bypass still works in development.
- [x] No subagent starts a dev server unless the stage explicitly requires UI smoke.
- [x] No real external channels are triggered.

## Local Gate

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <fixture/isolation tests> && git diff --check"
```

Full CI is appropriate at the P0.13 integration checkpoint before push/merge readiness.

## Definition Of Done

- Fixture factory is scratch-safe by default.
- DB-level org and patient walls fail closed under non-bypass role.
- App-level dormant mode preserves existing single-clinic behavior.

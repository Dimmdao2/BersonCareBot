# SaaS Product Smoke A1

Status: Phase A1 executable contract, 2026-07-14.

Scope: define the product-smoke matrix and fixture contract required before Tenant Hard Mode can use dormant,
shadow, or locked product parity as an executable gate. This does not authorize TEST/PROD access and does not store
credentials or patient data in the repository.

Canonical inputs:

- `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md` Phase A1.
- `docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md`.
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md` as pre-Tenant input only.
- `docs/OPERATIONS/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md` for the fresh-copy/Rubitime boundary.

## Commands

DB-free contract validation:

```bash
pnpm run check:saas-product-smoke-contract
```

Real deployed-environment smoke, owner-authorized only:

```bash
pnpm run smoke:saas-product -- \
  --mode=dormant \
  --base-url=https://test.bersoncare.ru \
  --fixture-file=/run/bersoncarebot/saas-smoke.fixture \
  --json-output=/tmp/saas-product-smoke.json \
  --junit-output=/tmp/saas-product-smoke.junit.xml
```

The fixture file is root/operator-managed and must not be committed. It supplies auth headers/cookies and opaque
fixture IDs only. The runner masks auth material and never prints response bodies.

## A1 Checklist

- [x] Route/API/state matrix is versioned in `saas-product-smoke-contract.json`.
- [x] Read-only dormant smoke is separated from controlled mutation scenarios.
- [x] Runner supports `--mode dormant|shadow|locked`.
- [x] Runner emits machine-readable JSON and optional JUnit.
- [x] Runner fails on 401/403/5xx, Next render digests, permission/RLS text, unexpected empty fixture facts, and
  configured forbidden body text.
- [x] Self-tests prove failure classifiers, including the known G1 doctor/admin identity symptom classifier.
- [x] No prod auth bypass, env read, DB read/write, live delivery, S3 operation, or Rubitime cleanup is performed by
  the contract validation command.

## Fixture Shape

Minimal shape:

```json
{
  "schemaVersion": 1,
  "authProfiles": {
    "doctor": { "headers": { "Cookie": "..." } },
    "clinic_admin": { "headers": { "Cookie": "..." } },
    "patient": { "headers": { "Cookie": "..." } },
    "public": { "headers": {} }
  },
  "refs": {
    "doctorClientUserId": "opaque-user-id",
    "patientProgramInstanceId": "opaque-program-id",
    "patientProgramItemId": "opaque-item-id",
    "mediaFileId": "opaque-media-id",
    "publicBookingServiceId": "opaque-service-id"
  },
  "forbiddenBodyText": ["unexpected test sentinel"]
}
```

Fixture files may contain real TEST auth material and must live outside the repo. Do not log or commit them.

## Known A1 Boundary

This stage creates the oracle and self-tests it. It does not claim R1 product parity and does not prove G1 on a live
fresh-copy deployment until an owner-authorized fixture/base URL is provided.

## A2 Integration

Phase A2 adds the nginx forwarded-host contract:

```bash
pnpm run check:saas-a2-nginx-forwarded-host
```

`deploy/host/deploy-test-saas.sh` runs the same check against `nginx -T` after TEST unit restart, and runs this
product smoke only when `SAAS_PRODUCT_SMOKE_FIXTURE=/run/bersoncarebot/saas-smoke.fixture` is supplied by the
operator. Without that fixture it skips the product smoke instead of inventing proof.

For B1 calibration, the same runner can narrow to the doctor/admin subset:

```bash
pnpm run smoke:saas-product -- \
  --mode=dormant \
  --base-url=https://test.bersoncare.ru \
  --fixture-file=/run/bersoncarebot/saas-smoke.fixture \
  --categories=doctor,schedule,working_hours,bookings,client_card,admin_settings,system_health
```

The TEST deploy wrapper accepts the same filter via `SAAS_PRODUCT_SMOKE_CATEGORIES` or
`SAAS_PRODUCT_SMOKE_SCENARIO_IDS`.

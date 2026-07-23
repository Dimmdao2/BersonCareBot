> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# SaaS Product Smoke A1

Status: Phase A1 executable contract, 2026-07-14.

Scope: define the product-smoke matrix and fixture contract required before Tenant Hard Mode can use dormant,
shadow, or locked product parity as an executable gate. This does not authorize TEST/PROD access and does not store
credentials or patient data in the repository.

Canonical inputs:

- `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md` Phase A1.
- `docs/_ARCHIVE/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md` (archived reasoning only; do not execute).
- `docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md` as pre-Tenant input only.
- `docs/OPERATIONS/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md` for the fresh-copy/Rubitime boundary.
- `docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md` for the owner/operator fixture
  preparation workflow.

## Commands

DB-free contract validation:

```bash
pnpm run check:saas-product-smoke-contract
```

This command includes the runner self-test, a synthetic fixture preflight and checker mutation proofs. Root `audit`
runs it directly, so the same gate is part of full CI rather than an optional operator-only check.

DB-free fixture preflight for an operator-managed fixture file:

```bash
pnpm run smoke:saas-product -- \
  --check-fixture \
  --fixture-file=/run/bersoncarebot/saas-smoke.fixture \
  --categories=doctor,schedule,working_hours,bookings,client_card,admin_settings,system_health
```

This validates only the contract and fixture shape, plus non-empty selected scenario filters. It performs no HTTP
requests, reads no env files, touches no DB/services, and prints only redacted aggregate metadata: auth profile names
with header counts, fixture ref keys, forbidden-text count, and selected scenario/category counts. It is **not** a
D3/R1/R2 PASS and cannot replace the owner-authorized live product smoke.

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

- [x] Route/API/state matrix is versioned in `saas-product-smoke-contract.json`. (✓ evidence)
- [x] Read-only dormant smoke is separated from controlled mutation scenarios. (✓ evidence)
- [x] Runner supports `--mode dormant|shadow|locked`. (✓ evidence)
- [x] Runner emits machine-readable JSON and optional JUnit. (✓ evidence)
- [x] Runner fails on 401/403/5xx, Next render digests, permission/RLS text, unexpected empty fixture facts, and
  configured forbidden body text. (✓ evidence)
- [x] JSON API scenarios assert successful response semantics and their relevant fixture fact; a non-empty error
  object or an empty appointments/working-hours/slots/summary payload cannot count as PASS. (✓ evidence)
- [x] The `public` profile is required to have zero auth headers, authenticated profiles require non-empty auth
  material, redirects are classified before they can resolve to a login page, and JSON/JUnit evidence records path
  templates rather than rendered fixture identifiers. (✓ evidence)
- [x] Self-tests prove failure classifiers, including the known G1 doctor/admin identity symptom classifier. (✓ evidence)
- [x] No prod auth bypass, env read, DB read/write, live delivery, S3 operation, or Rubitime cleanup is performed by
  the contract validation command. (✓ evidence)

## Fixture Shape

Minimal shape:

```json
{
  "schemaVersion": 1,
  "authProfiles": {
    "doctor": { "headers": { "Cookie": "..." } },
    "clinic_admin": { "headers": { "Cookie": "..." } },
    "patient": { "headers": { "Cookie": "..." } },
    "global_admin": { "headers": { "Cookie": "..." }, "adminMode": true },
    "public": { "headers": {} }
  },
  "refs": {
    "doctorClientUserId": "opaque-user-id",
    "patientProgramInstanceId": "opaque-program-id",
    "patientProgramItemId": "opaque-item-id",
    "mediaFileId": "opaque-media-id",
    "publicBookingBranchId": "opaque-branch-id",
    "publicBookingClinicServiceId": "opaque-clinic-service-id",
    "publicBookingOrganizationSlug": "opaque-organization-slug",
    "clinicAAppointmentId": "opaque-appointment-id"
  },
  "forbiddenBodyText": ["unexpected test sentinel"]
}
```

Fixture files may contain real TEST auth material and must live outside the repo. Do not log or commit them.
`global_admin` is a distinct operator session captured only after admin mode was explicitly enabled; a clinic owner
or ordinary doctor cookie cannot satisfy the System Health probe. The same gate includes negative doctor and
clinic-admin requests, public no-cookie `/app`/login/registration/`/book` probes, and an opt-in global-admin
clinical-write denial probe.

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
operator. Without that fixture it records the product smoke as **SKIPPED/BLOCKED**, not PASS; D3, R1, R2, and any
future flip gate must remain open until an owner/operator-managed fixture file path is supplied and the smoke exits
0. The fixture path is a secret-file pointer outside the repo; fixture values, cookies, headers, and opaque IDs must
not be written into repository docs, logs, or shell history.

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

## D3.0 Fixture Gate Contract

- `SAAS_PRODUCT_SMOKE_FIXTURE` unset means **SKIPPED/BLOCKED**, never PASS.
- The allowed next command shape is the committed runner with a supplied path:
  `pnpm run smoke:saas-product -- --mode=locked --base-url=https://test.bersoncare.ru --fixture-file=/run/bersoncarebot/saas-smoke.fixture`.
- The path is owner/operator-managed and may point to a root-managed secret file; the repository must not contain
  real fixture values or fallback defaults.
- Static checks may validate wording and wrapper behavior only. They must not read `/opt/env`, TEST/prod databases,
  TEST/prod secret files, SSH, services, or live delivery channels.

## D3.1 Offline Fixture Preflight

- Operators may run `--check-fixture --fixture-file=...` before authorizing live smoke to confirm the fixture file
  parses, satisfies the A1 schema, and has a non-empty selected scenario set.
- `--categories` and `--scenario-ids` are honored in preflight only to prove the requested subset maps to at least
  one contract scenario and all referenced fixture keys are present.
- The preflight output is aggregate/redacted and must not include cookie/header values, fixture ref values, response
  bodies, or credential-bearing URLs.
- Offline preflight is a readiness check for the secret fixture file only. D3/R1/R2 remain blocked until the owner
  supplies the readable fixture path and authorizes the real deployed-environment smoke against TEST.

## D3.2 Fixture Operator Packet

`SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md` is the handoff packet for the owner/operator-managed fixture file.
It pins `/run/bersoncarebot/saas-smoke.fixture`, the REDACTED non-runnable JSON shape, the offline preflight order,
the owner-authorized live TEST smoke order, prohibited actions, and the evidence boundary. It is a fixture readiness
packet only, not D3/R1/R2 PASS evidence.

## D3.3 Meaningful JSON Evidence

The live smoke accepts a JSON scenario only when the response satisfies its scenario-level assertion in
`saas-product-smoke-contract.json`. `{ "ok": false, "error": "..." }` never satisfies either legacy JSON
expectation. The D3 contract additionally requires non-empty doctor appointments, working-hours rows, and public
slots; the discussion summary must contain a non-empty fact for the requested `patientProgramItemId`; and media
playback must return the requested `mediaFileId`, bind the progressive URL to that ID, and report one of the real
`hls|mp4|file` delivery modes. These are response facts from the owner-managed fixture, not inferred fallback data.
Empty or mismatched fixture facts keep D3/R1/R2 blocked even when every HTTP status is 200.

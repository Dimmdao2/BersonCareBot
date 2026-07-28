# SaaS Product Smoke Fixture Operator Packet

Status: D3.2 operator handoff packet, 2026-07-14.

Purpose: make the owner/operator fixture preparation workflow explicit and machine-checkable before the live TEST
product smoke. This packet only describes how to prepare and preflight the fixture file. It is not D3, R1, or R2
PASS evidence, does not authorize TEST execution, and does not prove product parity.

## Boundary

- The fixture file is an owner/operator-managed secret file outside the repository.
- The expected path for current runbooks is `/run/bersoncarebot/saas-smoke.fixture`.
- Repository docs may show only REDACTED placeholder examples marked non-runnable.
- Offline preflight proves fixture readiness only.
- Live smoke PASS requires the actual owner-authorized smoke command output against TEST.

## Owner / Operator Responsibilities

1. Create the fixture file outside the repo, for example `/run/bersoncarebot/saas-smoke.fixture`.
2. Populate it with TEST-only auth headers/cookies and opaque fixture refs for existing TEST accounts and records.
   Capture `global_admin` separately after POST `/api/admin/mode` has returned `adminMode=true`; do not reuse a
   clinic-owner or doctor session.
3. Keep file permissions narrow enough that only the operator-approved process/user can read it.
4. Run the offline `--check-fixture` command before authorizing live smoke.
5. Authorize live TEST smoke separately and capture aggregate-only evidence.
6. Remove or rotate the fixture material after the authorized smoke window if the operator policy requires it.

## Required JSON Shape

The shape below is aligned with the current A1 runner contract. This example is **REDACTED_PLACEHOLDER_NON_RUNNABLE**
and is not proof that a fixture exists or works.

```json
{
  "schemaVersion": 1,
  "authProfiles": {
    "doctor": { "headers": { "Cookie": "REDACTED_PLACEHOLDER_NON_RUNNABLE" } },
    "clinic_admin": { "headers": { "Cookie": "REDACTED_PLACEHOLDER_NON_RUNNABLE" } },
    "patient": { "headers": { "Cookie": "REDACTED_PLACEHOLDER_NON_RUNNABLE" } },
    "global_admin": {
      "headers": { "Cookie": "REDACTED_PLACEHOLDER_NON_RUNNABLE" },
      "adminMode": true
    },
    "public": { "headers": {} }
  },
  "refs": {
    "doctorClientUserId": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE",
    "patientProgramInstanceId": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE",
    "patientProgramItemId": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE",
    "mediaFileId": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE",
    "publicBookingBranchId": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE",
    "publicBookingClinicServiceId": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE",
    "publicBookingOrganizationSlug": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE",
    "clinicAAppointmentId": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE"
  },
  "forbiddenBodyText": ["REDACTED_TEST_SENTINEL_NON_RUNNABLE"]
}
```

Allowed auth header names are `Cookie`, `Authorization`, `x-bersoncare-smoke-auth`, or explicit `x-smoke-*`
operator headers. Doctor, clinic-admin, patient, and global-admin profiles each require at least one non-empty auth
header. `global_admin.adminMode=true` records that the operator explicitly enabled admin mode before capturing that
separate session; reusing the clinic-admin cookie is invalid. The public profile must have no headers so
public/bootstrap coverage cannot be satisfied by a staff session. The `refs`
values are opaque TEST identifiers required only for rendering requests. JSON/JUnit evidence stores the contract
path templates and never the rendered ref values.

## Command Order

1. Offline fixture readiness check, DB-free and network-free:

```bash
pnpm run smoke:saas-product -- \
  --check-fixture \
  --fixture-file=/run/bersoncarebot/saas-smoke.fixture \
  --categories=doctor,schedule,working_hours,bookings,client_card,admin_settings,system_health
```

### Canonical public-slot refs upgrade (root operator only)

When the protected fixture predates the canonical public-slots contract and still has only
`publicBookingServiceId`, do not discover or paste database identifiers by hand. After the exact code revision is
present in `/opt/projects/bersoncarebot-test`, run this single command from a root session:

```bash
bash /opt/projects/bersoncarebot-test/deploy/host/update-saas-product-smoke-fixture-canonical-slots.sh
```

The entrypoint is pinned to `/opt/env/bersoncarebot/webapp.test`, exact database `bersoncarebot_test`, exact fixture
`/run/bersoncarebot/saas-smoke.fixture`, and the canonical TEST checkout. It performs only a read-only catalog query.
It verifies the canonical env-file boundary but deliberately does not source or print that file; the fixed local
PostgreSQL operator query independently verifies `current_database()` before accepting any result.
The existing public slug must resolve to exactly one active organization; when the old
`publicBookingServiceId` legacy ref is present it must resolve to the same organization and the same single active
branch/service availability. Zero or multiple matches fail closed. Opaque refs and env values are never printed.

Before replacement, the tool checks the candidate with both
`validate-saas-product-smoke-fixture.sh` and the existing DB/network-free product-smoke `--check-fixture`. It copies
the current protected JSON to `/run/bersoncarebot/saas-smoke.fixture.previous`, preserving `root:deploy 0640`, then
atomically renames the validated candidate. A failed post-replace validation automatically restores the exact
previous bytes atomically. Therefore recovery for a reported failure is: do not edit either file and rerun the same
command after fixing the reported repo/tool condition; the live fixture is already rolled back. After a successful
upgrade, `.previous` is the operator recovery copy and must remain protected; any manual reversal is an explicit
owner/operator action and must repeat the same metadata and offline fixture gates before replacement.

2. Owner-authorized live TEST smoke only after the operator confirms the fixture path is readable:

```bash
pnpm run smoke:saas-product -- \
  --mode=locked \
  --base-url=https://test.bersoncare.ru \
  --fixture-file=/run/bersoncarebot/saas-smoke.fixture \
  --json-output=/tmp/saas-product-smoke.json \
  --junit-output=/tmp/saas-product-smoke.junit.xml
```

3. Record evidence aggregate-only: command, exit code, selected scenario/category counts, pass/fail totals,
   failure-code counts, and request/correlation IDs when present. Do not record fixture values, cookies, headers,
   opaque ref values, response bodies, patient data, or credential-bearing URLs.

## Prohibited Actions

- Do not write fixture values, cookies, auth headers, opaque fixture refs, or TEST account identifiers into repo
  files, logs, shell history, chat, screenshots, JSON reports, or JUnit reports.
- Do not use dev auth bypass on TEST.
- Do not read `/opt/env` as part of fixture preparation or static validation.
- Do not mutate PROD or run production migrations, services, SSH, deploy, or cleanup commands from this packet.
- Do not manually clean up DB rows, grants, RLS flags, appointments, users, media, or delivery queues to make smoke
  pass.
- Do not trigger real delivery beyond owner-approved TEST send-safety.
- Do not create a real fixture file in the repository.

## Evidence Boundary

Successful offline preflight means only that `/run/bersoncarebot/saas-smoke.fixture` is readable by the operator,
parses as JSON, satisfies the runner fixture schema, and covers the selected scenario filters. It is fixture
readiness only.

Real D3 remains blocked until the owner/operator supplies the readable fixture path and authorizes the live TEST
smoke. D3/R1/R2 product-smoke PASS requires actual live smoke command output with exit 0.

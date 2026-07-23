# ST-02 TEST walkthrough surfaces

This is the non-secret route and fixture-reference contract for the owner-ready walkthrough. Credential values
come from the protected TEST fixture packet; do not copy passwords into git, logs, screenshots or chat.

## Viewports

- Desktop: `1440x900`.
- Mobile: `390x844`.
- For every surface capture the normal state, then refresh the same deep link.

## Public and registration

Use a new incognito profile with no cookies on TEST:

| Scenario | Exact route | Deterministic action |
|---|---|---|
| Public landing and clean login | `/app` | Verify public entry, then the patient and staff email login choices. |
| Specialist registration | `/app` | Select `Я специалист`; verify email, password, specialist name and organization title. |
| Clinic registration | `/app` | The same canonical flow creates the clinic, owner membership and specialist together. There is no separate clinic-without-specialist signup. |
| Public booking | `/book` | Verify the public catalog and a non-empty Clinic A/Clinic B scheduling scenario from the fixture mappings. |

TEST's canonical settings override enables `specialist_signup_enabled`. Production remains default-off. The
`/api/auth/dev-public` helpers are DEV-only and must not be used as TEST/production evidence. For local DEV, the
explicit helpers are:

- clean login: `/api/auth/dev-public?view=login`;
- specialist registration: `/api/auth/dev-public?view=specialist-registration`;
- clinic registration: `/api/auth/dev-public?view=clinic-registration`.

The two registration helper names intentionally converge on the same combined product form.

## Fixture login and organization references

The versioned source of truth is `SAAS_TEST_FIXTURE_MANIFEST.operatorRefs` in
`apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts`.

- Clinic A owner email/password: packet keys `SAAS_TEST_FIXTURE_CLINIC_A_EMAIL` /
  `SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD`.
- Clinic B owner email/password: packet keys `SAAS_TEST_FIXTURE_CLINIC_B_EMAIL` /
  `SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD`.
- Clinic A doctor, representative patients A/B, shared patient and global admin use deterministic reserved
  `.test` emails from `operatorRefs.credentials`; their password source is named there and reuses one of the two
  protected packet passwords. No new secret packet key is required.
- Clinic A/B organization IDs, representative patient IDs and the shared patient's A/B enrollment IDs are under
  `operatorRefs.contexts`. Runtime smoke/walkthrough tooling should consume these refs rather than discover opaque
  IDs by hand.
- Representative patients A/B use the reserved fictional NANP `+1 202-555-01xx` range (`+12025550101` and
  `+12025550102`). The TEST override includes exactly these two fixture phones in the mirrored
  `test_account_identifiers`, so maintenance mode does not hide their owner-ready patient screens. These values are
  identity markers only: they are not added to delivery passthrough env, and TEST/DEV real-delivery isolation still
  applies.

The shared patient is enrolled in both organizations and has its own login. The fixture only provides the two
organization refs; the live integration owner must prove the actual A/B context-selection behavior and locked
read/write matrix. This document does not claim that downstream gate.

### Reversible U5A relationship-recovery fixture

The canonical shared-patient fixture is also the only allowed target for the U5A revoked-remembered-organization
walkthrough. Run only the root/operator wrapper from exact `/opt/projects/bersoncarebot-test`:
`bash deploy/host/run-u5a-patient-organization-test-lifecycle.sh status`. In an authorized TEST window,
`discharge --execute` changes only the reserved Clinic B shared-patient enrollment from `active` to `discharged`;
`restore --execute` restores the canonical two-active-relationship state.

The wrapper validates the exact non-symlink TEST checkout, env and SQL artifact, then verifies
`SAAS_ISOLATION_OPERATOR_DATABASE_URL` against `pg_catalog` before any product-table access: exact
`bersoncarebot_test`, LOGIN/INHERIT, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS and no app-role
membership. It installs one closed SECURITY DEFINER function owned by the existing canonical NOLOGIN `app_owner`,
grants no direct table access to the operator, invokes the CLI without `PGOPTIONS`, and always removes the function
through EXIT cleanup. The function uses the existing `app_owner` `SELECT, UPDATE` ACL installed by the canonical
patient-invites strict overlay; this harness adds no table ACL. It takes a short `SHARE` table lock, verifies the
exact A+B set, retains Clinic A active and accepts only `active↔discharged` for Clinic B. No seeder reconciliation
BYPASS window is reused and no new BYPASS role is created.

The operator sequence is:

1. verify wrapper `status` reports two active relationships and says the capability was removed;
2. complete A↔B switch, refresh/back-forward and trusted deep-link checks while both are active;
3. leave Clinic B remembered, run wrapper `discharge --execute`, then verify neutral chooser/recovery and absence of
   stale Clinic B data;
4. always run wrapper `restore --execute` in data cleanup, including after any failed browser step, and verify
   wrapper `status` again. If an interrupted operator run reports capability cleanup failure, run wrapper
   `cleanup --execute` before any retry and treat remaining privilege as an incident.

The command performs no HTTP, delivery, S3 or external integration call and prints only the target state plus
aggregate active-relationship count. It is not available through a product route and must not be copied to DEV or
PROD. The repo gate `pnpm run prove:u5a-patient-organization-test-lifecycle` runs the actual operator CLI against a
private disposable PostgreSQL with the exact canonical strict `org_enrollments` policy plus FORCE RLS, proves a
concurrent third relationship write is blocked, restores two active rows, removes the temporary function, and
asserts that the operator retains no product-table grant.

## Global-admin visual handoff

For a bounded System Health visual-review window, use the owner-only ordinary-login handoff in
[`TEST_VISUAL_GLOBAL_ADMIN_SESSION.md`](TEST_VISUAL_GLOBAL_ADMIN_SESSION.md). It creates a separate non-renewable
TEST cookie jar and never reads or copies the main product-smoke session packet. Dev-bypass and clinic-owner
substitution remain forbidden.

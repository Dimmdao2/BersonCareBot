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

## Global-admin visual handoff

For a bounded System Health visual-review window, use the owner-only ordinary-login handoff in
[`TEST_VISUAL_GLOBAL_ADMIN_SESSION.md`](TEST_VISUAL_GLOBAL_ADMIN_SESSION.md). It creates a separate non-renewable
TEST cookie jar and never reads or copies the main product-smoke session packet. Dev-bypass and clinic-owner
substitution remain forbidden.

# Blind kill-set — TEST c069 auth entry

Written by `auditor-live` before reading the candidate production diff or any
existing test. Candidate under audit: `ab3cd0b784350086294480e4ef93374dde79306a`;
base: `e5fb19c71`.

Oracle: `TPB-21` in
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`:
transactional signup/recovery email must work independently of disabled
passwordless email-code login; the worker brief records the two TEST incidents.
The named worker brief `.lead/briefs/fix-test-auth-entry-batch-20260908.md` is
absent from this worktree, but was read from the fresh repository code index;
its authority is not inferred from product code.

Classification follows `AGENTS.md` §24.4: the access/delivery decisions below
are repeatable, expensive and silent. Their cheapest public proof is a route
test. The resend action reuses the OTP-start route; its UI payload propagation
is one-time wiring inspection while the shared route behavior is tested.
Resolver duplication and signup/login form structure are one-time diff/live
evidence, not UI tests.

| ID | Named failure to kill | Required observable result |
| --- | --- | --- |
| K1 | With staff passwordless email-code login disabled, a specialist-signup intent incorrectly takes the password-login path instead of dispatching its transactional confirmation mail. | Signup route preserves its service-email flow and does not require/re-enable passwordless login. |
| K2a | An explicit patient/admin portal on the shared host resolves the staff auth policy at OTP start. | Start follows the requested portal policy, not host-default staff policy. |
| K2b | An explicit patient/admin portal on the shared host resolves the staff auth policy at OTP resend. | The resend payload carries the portal to the same OTP-start route, whose policy decision is route-tested. |
| K2c | An explicit patient/admin portal on the shared host resolves the staff auth policy at OTP confirm. | Confirm follows the requested portal policy, not host-default staff policy. |
| K3 | A verified credential whose role is incompatible with the requested explicit portal is minted a session. | Route denies session issuance for the incompatible portal/role pair. |
| K4 | A compatible role is rejected, or a request with no explicit portal no longer follows established host-derived behavior. | Compatible explicit portal succeeds; absent portal retains host-derived policy. |
| K5 | Password login accepts a role on a wrong explicit portal. | Password route denies the cross-portal role before session minting. |

Untested by design: signup/login copy, DOM layout, resolver duplication and
route wiring structure. These are inspected once against the candidate diff
and production wiring; no stable public behavior requires a UI test.

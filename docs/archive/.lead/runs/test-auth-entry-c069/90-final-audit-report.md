# Independent blind behavior audit — TEST c069 auth entry

**PASS** for candidate product SHA
`ab3cd0b784350086294480e4ef93374dde79306a` against base `e5fb19c71`.

Authority: TPB-21 in
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` and
the worker brief `fix-test-auth-entry-batch-20260908.md` (read from the fresh
repository index because that ignored `.lead` file is absent from this
worktree). Blind kill-set was written before production/test inspection in
[`00-blind-killset.md`](00-blind-killset.md).

## Test-or-inspection classification and result

| Kill-set | Evidence | Result |
| --- | --- | --- |
| K1 specialist signup delivery stays independent from passwordless login | Existing `specialist-signup/start/route.route.test.ts`; candidate diff makes `initialDevView='registration'` select specialist signup solely from `specialistSignupEnabled`. | PASS |
| K2a/K2b explicit patient/admin OTP start and resend on shared host | Added OTP-start route matrix; `AuthFlowV2` passes the existing portal prop on both initial start and resend to the same handler. | PASS |
| K2c explicit patient/admin OTP confirmation policy | Added OTP-confirm route matrix. | PASS |
| K3 incompatible confirmed OTP credential cannot mint a session | Added OTP-confirm denial assertion. | PASS |
| K4 compatible portal succeeds; no-portal host policy survives | Added matching staff-password assertion; retained OTP-start resolved-surface two-direction assertion. | PASS |
| K5 password credential cannot cross an explicit portal | Added password-route denial assertion. | PASS |

One-time inspection: the candidate modifies only the two OTP handlers, the
password login handler and `AuthFlowV2`; it imports and reuses the existing
`RoleLoginPortal`, `authPolicyNameForRoleLoginPortal`, and `roleCanUsePortal`
instead of adding another resolver. The four explicit OTP calls in
`AuthFlowV2` carry the portal at start, confirm, and resend; specialist signup
does not use passwordless OTP. No DOM/copy/UI test was added under §10a.

## Fault-injection evidence

All mutations were temporary production-code edits and were reverted before
the final check.

| Kill-set | Temporary mutation | Command and red assertion |
| --- | --- | --- |
| K1 | Remove the `transactional` argument from specialist signup's email gate. | `pnpm --dir apps/webapp exec vitest run src/app/api/auth/specialist-signup/start/route.route.test.ts` → `keeps signup confirmation available when passwordless email login is disabled`: expected 200, received 503. |
| K2a/K2b | Make explicit OTP start use the shared Host policy. | `pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts` → `uses the explicit patient/admin portal policy on a shared staff host`: expected `[200, 200]`, received `[503, 503]`. |
| K2c | Drop the explicit portal policy from OTP confirm. | `pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/confirm/route.route.test.ts` → both compatible portal cases: expected 200, received 503. |
| K3 | Disable OTP-confirm's `roleCanUsePortal` denial. | Same confirm command → `denies an OTP-confirmed credential...`: expected 403, received 200. |
| K4 | Replace no-portal OTP-start fallback with fixed `staff`. | OTP-start command → retained `uses the resolved-surface header as the sole delivery gate...` assertion turned red. Separately forcing the password role predicate to reject all explicit portals made matching staff portal expect 200/receive 403. |
| K5 | Disable password login's explicit portal denial. | `pnpm --dir apps/webapp exec vitest run src/modules/auth/passwordAuth.route.test.ts` → `denies a correct password...`: expected 403, received 200. |

Final command:

```bash
pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts src/app/api/auth/specialist-signup/start/route.route.test.ts src/modules/auth/passwordAuth.route.test.ts
```

Result: **4 files, 38 tests passed**. Both
`git diff --check e5fb19c71 ab3cd0b784350086294480e4ef93374dde79306a` and
`git diff --check` completed with no output.

No in-scope behavior is untested. Browser/live presentation was deliberately
not run: the brief forbids shared DEV/TEST servers, and the audited form
structure is a one-time inspection rather than a stable UI contract.

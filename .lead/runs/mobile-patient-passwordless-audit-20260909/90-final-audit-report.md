# Final independent audit — mobile patient passwordless correction

Candidate: `f87fac14fe5d1d371e78c52d2e0ca9307fe8eb64`

Verdict: **FAIL**

## Scope classification and blind kill-set

The public email/password outcome for a client with a successfully verified stored
credential is repeatable security behavior.  Owner authority (`OWNER_DECISIONS.md`
“Вход”; `AUTH_AND_IDENTITY_CANON.md` §9) independently requires patient
passwordlessness; a silently minted patient session is expensive and security-relevant.
The retained `*.route.test.ts` is therefore an admissible cheapest public-boundary
test.  Deployment convergence, packet compatibility, and active-document consistency
are one-time inspections, not source-text tests.

Blind kill-set, written before reading the route test:

1. A successful credential check for any `client`, including a `TEST_ACCOUNT_*`
   identity, reaches session minting or staff-factor handling.
2. Doctor or global-admin password login loses eligibility.
3. TEST convergence writes a password for the patient, or the legacy packet can no
   longer be parsed/read while its patient credential ceases to be a negative probe.
4. An active document retains a TEST patient-password exception or describes OTP
   debug as a bypass.

## Evidence

| Item | Result | Evidence |
| --- | --- | --- |
| Client route policy | PASS for denial/no-session structure | `login/route.ts` verifies credentials, resolves the effective role, then returns before `staffSecurity.getStatus`, clinic-factor creation, or `setSessionFromUser` when `isPasswordEligibleRole(role)` is false. `passwordEligibility.ts` has no TEST-account branch: every `client` is ineligible; doctor/admin remain eligible. |
| Retained behavior test | ACCEPTED for its security purpose | `passwordAuth.route.test.ts` sends a valid credential result plus `role: 'client'` through the real public handler and asserts 403 plus no session mint. Its oracle is the owner auth model; the costly silent failure is a patient session. It is not a source/list/internal-shape test. |
| Fault injection | PASS | Temporarily changed the route so `role === 'client'` bypassed the eligibility return. `pnpm --dir apps/webapp exec vitest run --project=route src/modules/auth/passwordAuth.route.test.ts` became red: 1 failed / 19 passed; `blocks a correct password for an unlisted patient account` received 500 rather than the expected 403. The mutation was fully reverted; `git diff --exit-code -- apps/webapp/src/app/api/auth/email-password/login/route.ts` returned 0. |
| TEST password convergence | PASS | `ensure-test-owner-account-passwords.mjs` contains only doctor and admin in `EXPECTED_ACCOUNTS`, so only those accounts receive password-hash/protection writes. `deploy-test-saas.sh` calls it while writers are stopped. |
| TEST verifier and packet compatibility | PASS for closure | `smoke-login-packet.mjs` continues to parse the legacy patient email/password keys. `set-smoke-login-uniform-password.mjs` writes only doctor/global-admin password fields and retains the patient value. `verify-test-owner-logins.mjs` positively verifies doctor/admin and makes the legacy patient credential a negative probe, including no `Set-Cookie`. |
| Active docs/AGENTS | PASS | Inspected `AGENTS.md` §1a, `AUTH_AND_IDENTITY_CANON.md` §9, `LOCAL_DEV_AND_AGENT_TESTING.md` §4, and `OWNER_DECISIONS.md` “Вход”. All state patient passwordless, doctor/admin password eligibility, and `DEV_EMAIL_OTP_DEBUG=true` + `NODE_ENV=development` as a development-only logged OTP, not an authenticated bypass. Exact stale-exception search returned no active TEST patient allow-path. |

## Finding

`MUST FIX — public error contract differs from the explicit audit authority.`

The brief requires a successfully verified `client` credential to end at
`password_not_allowed_for_role`.  The candidate instead returns
`password_not_available_for_role`:

- `apps/webapp/src/modules/auth/passwordEligibility.ts` assigns that value to
  `PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR`.
- The public route returns that constant.
- The retained route test and TEST verifier both assert the same different value.

Reachable impact: a valid stored patient password receives a denial/no session, but
the specified public HTTP error is not delivered.  This is not a style finding; it is
the observable response contract named in the audit brief.  No product change was
made by this auditor.

## Commands and results

```text
git rev-parse HEAD
# f87fac14fe5d1d371e78c52d2e0ca9307fe8eb64

pnpm install --frozen-lockfile
# PASS; lockfile unchanged (local worktree dependencies were absent initially)

pnpm --dir packages/db-principal build
# PASS; required to materialize the direct workspace export for the route test

pnpm --dir apps/webapp exec vitest run --project=route src/modules/auth/passwordAuth.route.test.ts
# PASS: 1 file, 20 tests

<temporary client allow-path mutation> + same Vitest command
# expected red: 1 failed, 19 passed; denial assertion saw 500 instead of 403

node apps/webapp/scripts/ensure-test-owner-account-passwords.mjs --self-test
# PASS

pnpm --dir apps/webapp exec eslint src/app/api/auth/email-password/login/route.ts \
  src/modules/auth/passwordAuth.route.test.ts src/modules/auth/passwordEligibility.ts
# PASS

node --check deploy/host/verify-test-owner-logins.mjs
node --check deploy/host/smoke-login-packet.mjs
node --check deploy/host/set-smoke-login-uniform-password.mjs
bash -n deploy/host/deploy-test-saas.sh
git diff --check "$(git merge-base origin/feat/doctor-ui-rebuild HEAD)..HEAD"
# PASS
```

`pnpm --dir apps/webapp typecheck` was started after the focused checks and its
`tsc --noEmit` process completed without diagnostics, but the tool session yielded
before its final exit code could be captured.  It is not used as acceptance evidence.
No full CI, shared DEV server, database, push, or deployment was run.

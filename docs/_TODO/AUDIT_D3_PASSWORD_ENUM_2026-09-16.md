# Audit D3: password doors enumeration

Verdict: **PASS** for `wt/auth-password-enumeration` at `ad74c1af3`.

Authority:

- Plan: `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md`, stage Д3.
- Canon: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:837-839`: password door must not distinguish existing and nonexistent addresses by public text or HTTP code.

## Scope Checked

Routes:

- `POST /api/auth/email-password/forgot`
- `POST /api/auth/email-password/setup-access`
- `POST /api/auth/email-password/setup-code/complete`
- Post-OTP companion for forgot/setup: `POST /api/auth/email-password/reset`

Account-state matrix in the route test:

- nonexistent: `{ kind: 'free' }`
- contact-only: `{ kind: 'needs_email_setup' }`
- with password: `{ kind: 'verified_with_password' }`
- owner-patient shape: separate `verified_with_password` user id

The acceptance test now checks status, body, `content-type`, `location`, `retry-after`, redirect flag, repeat behavior, absence of `challengeId`, post-code branching, and one-time-code consumption behavior at the public route boundary:

- `apps/webapp/src/modules/auth/passwordEligibility.route.test.ts:195`
- `apps/webapp/src/modules/auth/passwordEligibility.route.test.ts:270`
- `apps/webapp/src/modules/auth/passwordEligibility.route.test.ts:298`

## Findings

No MUST FIX findings.

## Code Review

Pre-code public shape:

- `forgot` and `setup-access` both return `PASSWORD_RECOVERY_REQUEST_ACCEPTED` after `requestPasswordRecoveryChallenge`; the response has only `{ ok: true, retryAfterSeconds: 60 }`.
- `requestPasswordRecoveryChallenge` still performs one `resolveAuthState` call before return, then starts candidate-only delivery work in a detached promise. The detached work begins at `apps/webapp/src/app-layer/auth/passwordRecovery.ts:35`, so user lookup, challenge creation, and mail enqueue are not awaited by the HTTP response.
- `setup-code/complete` resolves state, maps non-setup states to `DUMMY_SETUP_USER_ID`, verifies the code first, then folds non-setup states back to `invalid_code` at `apps/webapp/src/app/api/auth/email-password/setup-code/complete/route.ts:62-80`.

Timing:

- For the four requested normal states, `resolveAuthState` uses one root SQL call in `apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts`; duplicate-email conflict/merge branches can do extra DB/logging work, but those are outside the four-state Д3 matrix.
- Candidate delivery work after lookup is not awaited by the response. The new fake-timer acceptance test catches a regression that adds an awaited timer or waits on candidate-only delivery before returning.
- A true live latency distribution should still be measured after landing on the single DEV server with repeated `curl -w '%{time_total}'` or an equivalent route-level probe against the deployed candidate.

Post-OTP:

- `setup-code/complete` verifies code before state-specific completion and only sets a password for `needs_email_setup`.
- `reset` uses `consumeEmailChallengeCode` / `consumeLatestEmailChallengeCodeForUser` for password reset and `confirmEmailChallenge` / `confirmLatestEmailChallengeCodeForUser` for first-time setup; successful consume then deletes challenges in `emailAuth.ts`, and the route test proves a reused code response does not perform the write twice.

## Fault Injection

All injections were made temporarily and reverted before final validation.

1. Added `setupRequired: true` to `PASSWORD_RECOVERY_REQUEST_ACCEPTED`.
   - Caught by: `expect(forgotFingerprints)...` at `passwordEligibility.route.test.ts:263`.
   - Test command returned rc=1 and diff showed the extra `setupRequired` field.

2. Returned `403 { ok:false, error:'not_eligible' }` from `setup-access`.
   - Caught by: `expect(setupAccessFingerprints)...` at `passwordEligibility.route.test.ts:264`.
   - Test command returned rc=1 and diff showed 403/`not_eligible` instead of neutral 200.

3. Returned `409 already_has_login` in `setup-code/complete` before code verification.
   - Caught by: pre-code fingerprint at `passwordEligibility.route.test.ts:265` and post-code matrix at `passwordEligibility.route.test.ts:330`.
   - Test command returned rc=1.

4. Added an awaited 200 ms timer before returning from existing-address recovery candidates.
   - Caught by: fake-timer response-settlement test at `passwordEligibility.route.test.ts:287`.
   - Test command returned rc=1 with received `"not settled"` instead of `200`.

## Live DEV

No second server was started. I only called the shared DEV at `127.0.0.1:5200`.

Commands and observations:

- Without `Origin`, all three routes returned `403 {"ok":false,"error":"csrf_origin_forbidden"}`. This proves the request was stopped by the global CSRF gate, not by D3 logic.
- With `Origin: http://127.0.0.1:5200`, `forgot` returned `200 {"ok":true,"retryAfterSeconds":60}` for:
  - `d3-audit-unknown-20260916@example.invalid`: 3/3 responses were 200 with the same body; measured `time_total` was `0.083911`, `0.038424`, `0.040062`.
  - `dimmdao@yandex.ru`: 3/3 responses were 200 with the same body; measured `time_total` was `0.084397`, `0.084265`, `0.083296`.
  - `kinesiospace@gmail.com`: 3/3 responses were 200 with the same body; measured `time_total` was `0.071231`, `0.065326`, `0.076711`.
- On the current shared DEV runtime, `setup-access` and `setup-code/complete` returned `503 {"ok":false,"error":"auth_channel_disabled"}` before D3 logic. Because the candidate route code checks the same transactional channel as `forgot`, this live runtime is not a clean candidate proof. I did not restart or replace it, per brief.

Unverified live items:

- Full browser/manual “forgot password” and first-time password setup with real OTP entry were not completed from this clone.
- Contact-only live account identity was not established without DB seeding or a second server.

## Validation

Required wrapper was used for tests.

- Initial focused test after acceptance-test changes:
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/modules/auth/passwordEligibility.route.test.ts"` -> 7 tests passed.
- After Prettier:
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/modules/auth/passwordEligibility.route.test.ts"` -> 7 tests passed.
- Formatting:
  `pnpm --dir apps/webapp exec prettier --write src/modules/auth/passwordEligibility.route.test.ts`.

Full CI was not run, per brief.

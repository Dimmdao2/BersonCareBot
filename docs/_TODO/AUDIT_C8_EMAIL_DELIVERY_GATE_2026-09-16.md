# AUDIT C8: email delivery gate

Verdict: FAIL

Source oracle: `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md` C8, plus `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` Part I / Part II: staff and platform-admin doors do not contain standalone `email_code`; staff 2FA may use email code after password; non-login email-code purposes must check only transactional email configuration.

MUST FIX:

1. `clinic_invite` and `patient_email_change` can still be blocked before the new `surface_requested` delivery gate is reached.
   Classification: test (repeatable behavior) + look (route wiring).
   Files:
   - `apps/webapp/src/app/api/clinic/invites/accept/start/route.ts:19`
   - `apps/webapp/src/app/api/clinic/invites/accept/confirm/route.ts:36`
   - `apps/webapp/src/app/api/doctor/patients/[userId]/email-change/route.ts:52`
   - `apps/webapp/src/app/api/patient/email-change/confirm/route.ts:47`

   These routes still call `isAuthChannelEnabled('email')`, i.e. the login-door surface policy. On the staff/platform surfaces, `DEFAULT_SURFACE_AUTH_POLICY_CONFIG` has no `email_code` (`apps/webapp/src/shared/lib/surface/surfaceAuthPolicy.ts:25-31`), so `surfaceAuthControlAvailable` returns false before reading settings (`apps/webapp/src/modules/auth/surfaceAuthSettings.ts:55-61`). Result: valid non-login flows can be denied as `auth_channel_disabled` before `startEmailChallenge(..., 'clinic_invite' | 'patient_email_change', ...)` gets to `integratorEmailAdapter.ts:37-39`.

   Impact: invited staff can fail to receive/confirm the clinic invite OTP on the staff host, and a clinic admin can fail to send or a patient can fail to confirm an admin-initiated email-change OTP, even though these purposes do not open standalone email-code login.

2. Tests do not hold the full `EmailChallengePurpose` mapping required by C8.
   Classification: test.
   File: `apps/webapp/src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts:55-84`

   The current test protects `staff_login_factor`, `specialist_signup`, and `login`, but not `public_registration`, `clinic_invite`, `password_reset`, `password_setup`, `email_verify`, or `patient_email_change`. Fault injection C changed `deliveryPurposeForEmailChallenge` so only `staff_login_factor` and `specialist_signup` used `surface_requested`; all other purposes fell back to `login_door`. The targeted suite still passed: 6 files, 55 tests. This is the exact class of regression C8 was meant to prevent for "all non-login email challenge purposes".

Checked:

- Rule route: `grep -n "^## \|^### " AGENTS.md`; read §1, §10a, §10b, §24.2, §24.4, README, `.cursor/rules/*`, C8 oracle, auth canon.
- Code search first:
  - `node /home/dev/brain/tools/code-search.mjs "withAuthDeliveryChannelGate" --repo bcb -k 20`
  - `node /home/dev/brain/tools/code-search.mjs "EmailChallengePurpose" --repo bcb -k 20`
  - `node /home/dev/brain/tools/code-search.mjs "email otp confirm staffSecurity prepareVerifiedPrimaryLogin" --repo bcb -k 20`
  - `node /home/dev/brain/tools/code-search.mjs "password_reset public_registration password_setup email challenge" --repo bcb -k 20`
- Exact caller list: `grep -rn "withAuthDeliveryChannelGate" apps/webapp/src` found the expected delivery callers: email adapter, SMS delivery/adapter, messenger contact, public booking, purge-otp, plus tests.
- Door-closed check by code:
  - `apps/webapp/src/app/api/auth/email-otp/start/route.ts:48-56` checks `login_door` policy by explicit portal/surface before minting a login challenge.
  - `apps/webapp/src/app/api/auth/email-otp/confirm/route.ts:71-80` repeats the login policy before confirm.
  - `apps/webapp/src/app/api/auth/email-otp/confirm/route.ts:125-133` refuses non-client DB roles after OTP unless the hardcoded global-admin-by-policy branch is reached; current policy still makes `platform_admin` email false by code.
- Purpose review:
  - `login`: `login_door`; stays closed by route and delivery gate.
  - `staff_login_factor`: created only after verified password in `apps/webapp/src/app/api/auth/email-password/login/route.ts:267-296`; confirm consumes `staff_login_factor` in `apps/webapp/src/app/api/auth/email-password/login/factor/route.ts:87`.
  - `specialist_signup`: registration/confirmation path uses `specialist_signup` and sets `pending_enrollment`, not a normal login session, in `apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts:144-186`.
  - `password_reset` / `password_setup`: recovery is role-gated before sending (`apps/webapp/src/app-layer/auth/passwordRecovery.ts:38-47`) and reset/setup completion checks password-eligible roles (`apps/webapp/src/app/api/auth/email-password/reset/route.ts:117-123`, `apps/webapp/src/app/api/auth/email-password/setup-code/complete/route.ts:80-92`).
  - `email_verify`: authenticated-only route, transactional check already used (`apps/webapp/src/app/api/auth/email/start/route.ts:20-47`).
  - `clinic_invite` / `patient_email_change`: route-level login-policy checks above are the blockers.
- Targeted green run:
  - `/home/dev/brain/host-orch/run-tests.sh "pnpm --filter @bersoncare/webapp exec vitest --run src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts src/modules/auth/authDeliveryGate.unit.test.ts src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts src/modules/auth/passwordAuth.route.test.ts"`
  - Result: 6 files passed, 55 tests passed.
- Invalid command attempts, not counted as validation:
  - `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp vitest ..."` and `"pnpm -C apps/webapp vitest ..."` both failed with `Command "apps/webapp" not found`; switched to workspace filter.
- Fault injection:
  - A: collapsed `surface_requested` to login surface check in `authDeliveryGate.ts` -> 2 failed assertions in `integratorEmailAdapter.deliveryPurpose.unit.test.ts` (`staff_login_factor`, `specialist_signup`).
  - B: made `login` use `surface_requested` in `integratorEmailAdapter.ts` -> 1 failed assertion: standalone login reached integrator instead of `auth_channel_disabled`.
  - C: only `staff_login_factor` and `specialist_signup` used `surface_requested`, every other purpose used `login_door` -> targeted suite stayed green (6 files, 55 tests), proving MUST FIX #2.

Notes:

- The standalone email-code staff/admin door is currently closed by the compiled matrix, not by mutable settings: `apps/webapp/src/shared/lib/surface/surfaceAuthPolicy.ts:25-31` and `apps/webapp/src/modules/auth/publicAuthPolicy.unit.test.ts:93-118`.
- `apps/webapp/src/app/api/auth/email-otp/confirm/route.route.test.ts:113-127` still preserves an artificial global-admin-by-policy success branch if `platform_admin` email is forced true by a fake. I did not count it as a current bypass because production policy makes that state unreachable, but it should be reconciled when fixing the test oracle so tests do not bless a door the owner canon removed.

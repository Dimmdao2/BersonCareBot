# Аудит staff doors hardcode C1-C5

Candidate: `wt/staff-door-no-phone` @ `d59313e18c99848fa046c540d07608284920ecdf`.
Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:59-76`,
`docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:25-36`.

Verdict: **FAIL**.

Product code paths for staff/platform_admin phone and messenger primary login are closed in this
candidate, but one saved test still asserts the removed staff surface setting is a registered public
runtime key. That test is both red on the candidate and harmful by the owner 15.09 line: it goes green
when the removed key is put back.

## MUST FIX

1. `apps/webapp/src/infra/repos/pgAppRuntimeSettings.unit.test.ts:83-101` must be deleted or rewritten
   to assert the current behavior: removed `auth_surface_staff_*` / `auth_surface_platform_admin_*`
   keys are not public runtime settings. It currently expects `auth_surface_staff_email_enabled` to
   route through `app.read_public_runtime_setting`.
   Violates:
   - Canon `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:75-76`: switches for `staff` and
     `platform_admin` are removed; patient keeps them.
   - Plan `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:29-32`: keys, registry rows, UI rows and
     reads are removed; staff door composition is code.
   - AGENTS §10a `AGENTS.md:1469-1477`: existing tests are measured by whether they check output
     behavior rather than implementation shape or something that must be edited on honest code change.

   Evidence:
   - `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/infra/repos/pgAppRuntimeSettings.unit.test.ts src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/modules/auth/authChannelPolicy.explicitSurface.unit.test.ts src/app/api/auth/email-otp/start/route.route.test.ts src/modules/auth/phoneStartFallback.route.test.ts src/modules/auth/phoneStartBrandedOtpSender.audit.test.ts src/modules/auth/deliveryChannelCallerGate.route.test.ts src/modules/auth/independentAuthMethodToggle.route.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts"`:
     1 failed file, 9 passed files, 61 passed tests, 1 failed test. The failed assertion is
     `pgAppRuntimeSettings.unit.test.ts:101`, expected old staff key row, received `null`.
   - Fault injection "return `auth_surface_staff_email_enabled` to `SYSTEM_SETTING_REGISTRY`":
     `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/infra/repos/pgAppRuntimeSettings.unit.test.ts"`
     returned 1 passed file, 6 passed tests. The test rewards the regression.

## Mandatory Questions

1. Hole left for staff/platform_admin phone or messenger session: **not found in product code**.
   Searched with:
   - `node /home/dev/brain/tools/code-search.mjs "staff platform_admin phone login door availableMethods surfaceAuthControl" --repo bcb -k 20`
   - `node /home/dev/brain/tools/code-search.mjs "auth channel-link telegram-init max-init telegram-login exchange phone confirm surface" --repo bcb -k 20`
   - `rg -n "isAuthChannelEnabled\\(|getClientVisibleAuthChannelPolicy\\(|setSessionFromUser\\(|prepareVerifiedPrimaryLogin\\(|exchange(TelegramInitData|MaxInitData|TelegramLoginWidget|IntegratorToken)|classifyVerifiedIntegratorTokenChannel\\(|roleLoginPortal|surface" ...`
   - `rg -n "auth_surface_(staff|platform_admin)_(email|sms|telegram|max|oauth_google|oauth_yandex|oauth_vk|oauth_apple|passkey)_enabled" apps/webapp/src packages --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/loginCountryData.ts'`

   Product-code result: no removed staff/platform_admin setting keys outside comments; the exact production
   grep above returned no matches. Routes checked:
   - `phone/start`: resolved surface is required; explicit delivery checks `isAuthChannelEnabled` before
     delivery, automatic delivery uses `getClientVisibleAuthChannelPolicy`.
   - `phone/confirm`: stored delivery channel checks `isAuthChannelEnabled` before `prepareVerifiedPrimaryLogin`
     and `setSessionFromUser`.
   - `telegram-init`, `max-init`, `telegram-login`, `exchange`: all call `isAuthChannelEnabled` before exchange
     or session minting.
   - `channel-link`: authenticated bind route forces explicit patient surface for Telegram/MAX; it does not mint
     an anonymous session.
   - `requestSurface`: single-host and branded hosts resolve to explicit policy objects; branded hosts always get
     patient policy, not staff/platform_admin.

2. Patient not broken: **PASS** by targeted runs.
   - `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/modules/auth/authChannelPolicy.explicitSurface.unit.test.ts src/app/api/auth/email-otp/start/route.route.test.ts src/modules/auth/phoneStartFallback.route.test.ts src/modules/auth/phoneStartBrandedOtpSender.audit.test.ts src/modules/auth/deliveryChannelCallerGate.route.test.ts src/modules/auth/independentAuthMethodToggle.route.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts src/app/api/platform/settings/route.route.test.ts"`:
     10 passed files, 60 passed tests.
   - `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/proxy.route.test.ts src/app/app/AppEntryRsc.unit.test.ts"`:
     2 passed files, 107 passed tests.

3. Staff second factor and 2FA policy not zeroed by key removal: **PASS**.
   Code view:
   - `verifiedStaffPrimaryLogin.ts:35-58` still branches between enrolled TOTP and email-code factor.
   - `email-password/login/route.ts:248-307` still reads `staffSecurity.getStatus()` and clinic 2FA requirement.
   - `email-password/login/factor/route.ts:79-155` still consumes email factor or TOTP/recovery and writes
     `staffSecurity.assurance`.
   - `requireRole.ts:171-179` still enforces `securityFactorRequired` + `staffSecurity.assurance`.
   Test run:
   - `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/passwordAuth.route.test.ts src/app-layer/guards/requireRole.platformOperations.unit.test.ts src/app/api/doctor/requestAccess.route.test.ts src/app/api/account/security/totp/verify/route.test.ts src/app/api/account/security/status/route.test.ts src/modules/auth/passwordChange.unit.test.ts"`:
     Vitest found 4 existing files and returned 4 passed files, 41 passed tests. The two account-security route
     test paths in the command do not exist, so they are not counted as evidence.

4. Admin screen after removing rows: **PASS by view + typecheck**.
   `PlatformAuthChannelPolicySection.tsx:129-164` reads and writes only `patientSurfaceAuthSettingKey(control)`;
   rendered row label is only `Пациенты` (`:202-214`). There are no staff/platform_admin switch rows.
   `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck"` returned rc=0.

5. Orphan DB setting rows ignored and writes rejected: **mixed**.
   Read path in production code: **PASS**. `surfaceAuthSettings.ts:21,35-40` can construct only
   `auth_surface_patient_*`; `authChannelPolicy.ts:40-44` rejects unavailable staff/admin controls before DB read
   and returns compiled code defaults for non-patient surfaces.
   Write path: **PASS by one-off audit test**. Temporary `staff-orphan-write.audit.tmp.test.ts` called
   `PATCH /api/platform/settings` with `auth_surface_staff_email_enabled`; result was `400 invalid_body` and
   `updateSetting` was not called:
   `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/platform/settings/staff-orphan-write.audit.tmp.test.ts"`:
   1 passed file, 1 passed test. The temporary test file was deleted.
   Saved test artifact: **FAIL**. `pgAppRuntimeSettings.unit.test.ts` still demands the removed read path; see
   MUST FIX.

6. Tests by owner line 15.09:
   - Useful behavior tests: `authChannelPolicy.staffPhoneDoor.unit.test.ts`, `publicAuthPolicy.unit.test.ts`,
     `authChannelPolicy.explicitSurface.unit.test.ts`, `email-otp/start.route.test.ts`,
     `phoneStartFallback.route.test.ts`, `phoneStartBrandedOtpSender.audit.test.ts`.
   - Harmful test: `pgAppRuntimeSettings.unit.test.ts:83-101`. It tests the existence/routing of a removed setting
     key, not the user-visible output of the auth chain; fault injection proves it rewards rollback.

## Fault Injections

1. Returned `phone_bot` to `DEFAULT_SURFACE_AUTH_POLICY_CONFIG.staff`.
   Caught by:
   `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts"`:
   1 failed file, 2 failed tests (`staff: telegram`, `staff: max`, expected false got true).

2. Removed the availability check before reading settings and made staff/admin read legacy
   `auth_surface_${surface}_${control}_enabled`.
   Caught by:
   `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts"`:
   1 failed file, 8 failed tests.

3. Changed control mapping `telegram -> Phone_bot`.
   Caught by:
   `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts"`:
   1 failed file, 1 failed test (`patient: telegram`, expected true got false).

4. Returned `auth_surface_staff_email_enabled` to `SYSTEM_SETTING_REGISTRY`.
   Not caught by saved tests; `pgAppRuntimeSettings.unit.test.ts` went green (1 passed file, 6 passed tests).
   Caught only by audit view / exact grep. This is the MUST FIX above.

5. Swapped patient and staff surface mapping in `authPolicyNameForRequestSurface`.
   Caught by:
   `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/publicAuthPolicy.unit.test.ts src/app/api/auth/email-otp/start/route.route.test.ts"`:
   2 failed files, 11 failed tests; includes staff email-code bypass where `staffDenied.status` became 200.

All temporary production-code mutations and the temporary audit test were reverted before this report.
No full CI, PROD, TEST, migrations, or second Next server were used.

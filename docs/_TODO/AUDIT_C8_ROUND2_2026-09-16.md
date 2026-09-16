# AUDIT C8 ROUND 2/3: коррекция почтового гейта

Verdict: **FAIL**

Source oracle: `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md` — C8 «Почтовый код обязан доставляться там, где поверхность сама его потребовала» и «Второй фактор — выбор самого сотрудника». Третий круг проверял SHA `e4425ec60` после коррекции теста clinic invite. Тема platform-admin login одним verified email не повторялась: она вынесена brief-ом в `wt/admin-otp-hole-measure`.

## MUST FIX: 2

1. **`apps/webapp/src/app/api/doctor/patients/[userId]/email-change/route.ts:55` — route-level выбор `transactional` не защищён тестом.**

   Классификация: **тест**. Это повторяемое route-поведение, не UI: clinic admin on staff surface changes a patient email; email-code login door is closed, transactional email is configured. Expected observable result: route continues to `startEmailChallenge(..., 'patient_email_change', ...)` and returns success; it must not answer `503 auth_channel_disabled` before the challenge.

   Fault injection: changed this line from `isAuthChannelEnabled('email', undefined, 'transactional')` to `isAuthChannelEnabled('email')`, together with the patient confirm route below. Existing targeted tests stayed green:

   ```text
   /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=unit --project=route src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts src/app/api/clinic/invites/route.route.test.ts src/modules/auth/authDeliveryGate.unit.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts src/modules/auth/passwordAuth.route.test.ts"
   ```

   Result with the injected defect: **5 files passed / 46 tests passed**, `rc=0`. Command proving no existing route test covers this path:

   ```text
   rg --files apps/webapp/src/app/api/doctor/patients apps/webapp/src/app/api/patient/email-change apps/webapp/src/modules/auth | rg 'email-change|patientEmailChange|emailAuth\.patientEmailChange'
   ```

   Result: only the two route files plus `apps/webapp/src/modules/auth/emailAuth.patientEmailChange.unit.test.ts`. No `*.route.test.ts` exists for either route; the unit test covers lower email-auth purpose filtering, not this route's surface-vs-transactional gate.

2. **`apps/webapp/src/app/api/patient/email-change/confirm/route.ts:50` — route-level выбор `transactional` не защищён тестом.**

   Классификация: **тест**. This is authenticated patient route behavior: patient session exists, email-code login door is closed, transactional email is configured. Expected observable result: route continues to `confirmLatestEmailChallengeCodeForUser(..., 'patient_email_change', ...)` and returns `{ ok: true }` or the domain result; it must not fail early with `503 auth_channel_disabled`.

   The same fault injection above changed this line to `isAuthChannelEnabled('email')`; the same targeted run remained green. Required fix is a route test that makes policy behave like the real staff/patient surface split: login-door lookup returns false, transactional lookup returns true, and the route still reaches the patient-email-change confirmation boundary.

## Checked

- **Entry rules and test policy.**

  ```text
  grep -n "^## \|^### " AGENTS.md
  sed -n '205,516p' AGENTS.md
  sed -n '1381,1669p' AGENTS.md
  sed -n '2123,2258p' AGENTS.md
  sed -n '1,220p' README.md
  sed -n '1,180p' .cursor/rules/000-start-here.mdc
  sed -n '1,180p' .cursor/rules/tests-check-behaviour-not-circumstances.mdc
  ```

- **Полнота `isAuthChannelEnabled`.**

  Exact command from brief:

  ```text
  grep -rn "isAuthChannelEnabled" apps/webapp/src
  ```

  Result by inspection: the four corrected routes now use `isAuthChannelEnabled('email', undefined, 'transactional')`; public login doors (`email-otp/*`, Telegram/MAX init, exchange, phone/messenger login/bind paths) still use surface/login policy; no login door was converted to `transactional`.

- **Clinic invite identity before code delivery.**

  `apps/webapp/src/app/api/clinic/invites/accept/start/route.ts:31-47` resolves a pending invite by token and sends only to `lookup.invite.invitedEmail`; it does not accept an arbitrary email as the delivery identity. Confirm repeats token lookup and accepts with `expectedEmail: lookup.invite.invitedEmail` at `apps/webapp/src/app/api/clinic/invites/accept/confirm/route.ts:48-81`. This makes the `transactional` choice correct for this route pair.

- **Email-change routes are correctly written but not test-held.**

  `apps/webapp/src/app/api/doctor/patients/[userId]/email-change/route.ts:38-55` requires clinic-admin context before the transactional gate; `apps/webapp/src/app/api/patient/email-change/confirm/route.ts:35-50` requires patient session before the transactional gate. The code is correct; the finding is that reverting either route to the login-door gate is not caught.

- **Purpose cannot silently bypass the adapter gate.**

  `apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts:37-39` maps only `EmailChallengePurpose = 'login'` to `login_door`; every other `EmailChallengePurpose` maps to `surface_requested`. The exhaustive `Record<EmailChallengePurpose, 'delivered' | 'refused'>` in `apps/webapp/src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts:75-115` is acceptable under §10a: the oracle is the C8 behavior contract, and the observed output is actual integrator `fetchImpl` call vs refusal before send, not source-text matching.

- **e4425 correction for clinic invite test.**

  Fault injection: changed `apps/webapp/src/app/api/clinic/invites/accept/start/route.ts:22` back to `isAuthChannelEnabled('email')`.

  ```text
  /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/clinic/invites/route.route.test.ts"
  ```

  Result: **1 file failed / 1 failed, 4 passed**, `rc=1`; failure was `expected 503 to be 200` at `apps/webapp/src/app/api/clinic/invites/route.route.test.ts:173`. The e4425 mock correction therefore observes the route's choice now.

- **Baseline after reverting all temporary mutations.**

  ```text
  /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=unit --project=route src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts src/app/api/clinic/invites/route.route.test.ts src/modules/auth/authDeliveryGate.unit.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts src/modules/auth/passwordAuth.route.test.ts"
  ```

  Result: **5 files passed / 46 tests passed**, `rc=0`. The run logs one expected exercised error path from `passwordAuth.route.test.ts:500` (`permission denied for table platform_users`) while the test suite passes.

Temporary production-code mutations were reverted. This commit changes only this audit artifact.

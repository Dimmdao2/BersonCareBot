# Independent acceptance — N1-001 / N1-002

- Candidate: `26c0d0bdcab4d16e0c6c8a6cbf67d9d70ea1da46`
- Authority: `docs/_TODO/DEEP_CODE_AUDIT_PLAN.md` (`N1-001`, `N1-002`, correction step 1)
- Scope: diary resource purge reachability/reuse and patient confirmation of staff-started email change.

## Blind kill-set (fixed before reading existing tests)

| ID | Method | Fault to kill / fact to prove | User or data consequence |
|---|---|---|---|
| K1 | view | Current logged-in patient profile does not mount the existing `DiaryDataPurgeSection`, or the mounted surface points somewhere other than the existing diary purge start/confirm routes. | The patient still cannot reach resource-specific cleanup from the product. |
| K2 | test | Purge confirmation is allowed for a challenge not owned by the authenticated patient, or deletes another patient's rows / account or organization data instead of only the authenticated patient's symptom/LFK diary resources. | Cross-user data loss or account/org deletion. |
| K3 | test | Pending lookup selects the newest challenge of any purpose and only then filters it, so a newer `email_verify` row shadows an older valid pending `patient_email_change`; or another user's challenge is surfaced. | The intended patient cannot complete a valid staff-started change, or sees another user's target address. |
| K4 | test | Patient confirmation accepts or consumes a challenge with another user, another purpose, expired/used state, or a wrong code. | Unauthorized email change or destruction of a still-valid challenge. |
| K5 | test | Correct staff-started confirmation does not update the canonical email and verified state through the existing confirmation contract. | Staff sees a start success but the patient's login identity remains stale/unverified. |
| K6 | view | Successful confirmation does not refresh the current profile surface. | The patient sees stale account data after success. |
| K7 | test | Parameterizing the shared email panel breaks existing self-service `email_verify` start, confirm, or resend behavior. | Existing patient self-service email verification regresses. |
| K8 | view | Externally-started mode renders a resend action without a supplied resend handler, or existing callers that supply resend lose it. | A fake control promises an action that cannot work, or existing resend disappears. |
| K9 | view | Candidate adds a second purge service or a third OTP confirmation implementation instead of delegating to the existing routes/services/shared form. | Security behavior splits across parallel doors and later diverges. |

## Candidate inspection

- `N1-001` is connected by mounting the existing `DiaryDataPurgeSection` in the authenticated
  patient profile. The component still calls only `/api/patient/diary/purge-otp/start` and
  `/api/patient/diary/purge`; the route compares the OTP user with the session user and passes only
  `session.user.userId` to the existing DI-bound purge operation. `pgDiaryPurge.ts` updates/deletes
  only `lfk_complexes`, `patient_lfk_assignments` references and `symptom_trackings`, each scoped by
  the platform-user match; it contains no account/organization delete.
- `N1-002` reuses `EmailAccountPanel`, `OtpCodeForm`, the existing patient confirm route and
  `confirmLatestEmailChallengeCodeForUser`. Success calls the existing canonical
  `claimVerifiedEmail`/`email_auth_verify_user_email` path and `router.refresh()`. Existing
  self-service mode still supplies start/confirm/resend; admin-started mode omits resend, and
  `OtpCodeForm` renders resend only when `onResend` exists.
- Architecture search found one diary purge binding (`buildAppDeps` → `purgeAllDiaryDataForUserPg`)
  and one patient email-change confirmation route; the candidate did not add a purge service or a
  third OTP consumer.
- **Finding:** both DB-backed pending display and DB-backed latest confirmation call
  `findLatestPendingEmailChallengeForUser(userId, now)` without purpose. The port and PostgreSQL
  function accept no purpose and order all unexpired rows by creation time. Filtering afterward
  returns `null` for display and increments attempts on the newer wrong-purpose row during confirm.
  A newer `email_verify` therefore shadows an older valid `patient_email_change`, directly
  violating required acceptance 2 and 3. The in-memory branch filters correctly for display but
  also selects latest-any for confirmation, so it does not remove the finding.

## Fault map and checks

| Test / view | Targeted fault | Result |
|---|---|---|
| `emailAuth.patientEmailChange.unit.test.ts` — pending display | Candidate's existing latest-any-purpose lookup is the injected fault: newer `email_verify` returned before purpose filtering. | RED: expected pending target, received `null`. |
| `emailAuth.patientEmailChange.unit.test.ts` — confirmation | Candidate's existing latest-any-purpose lookup is the injected fault: valid change code is checked against newer `email_verify`. | RED: expected `{ ok: true }`, received `invalid_code`; wrong-purpose row is the one offered to the attempt increment path. |
| `emailAuth.patientEmailChange.unit.test.ts` — wrong code | Temporarily removed the code-hash mismatch branch from `verifyChallengeCodeRow`. | RED: wrong code returned `{ ok: true }`; production mutation reverted. |
| `diary/purge/route.route.test.ts` — foreign OTP identity | Temporarily removed the session-user / OTP-user identity check. | RED: response changed from `403` to `200`; production mutation reverted. |

Exact commands and outcomes:

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/emailAuth.patientEmailChange.unit.test.ts src/app/api/patient/diary/purge/route.route.test.ts"
→ 1 test file failed, 1 passed; 2 tests failed, 2 passed. The two failures are the acceptance defect above.

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/emailAuth.patientEmailChange.unit.test.ts src/app/api/patient/diary/purge/route.route.test.ts -t 'does not claim the target email|refuses an OTP challenge'"
→ after all production reverts: 2 files passed; 2 tests passed, 2 skipped. Separate targeted
fault runs made the wrong-code assertion fail (1 failed, 2 skipped) and the foreign-identity
assertion fail (`403` became `200`; at that point the file had 1 failed, 1 passed).

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/emailAuth.durableQueue.d27c.test.ts src/app/api/auth/email/start/route.route.test.ts"
→ 2 files passed, 3 tests passed (existing email start/durable queue regression checks).

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/modules/auth/emailAuth.patientEmailChange.unit.test.ts src/app/api/patient/diary/purge/route.route.test.ts"
→ rc=0.

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/app/app/patient/profile/PatientProfileHero.tsx src/app/app/patient/profile/page.tsx src/modules/auth/emailAuth.ts src/shared/ui/patient/EmailAccountPanel.tsx src/shared/ui/patient/auth/OtpCodeForm.tsx"
→ rc=0.

git diff --check
→ rc=0.

git diff -- apps/webapp/src/modules/auth/emailAuth.ts apps/webapp/src/app/api/patient/diary/purge/route.ts
→ empty after reverting all completed/prepared production mutations.
```

No full CI, live shared DEV/TEST mutation, account purge, manual diary input, or another email flow
was run or changed.

## Binary result

| Required acceptance | Result | Evidence |
|---|---|---|
| 1. Profile-reachable, resource-only, user-bound diary purge after existing OTP | **PASS** | Profile/route/repository view; route acceptance is green; identity-removal injection made the foreign-user assertion red. |
| 2. Exact patient sees and confirms only valid `patient_email_change`; other user/purpose/expired/used/wrong code is not surfaced or consumed | **FAIL** | Newer other-purpose row is surfaced to the verifier and shadows the valid row; two acceptance assertions are red. |
| 3. Latest matching user+purpose wins over a newer row of another purpose | **FAIL** | Port/SQL accept no purpose; both new competing-challenge assertions are red on candidate. |
| 4. Canonical email/verification update and profile refresh; self-service unchanged | **PASS** | Existing canonical claim route and `router.refresh()` reused by view; existing start/durable-queue checks are green; self-service panel still supplies resend. |
| 5. No fake resend for externally-started challenge; existing resend callers preserved | **PASS** | `onResend` is optional and every resend element is conditional; exact caller search shows existing callers still provide handlers. |
| 6. Reuse boundary: no second purge service / third OTP implementation | **PASS** | Complete candidate diff plus exact symbol/caller search. |

**Overall: FAIL.** Candidate `26c0d0bdc` is not acceptance-ready because required outcomes 2 and 3 fail.
The permanent audit artifacts are the two acceptance-test files and this report; no product fix is
included.

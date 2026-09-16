# #915 M5-04 shared multipart backend — confirmation audit

**Verdict: MUST FIX.**

## Scope and authority

- Product candidate: `2a17878278704feed433a33513e5f1d73364dcf1`; prior audit authority:
  `f3a85aa86`; retained audit test/artifact: `1969f9eefe5a2efda720d41238a64105d6a5df32`.
- Correction authority: `478014817`; corrected product surface:
  `c1147716e`.
- Owner contract: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M5-04: large native media
  uses the existing authorized multipart path and reuses its existing confirmation/failure semantics.
- No PROD/deploy/secret/storage/DEV-or-TEST DB operation was performed. Product source was only temporarily
  mutated for fault injection and restored; the final worktree has no product-code diff.

## MUST FIX

### MM-M5-04-02 — doctor patient-file abort still leaves a legacy-visible ghost

Reachable scenario: a doctor begins a pending multipart `patient_file` upload and aborts it. The abort transaction
deletes `media_files` first (`mediaUploadSessionsRepo.ts:328-331`). The FK in
`db/schema/patientFiles.ts:77-81` is `ON DELETE SET NULL`, so the linked `patient_files.media_file_id` becomes
`NULL` before the subsequent `DELETE FROM patient_files WHERE media_file_id = <former media id>` at
`mediaUploadSessionsRepo.ts:350-353`. That predicate deletes zero rows. `pgPatientFiles.listFiles` deliberately
includes null-linked rows (`pgPatientFiles.ts:103-105`), so the aborted file is visible through the legacy list.

Impact: a cancelled upload is displayed to the doctor as a file despite having no media object. This violates the
M5-04 required reuse of failure semantics and the correction authority's explicit requirement that patient-file
abort must not leave the legacy-null-media record.

Retained repository behavioral oracle:
`src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts` models the actual FK transition and fails on the candidate:
`expected true to be false` at line 508. Temporarily moving linked-row removal before the media deletion made the
same 21-test unit suite green; that production mutation was restored.

## Confirmed surface

- **Patient pre-completion abort — PASS.** The route gates by server-owned `sessionId` + patient owner binding
  (`abort/route.ts:52-70`) before calling the existing submission abort finalizer and best-effort S3 abort. The
  retained original oracle returns 200 when object inspection is absent; a temporary 404 mutation made it fail
  (`expected 404 to be 200`), then was restored. The route test also covers doctor terminal status mapping.
- **Tenant binding — INSPECTED.** Patient lookup is constrained by `s.owner_user_id` in
  `gateUploadSessionForPartUrl`; doctor abort and complete pass their installed workspace `organizationId` to
  predicates that constrain both owner and `m.organization_id` (`mediaUploadSessionsRepo.ts:307-313`,
  `complete/route.ts:66-97`). No request policy, tenant or storage field is accepted.
- **Creation, compensation and sweep — INSPECTED.** This is deliberately a two-transaction path: the program
  pending-media named root uses the default port executor (`s3MediaStorage.ts:648-668`), while session insertion
  uses the supplied lifecycle-lock client (`program-submission/presign/route.ts:122-145`). A second-step throw
  aborts S3 and invokes the exact pending-media compensator (`mediaUploadAdapter.ts:152-169`). A surviving
  sessionless pending row is covered by the shared pending-delete stage, while multipart-backed rows retain the
  session retry identity until expiry hands them to that same purge lifecycle
  (`mediaUploadSessionsRepo.ts:402-444`; `s3MediaStorage.ts:932-967`). Thus the inspected compensation+sweep
  path does not establish a permanent or visible orphan; the user-abort ghost above does.
- **Program presign cleanup identity — PASS (inspection).** `const mediaId = upload.id` is declared before the
  multipart branch and is the value used by the outer catch compensator (`program-submission/presign/route.ts:106-107,
  148-156`), so the correction eliminates the former scope/shadowing skip.
- **415-vs-409 upload-door fixture — PASS after justified fixture correction.** M5 requires stored immutable
  upload-policy metadata. The old fixture omitted `upload-policy` and therefore correctly stopped at the earlier
  409 integrity check instead of reaching its stated bad-signature assertion. It now supplies the required `cms`
  policy and continues to assert the public 415 signature rejection.
- **`receivedAt` / 405 wording — OWNER QUESTION, not a finding.**
  `rg -l 'receivedAt' apps/webapp/src/app/api apps/webapp/src/app-layer apps/webapp/src/infra/repos apps/webapp/src/modules`
  finds no media multipart state (only operator-health code). The current multipart public contract in
  `apps/webapp/src/app/api/api.md` declares `session_expired` as 409, and M5-04 does not name a 405 outcome.
  Therefore there is no owner-plan line by which to rewrite a public status oracle to 405.

## Fault injection tally

**Убито 2 / непойманных 0.**

1. Reintroduced the prior patient pre-completion 404 path; the retained route oracle went red (`404`, expected
   `200`), then the mutation was restored.
2. The doctor cleanup ordering defect is present on the final candidate and the new repository oracle is red
   (`legacy-visible === true`). Temporarily moving patient-file cleanup before media deletion made that same oracle
   green, proving it distinguishes the required lifecycle outcome; the production mutation was restored.

## Commands and results

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run \
  src/app/api/media/multipart/abort/route.route.test.ts \
  src/modules/media/uploadDoorAcceptance.route.test.ts --project=route && \
  pnpm --dir apps/webapp exec vitest run src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts --project=unit"
  PASS before the new doctor oracle: 34 route + 20 lifecycle tests

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run \
  src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts --project=unit"
  FAIL on final candidate: 20 passed, 1 expected MM-M5-04-02 failure

pnpm --dir apps/webapp typecheck
  FAIL, pre-existing out-of-scope test type error:
  src/modules/patient-notifications/videoMeetingInvitationNativePush.contract.test.ts:23
  (`Promise<void>` is not `Promise<ChannelPreference>`).

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run \
  src/modules/patient-notifications/videoMeetingInvitationNativePush.contract.test.ts --project=fast"
  PASS: 1 test. This unrelated file was not changed.

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint <three audit test paths> && \
  node apps/webapp/scripts/check-media-upload-door.mjs && \
  node apps/webapp/scripts/check-media-upload-door.mjs --self-test && \
  node scripts/check-media-delivery-chokepoint.mjs && \
  node scripts/check-webapp-infra-import-boundary.mjs && \
  node scripts/check-webapp-infra-import-boundary.mjs --self-test && \
  git diff --check && <targeted route and lifecycle suites>"
  Scoped ESLint, upload-door and self-test, architecture gates and diff check passed;
  chain terminal rc=1 solely because the retained MM-M5-04-02 oracle is expected to fail.
```

## Required handoff

Fix `MM-M5-04-02` in product code, preserving the one transaction and session lock, then rerun the retained
route/repository suites and this audit's scoped gates. No plan expansion is requested.

# Video invite patient binding and prepared-link continuity — audit 2026-09-08

Candidate: product `e08326702c25c43aa514723ab7460b29618a6fe4` plus independent visual-pass artifact `bafe2d8c31fa958db77c08369b7b7758b0de9833` on `wt/video-live-ui-correction-20260908`.

Authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` ACC-07 and ACC-08. The kill-set was composed from those requirements before reading the existing test files.

## Kill-set and binary verdict

| Item | Required behavior | Evidence on candidate | Verdict |
| --- | --- | --- | --- |
| Patient binding | A specialist must not pair meeting A with patient B's `[userId]` route: it must fail closed without rotating A's invite or notifying B. | New service acceptance receives meeting A from `findSpecialistMeeting` and submits patient B. Candidate returns success, calls `rotateInvite` once, and enqueues one notification for B. | FAIL — reachable cross-patient capability disclosure and invalidation. |
| Prepared-link continuity | If initial prepare gives a copyable URL and Play resumes with `guestUrl=null`, the doctor must still copy the initial URL. | New UI acceptance prepares `https://clinic.therapygo.ru/live#prepared-invite`, clicks Play, then cannot find the copy action; candidate replaced the URL with `null` and offers rotation instead. | FAIL — reachable loss of the already-issued capability. |

Both items are repeated behavior with expensive, silent outcomes, so the cheapest relevant acceptance tests were added. The two red tests on the unmodified candidate are their fault-injection proof; no production code was changed.

## Commands and output

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run 'src/modules/video-meetings/service.test.ts' 'src/app/app/doctor/patients/[userId]/live/DoctorLiveMeetingClient.ui.test.tsx'"

Test Files  2 failed (2)
Tests       2 failed | 13 passed (15)
exit 1

pnpm --dir apps/webapp exec eslint 'src/modules/video-meetings/service.test.ts' 'src/app/app/doctor/patients/[userId]/live/DoctorLiveMeetingClient.ui.test.tsx'
exit 0

git diff --check
exit 0
```

## Scope

No product fix, host/DB mutation, UI/layout finding, configuration finding, or re-audit of the existing scenarios was performed. The handoff is limited to the two failing acceptance tests above.

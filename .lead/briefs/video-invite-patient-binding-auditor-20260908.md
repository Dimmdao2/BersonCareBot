# Тест или взгляд — cross-patient invite binding #1100

This is a **TEST + code-inspection** audit of one newly discovered expensive and silent behavior fault. Read
`AGENTS.md` heading map, then §5, §10a, §10b and §24 in full. Authority:
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` ACC-07/ACC-08 and the route contract implied by
`/api/doctor/clients/[userId]/video-meetings/[meetingId]`.

Источник оракула — `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`: «Подготовка новой doctor live-встречи ставит
приглашение ровно один раз в существующий pipeline» and «Invite выпускается ровно один раз при создании встречи».
The invite for a meeting must go to that meeting's patient; a different `[userId]` path must not redirect the
link/notification to another patient.

Audit exact candidate branch/worktree `wt/video-live-ui-correction-20260908`, current product SHA
`e08326702c25c43aa514723ab7460b29618a6fe4` plus any committed audit artifact from the independent visual pass.
Do not merge moving `feat` and do not read existing tests before composing the one-item kill-set.

## Reachable suspected fault

The doctor lifecycle route resolves `patientUserId` from `[userId]` and passes it to
`videoMeetings.rotateInvite`. The service rotates by `{meetingId, organizationId, specialistId}` and then enqueues
the newly minted guest URL to the path-derived `patientUserId`; it does not visibly prove that
`meeting.patientUserId === input.patientUserId`. A specialist who owns meetings for patients A and B may therefore
pair meeting A's id with patient B's route and notify B with access to A's call. Confirm or refute against the
committed implementation; do not turn a refuted suspicion into a finding.

## Audit contract

- If reachable, add the cheapest permanent behavioral acceptance test to
  `apps/webapp/src/modules/video-meetings/service.test.ts`: a meeting owned by patient A plus rotate input for
  patient B must fail closed, must not rotate and must not enqueue any notification. It must be red on the exact
  unmodified product candidate. This red test is its own fault-injection proof.
- Reuse the existing `findSpecialistMeeting` seam if it can express the independent meeting record. Do not invent
  a parallel service/repository/API and do not change production code.
- If the implementation already binds the meeting patient, write no test and report PASS with exact evidence.
- Run only the targeted test file through `/home/dev/brain/host-orch/run-tests.sh`, plus changed-file ESLint and
  `git diff --check`.
- Create `docs/audit/video-invite-patient-binding-2026-09-08.md` with the one-item kill-set, command output and
  binary verdict. Commit only the test (if warranted) and artifact with explicit staging. Do not push.
- No UI/layout/config findings, no second audit of the existing 27 scenarios, no product fix, no DB/live host
  mutation. Do not end while a foreground test is still running.

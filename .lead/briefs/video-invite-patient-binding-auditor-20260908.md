# Тест или взгляд — invite patient binding and prepared-link continuity #1100

This is a **TEST + code-inspection** audit of two newly discovered expensive and silent behavior faults in the
same invite lifecycle. Read
`AGENTS.md` heading map, then §5, §10a, §10b and §24 in full. Authority:
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` ACC-07/ACC-08 and the route contract implied by
`/api/doctor/clients/[userId]/video-meetings/[meetingId]`.

Источник оракула — `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`: «Подготовка новой doctor live-встречи ставит
приглашение ровно один раз в существующий pipeline» and «Invite выпускается ровно один раз при создании встречи».
The invite for a meeting must go to that meeting's patient; a different `[userId]` path must not redirect the
link/notification to another patient. A prepared link that the doctor has already received must also remain
copyable when Play refreshes only the short-lived join material through a resume response with `guestUrl=null`.

Audit exact candidate branch/worktree `wt/video-live-ui-correction-20260908`, current product SHA
`e08326702c25c43aa514723ab7460b29618a6fe4` plus any committed audit artifact from the independent visual pass.
Do not merge moving `feat` and do not read existing tests before composing the two-item kill-set.

## Reachable suspected faults

The doctor lifecycle route resolves `patientUserId` from `[userId]` and passes it to
`videoMeetings.rotateInvite`. The service rotates by `{meetingId, organizationId, specialistId}` and then enqueues
the newly minted guest URL to the path-derived `patientUserId`; it does not visibly prove that
`meeting.patientUserId === input.patientUserId`. A specialist who owns meetings for patients A and B may therefore
pair meeting A's id with patient B's route and notify B with access to A's call. Confirm or refute against the
committed implementation; do not turn a refuted suspicion into a finding.

The doctor page first prepares a new meeting and stores the returned one-time `guestUrl`, then Play deliberately
calls the same create-or-resume route again for fresh join material. ACC-08 correctly makes a resume response
return `guestUrl=null`, because the raw secret is not stored; the client currently appears to assign that null over
its already-held link. If reachable, the specialist loses the valid link exactly when starting the call and is
offered an unnecessary rotation which would invalidate the already-delivered invite.

## Audit contract

- If the cross-patient fault is reachable, add the cheapest permanent behavioral acceptance test to
  `apps/webapp/src/modules/video-meetings/service.test.ts`: a meeting owned by patient A plus rotate input for
  patient B must fail closed, must not rotate and must not enqueue any notification. It must be red on the exact
  unmodified product candidate. This red test is its own fault-injection proof.
- Reuse the existing `findSpecialistMeeting` seam if it can express the independent meeting record. Do not invent
  a parallel service/repository/API and do not change production code.
- If the prepared-link fault is reachable, add the cheapest behavior test to
  `apps/webapp/src/app/app/doctor/patients/[userId]/live/DoctorLiveMeetingClient.ui.test.tsx`: the initial prepare
  returns a copyable URL, Play returns fresh session material with `guestUrl=null`, and the existing URL remains the
  value copied after Play. This is not a layout/copy/CSS assertion: it protects the only user action that retains a
  valid already-issued capability. Stub `navigator.clipboard` locally; do not inspect component state or DOM shape.
- If either suspicion is refuted, write no test for that item and say why. Run only the two named targeted test
  files through `/home/dev/brain/host-orch/run-tests.sh`, plus changed-file ESLint and `git diff --check`.
- Create `docs/audit/video-invite-patient-binding-2026-09-08.md` with the two-item kill-set, command output and
  binary verdict. Commit only the test (if warranted) and artifact with explicit staging. Do not push.
- No other UI/layout/config findings, no second audit of the existing 27 scenarios, no product fix, no DB/live host
  mutation. Do not end while a foreground test is still running.

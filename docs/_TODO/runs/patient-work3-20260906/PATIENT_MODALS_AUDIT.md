# Patient Work3 — independent canonical patient modal audit

- Candidate: `256e46066b7de6e59d20ea22009ff4a539780a62`
- Audit date: 2026-09-06
- Role: independent `auditor-live`; product code is read-only except temporary, restored fault injection.
- Required authority: `/home/dev/dev-projects/.lead/runs/patient-work3-20260906/PATIENT_MODALS_WORKER_BRIEF.md`. The first auditor looked only inside repository worktrees and incorrectly reported it missing; the orchestrator located and checked the external run brief before accepting the evidence below.

## Test-or-look classification (recorded before opening existing tests)

### Repeated behavior — behavior tests at the cheapest durable public layer

| Kill ID | Fault to kill | User-visible/data impact | Intended evidence |
| --- | --- | --- | --- |
| B-01 | Closing a nested source/media layer also closes the parent discussion | Patient loses the thread context and must reopen it | Existing or added focused UI behavior test; inject parent-close coupling once |
| B-02 | Opening/closing a child layer erases the typed discussion draft | Silent loss of unsent patient text | Focused UI behavior test; inject draft reset/remount once |
| B-03 | Support message submit no longer sends the entered text or no longer renders the accepted message | Patient believes a message was sent when it was lost | Existing cheapest component/route behavior test; inject send-path break once |
| B-04 | Opening/polling the support chat no longer marks incoming messages read | Unread state remains wrong and staff read receipts diverge | Existing cheapest component/route behavior test; inject read-path break once |
| B-05 | Polling no longer refreshes messages/read receipts, or read-only state exposes an active composer | Conversation state becomes stale or permits an invalid action | Existing cheapest component behavior test; inject poll/read-only decision break once |
| B-06 | Exercise discussion “load older” drops/replaces current messages or cannot fetch the previous page | Patient cannot reach earlier clinical discussion | Existing cheapest discussion UI behavior test; inject pagination merge break once |
| B-07 | Exercise discussion composer/poll/read flow loses a message or read state | Clinical comment is silently lost/stale | Existing cheapest discussion UI/route behavior test; inject the independent unprotected path once |
| B-08 | Closing fullscreen media unmounts the underlying discussion or erases its draft | Patient returns to a reset thread instead of the same discussion | Focused UI behavior test; inject discussion unmount on fullscreen once |
| B-09 | Uploaded image/video chooses the wrong viewer, or video bypasses `PatientMediaPlaybackVideo` behavior | Media is unavailable or loses the supported playback contract | Behavior test for viewer choice where durable; import/implementation identity itself is look-only under §10a |
| B-10 | Reminder create/edit/schedule submit changes its accepted payload or stops invoking the business submission | Reminder is saved with wrong timing/rules or not saved | Existing cheapest form/module behavior test; inject payload-field loss once |
| B-11 | Booking history, practice-complete, warmup feedback, journal edit, or web-push confirmation loses its business action while modal chrome changes | A reachable patient action silently stops persisting/completing | Reuse existing focused behavior tests; add only if a named expensive+silent class has no protection; inject each retained independent class once |

The mandatory five fault classes are B-01, B-02, B-03/B-04, B-08, and B-10. Visual geometry is deliberately excluded from automated assertions.

### One-time structure — inspect current reachability/diff/import graph

| Look ID | Requirement |
| --- | --- |
| S-01 | Every reachable feature dialog named by the bounded work is on `PatientModal` or the patient primitive adapter; each excluded legacy dialog is proven unreachable/dead or explicitly out of scope. |
| S-02 | `PatientModal.tsx` is the one patient feature-modal path; no competing `PatientModalDialogContent` or local dialog/sheet geometry remains on reachable callsites. |
| S-03 | Patient routes/shared patient UI import neither doctor UI nor generic product UI; doctor routes/shared doctor UI have no direct or transitive patient-modal dependency. Shared chat code is model-only. |
| S-04 | Canonical implementation mirrors DoctorModal principles without importing doctor UI: mobile bottom drawer, desktop dialog, fixed header, one body scroll owner, fixed safe-area footer, scroll reset, one overlay across nested layers, fullscreen media over a mounted parent. |
| S-05 | Messages contain no hardcoded person; active organization identity is plain non-link header text absent an assigned-doctor contract; close route is safe; delayed/scheduled-message code is untouched. |
| S-06 | Exercise discussion has item label in the header; nested source/fullscreen layers close independently; image/video route to the correct zonal viewer and video uses `PatientMediaPlaybackVideo`. |
| S-07 | Reminder, booking history, practice-complete, warmup feedback, LFK/symptom journal edit, and web-push dialogs retain their original business handlers and accessible close controls. |

Forbidden as permanent tests: source/class/format strings, DOM/modal/file counts, import-name assertions, and geometry assertions.

### Live-only evidence

At approximately `390×844` and desktop `1280px`, inspect messages, exercise comments with nested source and fullscreen media, one long reminder/edit form, booking history, and one web-push prompt. For each reachable trigger record: fixed header/footer, exactly one scrolling body, reachable unclipped actions, no document double-scroll, one backdrop, parent/draft preservation, fullscreen coverage. If owner DEV data lacks a trigger, record that exact scenario as `BLOCKED`; do not invent fixtures or send external messages.

## Audit results

### Automated behavior gate: PASS

- `pnpm --filter webapp exec vitest run src/app/app/patient/messages/PatientMessagesClient.ui.test.tsx src/app/app/patient/treatment/ProgramItemDiscussionDialog.ui.test.tsx src/app/app/patient/treatment/ProgramItemDiscussionMessageBody.ui.test.tsx src/modules/reminders/components/ReminderCreateDialog.ui.test.tsx` — 4 files, 17 tests passed.
- `pnpm --filter webapp exec eslint src/app/app/patient/messages/PatientMessagesClient.ui.test.tsx src/app/app/patient/treatment/ProgramItemDiscussionDialog.ui.test.tsx src/modules/reminders/components/ReminderCreateDialog.ui.test.tsx` — PASS.
- `git diff --check` — PASS.
- The port auditor performed temporary fault injection and restored product code. The port then classified the run as `blocked_system`; the retained green behavior suite was rerun by the orchestrator.
- A proposed test that mocked the concrete `PatientMediaPlaybackVideo` component was rejected and removed because it tested implementation identity, contrary to AGENTS.md §10a and the owner instruction. Video routing remains a one-time code/live inspection requirement.

Covered behavior: support send/read/poll/read-only/close/header identity; discussion pagination/send/read/poll; nested source and fullscreen media close without closing the parent or erasing the draft; reminder create payload.

### Code/reachability inspection: PASS

Candidate `256e46066b7de6e59d20ea22009ff4a539780a62` consolidates reachable patient dialogs on the patient-local modal path, preserves patient/doctor UI isolation, keeps the discussion mounted below fullscreen media, and does not touch delayed/scheduled messaging. No product-code finding was retained.

### Live visual acceptance: NOT YET RUN

The two port runners ended with transport/result failures (`blocked_system`; Claude returned invalid JSON) before recording the required 390×844/1280 live screenshots. This is not presented as a visual PASS. The final Work3 integration gate must still exercise the named live modal scenarios; no third serial code-audit pass is authorized.

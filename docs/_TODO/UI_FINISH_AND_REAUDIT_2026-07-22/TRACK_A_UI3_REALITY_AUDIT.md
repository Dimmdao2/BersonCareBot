# Track A — UI-3 Communications reality audit

## Audit identity

- Run ID: `ui3_reality_audit`.
- Audited HEAD: `afefa8ac1a165537964a36f5601d0c6f3121afeb`.
- Accumulated full CI: **green** on product SHA `45ffed7318c584cf501d6972e231d197bebce6f6` — lint,
  typecheck, integrator 1,352 tests, targeted webapp 42 tests, media-worker 67 tests, production builds and the complete
  audit/registry gate (`TEST_DEPLOY_EVIDENCE_2026-07-22.md:41-45`). The diff from that SHA to audited HEAD contains
  only four files under `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/`; the scoped product diff is empty.
- Authority and denominator: eight owner checkboxes in
  `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md:460-471`.
- Scope: one independent read-only audit pass. Product code, DB, runtime, deploy, taskdb and owner checkboxes were not changed.
- Verdict rule: an implemented and tested row remains `partial` until its required populated live states are
  source-bound, the relevant full CI is green, and the live batch is accepted by the owner. A plan `[x]` is not proof.

## Validation actually run

At the same clean HEAD, from `/home/dev/dev-projects/BersonCareBot` (the audit worktree has no installed
`node_modules`):

```text
pnpm --dir apps/webapp exec vitest --run \
  src/app/app/doctor/messages/DoctorSupportInbox.test.tsx \
  src/app/app/doctor/comments/DoctorCommentsTab.test.tsx \
  src/app/app/doctor/online-intake/DoctorOnlineIntakeClient.test.tsx \
  src/app/app/doctor/communications/tabs/BroadcastsTab.test.tsx \
  src/app/app/doctor/broadcasts/BroadcastAuditLog.test.tsx \
  src/modules/messaging/components/ChatView.test.tsx \
  src/shared/ui/chat/MessageComposer.test.tsx \
  src/app/app/patient/messages/PatientMessagesClient.test.tsx \
  src/app/app/patient/treatment/ProgramItemDiscussionDialog.test.tsx
```

Result: **9 files / 105 tests PASS** in 8.38 seconds. Vitest global setup reported the existing
`0229_operator_incident_alert_claims` migration `permission_denied` warning and continued with in-memory tests; the
focused test result itself was green. An earlier invocation placed `--` before the file list, began a broader suite,
and was stopped when unrelated tests appeared; no evidence from that interrupted run is used here.

## Existing live evidence boundary

The only source-bound Communications live batch is:

`/home/dev/dev-projects/.lead/runs/ui-finish-984/0eda771fe/live-ui-audit-20260722T205446Z`

- D2: `doctor-desktop/i2_app_doctor_communications_tab_chats_2026-07-22T20-57-25Z.png`.
- M2: `doctor-mobile/i2_app_doctor_communications_tab_chats_2026-07-22T20-59-34Z.png`.
- Both have HTTP 200 and no console errors in their `last-shot.json`.
- `TRACK_A_TODAY_CLIENTS_MESSAGES_REAUDIT.md:6-17` binds the batch to evidence SHA `0eda771fe...` and audited
  SHA `bd5bf160...`; the UI-3 scoped diff from `bd5bf160...` to the current HEAD is empty.
- D2/M2 contain **zero conversations**. They prove the empty Chats shell (and D2 shows its 45/55 desktop split),
  but cannot prove a selected thread, gradient, header navigation, composer, populated row, or interaction.
- There is no source-bound current live PNG for Comments, Intake, Broadcasts, patient chat/comments, or doctor chat
  modal. Historical `UI-MILESTONE-DEV-2026-07-20` PNGs have no recorded source SHA and predate `#961/#962`; they are
  deliberately not used as closure evidence.

## Eight-row evidence matrix

| checkbox (quoted verbatim) | code evidence (current `path:line`) | test evidence actually run | source-bound live PNG | verdict |
|---|---|---|---|---|
| `[x] Desktop split во всех применимых вкладках — 45/55 с fallback 50/50; mobile master/detail сохранён.` | Shared fallback and mobile translation: `apps/webapp/src/shared/ui/doctor/catalog/CatalogSplitLayout.tsx:12-18,21-54`. Explicit 45/55 consumers: `DoctorSupportInbox.tsx:495-512`; `DoctorCommentsTab.tsx:1093-1127`; `DoctorOnlineIntakeClient.tsx:833-851`; `BroadcastsTab.tsx:156-180`. | Split assertions: `DoctorSupportInbox.test.tsx:68-74`; `DoctorCommentsTab.test.tsx:182-191`; `DoctorOnlineIntakeClient.test.tsx:199-205`; `BroadcastsTab.test.tsx:53-63`. Mobile archive return: `BroadcastsTab.test.tsx:81-125`. All passed in the 105-test run. | D2 proves only empty Chats desktop 45/55; M2 proves only the empty Chats list composition. No populated master/detail or the other three tabs. | **partial** |
| `[x] Exact owner gradient применён одинаково к doctor/patient chat, modal и comments (#961).` | Single asset contract: `apps/webapp/src/shared/ui/chat/chatThreadSurface.ts:1-3`. Doctor/patient chat share it through `ChatView.tsx:108-112`; doctor modal routes `DoctorOpenChatButton.tsx:51-58` → `DoctorClientEmbeddedChat.tsx:39-50` → `DoctorChatPanel.tsx:182-188` → `ChatView`; doctor comments: `DoctorCommentsTab.tsx:1055-1086` and `DoctorProgramDiscussionMessagesPanel.tsx:188`; patient comments: `ProgramItemDiscussionDialog.tsx:203-250`. | Patient and doctor variants assert the same asset/class in `ChatView.test.tsx:26-70`; related comment/dialog tests passed. | D2/M2 have no selected thread, so the gradient surface is not shown. No source-bound modal or comment PNG. | **partial** |
| `[x] Имя в шапке является единственной card navigation с сохранённым route contract.` | Chat list is a button and header name is the patient-card link: `DoctorSupportInbox.tsx:365-418,447-455`. Comments left rows are buttons and detail headers use `patientCardHref`: `DoctorCommentsTab.tsx:117-156,902-914,1001-1015`. Intake left rows are buttons and its detail-header name owns the link: `DoctorOnlineIntakeClient.tsx:565-616,653-665`. | Chat route/single-affordance assertions: `DoctorSupportInbox.test.tsx:265-274,337-356`. Intake list-vs-header route assertion: `DoctorOnlineIntakeClient.test.tsx:221-234`. | Empty D2/M2 have no selected header; no source-bound selected Comments or Intake PNG. | **partial** |
| `[x] Убрана лишняя верхняя broadcast-фраза с отдельным current-code evidence (#961).` | Current Broadcast pane starts directly with its standard heading at `BroadcastsTab.tsx:111-151`; the error archive starts directly with state content at `BroadcastDeliveryArchiveClient.tsx:63-100`. Current-tree exact search returns no `После отправки сообщения ставятся в очередь` or `Ошибки доставки по вашим рассылкам`. | `BroadcastsTab.test.tsx:53-63` verifies the current compact journal header contract. | No source-bound Broadcasts PNG after `#961`. | **partial** |
| `[x] Выбор рассылки показывает слева title/text/audience/channel/error/non-delivery metrics (#961).` | Selection swaps the left pane at `BroadcastsTab.tsx:74-109`; the selected detail renders title/body and the four requested metrics at `BroadcastAuditLog.tsx:107-162`. | `BroadcastsTab.test.tsx:65-79` verifies the left-pane transition and requested content; `BroadcastAuditLog.test.tsx:50-71` verifies title, full text, audience, channel, errors and non-delivery. | No source-bound selected-broadcast PNG. | **partial** |
| `[x] «Лог ошибок» открывает detail справа; стандартная верхняя панель имеет одно закрытие; overlap отсутствует во всех summary/delivery/error states (#961).` | `BroadcastAuditEntryDetail` owns one top close and an error-log action in normal flow at `BroadcastAuditLog.tsx:115-193`. `BroadcastsTab.tsx:99-109,111-153` keeps selected summary left and error log right; desktop close and mobile back are complementary at `BroadcastsTab.tsx:118-132,164-178`. | `BroadcastAuditLog.test.tsx:73-123` covers flow states, exactly one detail close, and opening errors. `BroadcastsTab.test.tsx:81-125` covers right-pane error log plus complementary desktop/mobile close behavior. | No source-bound selected summary, delivery-state, error-state, or mobile-return PNG. | **partial** |
| `[x] Intake left list не дублирует ссылку по имени из detail.` | Every left item is a single `Button` with a plain name at `DoctorOnlineIntakeClient.tsx:565-616`; the only patient-card `Link` is in the detail header at `DoctorOnlineIntakeClient.tsx:653-665`. | Exact list-name-not-link plus detail-header-link assertion: `DoctorOnlineIntakeClient.test.tsx:221-234`. | No source-bound populated Intake PNG. | **partial** |
| `[x] Один shared composer покрывает doctor chat/modal, patient chat, doctor comments и patient comments с parity текущего поведения (#962).` | Shared interaction contract: `apps/webapp/src/shared/ui/chat/MessageComposer.tsx:32-60,62-144`. Consumers: doctor chat/modal `DoctorChatPanel.tsx:140-172`; patient chat `PatientMessagesClient.tsx:142-181`; doctor comments `DoctorCommentsTab.tsx:363-390` and `DoctorProgramDiscussionMessagesPanel.tsx:348-380`; patient comments `ProgramItemDiscussionDialog.tsx:252-270`. | Shared trim/loading/native-newline/parity adapter: `MessageComposer.test.tsx:31-91`; patient chat API/geometry: `PatientMessagesClient.test.tsx:23-59`; patient comments API/attachment parity: `ProgramItemDiscussionDialog.test.tsx:31-83`; doctor reply behavior: `DoctorCommentsTab.test.tsx:537-574`. All passed. | D2/M2 do not render a composer; no source-bound patient chat/comments or doctor modal/comments composer PNG and no owner parity acceptance. | **partial** |

## Coherent UI-3 closure batch (do not split into micro-fixes)

No current implementation defect justifies a product-code fix from this single pass: all eight requested behaviors
are present, the focused suite is green, and the accumulated full CI gate is already green on the identical product
tree. The dependency-ready remaining batch is only live evidence and owner acceptance:

1. On one source SHA, create populated fixtures and capture one batched desktop/mobile LIVE set for Chats, Comments,
   Intake and Broadcasts, plus patient chat/comments and the doctor chat modal. Cover selection, back/close,
   summary/delivery/error states, and composer send/disabled behavior.
2. Submit that single live batch to the owner for acceptance. If the live pass exposes a real visual/behavioral
   defect, fix all UI-3 findings together in one coherent worker pass, then rerun the checks invalidated by that new
   product diff and do one re-check; do not start serial micro-audits.

## Result

`closed 0/8 against docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md:460-471`

The full CI gate is satisfied. The result remains `0/8` because populated live proof and owner acceptance are still
missing; green CI does not substitute for either UI gate.

## NOT DONE:

- Eight rows have current code evidence, green focused tests and green accumulated full CI, but none has the complete
  required populated-live/owner-acceptance chain.
- Populated source-bound live evidence is absent for every UI-3 interaction state; the only valid batch is an empty
  Chats fixture and cannot be promoted into proof of selection or behavior.
- No explicit owner defer applies to any of the eight rows.

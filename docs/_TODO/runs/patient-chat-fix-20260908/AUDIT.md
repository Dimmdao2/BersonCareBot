# Patient chat fix — independent audit

Candidate: `289a1f9d982250876b456ad43fb0fc32fdfa5e17` (`289a1f9d9`).

Result: **PASS**. No MUST FIX.

## Classification and evidence

| ID | Requirement | Classification | Result and evidence |
| --- | --- | --- | --- |
| 1 | `/app/patient/messages` is a page and retains send/read/poll/read-only behaviour. | Repeatable behaviour | **PASS** — targeted UI suite covers send, initial read, polling/read-only. |
| 2 | Both threads use `PatientChatComposer`; the submit control is a 32×32 circle inside the field. | One-off visual implementation | **PASS** — source has the shared composer in both call sites; live evidence measured both controls as `32×32`, computed `border-radius: 9999px`. |
| 3 | Comments remain `PatientModal`; its left header is `Комментарии` plus exercise context and its right header is active-clinic plain text, never a link. | One-off visual implementation | **PASS** — `ProgramItemDiscussionDialog` still uses `PatientModal`; header action is a `span`, and the desktop/mobile screenshots show the required arrangement. Modal height was not assessed: explicitly deferred by owner. |
| 4 | No separate white strip separates the comments header from the thread. | One-off visual implementation | **PASS** — `bodyClassName="p-0"`; live desktop measurement: header bottom `193px`, thread top `193px`. |
| 5 | Bubbles align to sender side; long bubbles retain the opposite `2.5rem` minimum, and day/timestamp/ticks use the doctor geometry while patient typography/colors remain. | One-off visual implementation | **PASS** — shared max width is `min(calc(100% - 2.5rem), 22rem)`; all four screenshots show side alignment, day labels, and in-bubble time/ticks. |
| 6 | Shared change does not regress doctor `ChatView` or patient notifications. | Regression inspection | **PASS** — only `DoctorChatPanel` consumes doctor `ChatView`; its reply click, composer, polling and sending props remain wired. Notifications still render the same `ChatView` with the same messages/empty-state/read server path; removed prop changes presentation only. |

Viewed live evidence from the exact candidate (fully loaded real data):

- `/home/dev/dev-projects/bcb-evidence/patient-chat-fix-20260908/screenshots/messages-mobile.png`
- `/home/dev/dev-projects/bcb-evidence/patient-chat-fix-20260908/screenshots/messages-desktop.png`
- `/home/dev/dev-projects/bcb-evidence/patient-chat-fix-20260908/screenshots/comments-mobile.png`
- `/home/dev/dev-projects/bcb-evidence/patient-chat-fix-20260908/screenshots/comments-desktop.png`

Lead runtime evidence also records 300ms opening/closing mobile animations and Escape closing the drawer.

## Blind behavioural kill-set

Compiled from owner authority before reviewing existing tests. Geometry, CSS, element counts, and source text are intentionally not automated.

| Fault injected temporarily | Red assertion | Outcome |
| --- | --- | --- |
| Page composer does not call send. | `PatientMessagesClient.ui.test.tsx`: `отправляет введённый текст на сервер и показывает его в треде` | Red: POST absent. |
| Page bootstrap omits `POST /api/patient/messages/read`. | `PatientMessagesClient.ui.test.tsx`: `помечает обращение прочитанным при открытии` | Red: expected POST, received none. |
| Page polling discards fetched messages. | `PatientMessagesClient.ui.test.tsx`: `при опросе обновляет тред, помечает его прочитанным и применяет read-only` | Red: new polled message absent. |
| Discussion composer does not call send. | `ProgramItemDiscussionDialog.ui.test.tsx`: `отправляет комментарий и сохраняет mark-read/onRead контракт` | Red: POST body absent. |
| Discussion polling discards fetched messages. | `ProgramItemDiscussionDialog.ui.test.tsx`: `опрос добавляет новый ответ врача и обновляет отметку прочтения` | Red: new doctor reply absent. |

Every temporary production mutation was reverted. No acceptance test was added: the existing UI tests already cover each named expensive, silent behavioural failure at the cheapest public layer; the remaining requirements are live visual acceptance.

## Commands run

```bash
git show --stat --oneline --decorate --find-renames 289a1f9d9
pnpm --dir apps/webapp exec vitest --run --project=ui src/app/app/patient/messages/PatientMessagesClient.ui.test.tsx src/app/app/patient/treatment/ProgramItemDiscussionDialog.ui.test.tsx
pnpm --dir apps/webapp typecheck
git diff --check
```

Results: `2` test files / `10` tests passed; webapp typecheck passed; final diff check passed with no residual temporary product changes.

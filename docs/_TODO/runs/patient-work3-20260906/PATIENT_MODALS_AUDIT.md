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

### Live visual acceptance: RUN AND PASSED 2026-09-06 — see «Live visual acceptance» below

Superseded. Historical state: the two port runners ended with transport/result failures (`blocked_system`; Claude returned invalid JSON) before recording the required 390×844/1280 live screenshots, so at that point this was not presented as a visual PASS. The gate has since been executed on the same candidate — evidence, per-scenario results and screenshots are in the «Live visual acceptance» section at the end of this file.

## Live visual acceptance

Run date: 2026-09-06. Role: `auditor-live` (this is the missing live gate of the audit above, not a new
code-audit round; no test was added and no product code was touched).

**Environment.** Isolated DEV webapp on `http://127.0.0.1:5311`, started from this worktree
(`next dev --disable-source-maps -H 127.0.0.1 -p 5311`, own `node_modules`, `.env`/`apps/webapp/.env.dev`
copied from the main checkout). The shared dev server on `5200` was never stopped or reused and was verified
still listening after the isolated server was restarted. Login: existing owner patient account
`kinesiospace@gmail.com` through the normal `POST /api/auth/email-password/login` path (AGENTS.md §1a); no
fixture user, clinic or seed data was created, and no external delivery was triggered. Interaction driver:
headless Chromium 1223 via `playwright-core`; viewports `390×844` (dSF 2, touch) and `1280×900`.
Existing DEV data only — program instance `7586d495…`, items `5c2a0ad5…` / `1775c14e…`.

Geometry was measured in the live DOM (dialog/overlay counts, computed `overflow-y` of every descendant,
element rects vs viewport) and confirmed by looking at each screenshot, not asserted from source.

### Scenario results

| # | Scenario | Viewport | Route / action | Outcome | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | Patient messages modal | 390×844 | `/app/patient/messages`; open, scroll thread to end, `Esc` | `PASS` | `patient-modals-live/s1-messages-mobile-01-open.png`, `…-02-scrolled.png`, `…-03-after-close.png` |
| 1 | Patient messages modal | 1280×900 | same + header `Close` | `PASS` | `patient-modals-live/s1-messages-desktop-01-open.png`, `…-02-scrolled.png`, `…-03-after-close.png` |
| 2 | Exercise discussion (draft, nested source layer, fullscreen media) | 390×844 | `/app/patient/treatment/7586d495…/item/1775c14e…?nav=exec` → «Комментарии» | `PASS` | `patient-modals-live/s2-discussion-mobile-01-open.png` … `…-05-after-fullscreen-close.png` |
| 2 | Exercise discussion | 1280×900 | same | `PASS` | `patient-modals-live/s2-discussion-desktop-01-open.png` … `…-05-after-fullscreen-close.png` |
| 3 | Long reminder edit form | 390×844 | `/app/patient/reminders` → «Изменить» | `PASS` | `patient-modals-live/s3-reminder-mobile-01-open.png`, `…-02-body-scrolled.png` |
| 3 | Long reminder edit form | 1280×900 | same | `PASS` | `patient-modals-live/s3-reminder-desktop-01-open.png`, `…-02-body-scrolled.png` |
| 4a | Booking history modal | 390×844 | `/app/patient/booking` → «Открыть историю» | `PASS` | `patient-modals-live/s4-booking-history-mobile-01-open.png`, `…-02-scrolled.png` |
| 4a | Booking history modal | 1280×900 | same | `PASS` | `patient-modals-live/s4-booking-history-desktop-01-open.png`, `…-02-scrolled.png` |
| 4b | Web-push onboarding prompt | 390×844 | `/app/patient` in installed-PWA display mode | `PASS` | `patient-modals-live/s5-webpush-mobile-01-prompt.png` |
| 4b | Web-push onboarding prompt | 1280×900 | same | `PASS` | `patient-modals-live/s5-webpush-desktop-01-prompt.png` |
| 5 | One backdrop across nested layers | both | discussion → nested source layer → fullscreen media | `PASS` | `patient-modals-live/s2-discussion-*-02-nested-source.png`, `…-04-fullscreen-media.png` |

Counts: **11 PASS, 0 BLOCKED, 0 FAIL.** Every named scenario had a reachable trigger in existing DEV data;
nothing was replaced by route-200 evidence.

### Measured evidence per requirement

**1. Messages modal.** Mobile: drawer header «Точка Здоровья» pinned at `y=47` before and after scrolling the
thread to its end (`scrollHeight 4833` in a `601px` body); exactly **one** scrolling descendant; composer
`716–772` and «Отправить» `784–828` inside the `844px` viewport; document not scrollable (`844/844`); `Esc`
closed the drawer and landed on `/app/patient` (`router.replace`, safe route). Desktop: header pinned at
`y=69`, one scroll owner (`507px` body, `scrollHeight 4837`), composer/«Отправить»/`Close` all in viewport,
header `Close` navigated to `/app/patient`. Header is the **active organization name as plain text** —
`0` links inside the header, no person name — on both viewports.

**No document double-scroll.** With the modal open `document.documentElement` computes `overflow-y: hidden`
and a real `wheel` gesture dispatched over the backdrop left `scrollTop` unchanged (mobile `0→0`, desktop
`593→593`). Only programmatic `window.scrollTo` still moves it, which is normal browser behaviour under
`overflow:hidden` and not reachable by a user gesture.

**2. Exercise discussion.** Header reads `Комментарии` with the item label as the second line
(«Обратный нордический наклон эксцентрика упрощенно») on both viewports; header stayed at `y=47` / `y=108`
while the thread scrolled. Draft `Черновик живой приёмки 06.09` was typed, **not sent** (no DB write).
Opening the source layer gave `dialogCount 2` / `overlayCount 1`; `Esc` closed **only** the top layer
(`dialogCount` back to 1) with the discussion still mounted and the draft intact. Opening fullscreen media
(image message in item `1775c14e…`) again gave `dialogCount 2` with the discussion still in the DOM; closing
it returned to the same thread with the draft still in the composer — verified in
`s2-discussion-mobile-05-after-fullscreen-close.png`.

**3. Reminder edit form.** «Изменить напоминание»: header pinned (`y=47` mobile / `y=33` desktop) and
unchanged after scrolling the body to its end; exactly one scrolling body (`693px` vs `scrollHeight 760`
mobile, `704` vs `712` desktop); footer bar pinned at the bottom with equal-width buttons
(«Отмена»/«Сохранить» `174px` each on mobile, `796–832` inside the `844px` viewport, `padding-bottom:
calc(0.75rem + env(safe-area-inset-bottom))`), nothing clipped. Nothing was saved.

**4. Booking history / web-push.** «История посещений»: same container, header pinned, one overlay, content
fits without a scroller, desktop `Close` present and in viewport, mobile closes by backdrop tap (verified:
`dialogs → 0`) and by the visible drag handle. Web-push onboarding («Включите уведомления») is gated on an
installed PWA (`display-mode: standalone`), so it was reached by launching Chromium in app mode against the
same session — a real trigger, not a stub: `vapidConfigured true`, `hasSubscription false`,
`Notification.permission default`. It rendered in the canonical container on both viewports with a pinned
footer whose «Не сейчас» / «Включить уведомления» buttons are unclipped (mobile `788–832` of `844`), and
dismissal closed it. Note for reproduction: Chromium does not report `display-mode: standalone` while
Playwright mobile-device emulation is on, so the `390×844` PWA capture was taken at that viewport with
device emulation off; the mobile drawer branch still rendered (drawer at `y=28`, full-width footer buttons),
which is what the breakpoint drives.

**5. One backdrop.** In every nested state — discussion + source layer, discussion + fullscreen media —
`overlayCount` stayed `1` with an unchanged backdrop colour (`oklab(0 0 0 / 0.25)` mobile,
`oklab(0 0 0 / 0.5)` desktop). No stacked darkening; `s2-discussion-desktop-02-nested-source.png` shows the
discussion behind the nested layer at the same brightness as before it opened.

No console or page errors were recorded in any run.

### Live observation outside the named requirements (owner question, not a finding)

On desktop (`≥640px`) a `PatientModal` **without** footer actions still paints an empty `25px` footer strip
with a top border and the footer background. Reproduced on `/app/patient/messages`, `/app/patient/booking`
→ «История посещений» and the exercise discussion; visible at the bottom of
`s4-booking-history-desktop-01-open.png`. Cause is mechanical: `cn(patientModalFooterBarClass, !hasFooter &&
'hidden')` — tailwind-merge drops the conflicting `grid` and keeps `hidden`, but the class list also carries
`sm:flex`, and the responsive variant wins over the unmodified `hidden` above `sm`, so the bar computes
`display: flex` with zero children (`display: none`, `0px` below `sm`, i.e. mobile is unaffected).

This is recorded, not fixed and not counted as `FAIL`: it violates none of the live requirements of this
gate (header/footer are fixed, one scroll owner, actions reachable and unclipped, one backdrop, safe close),
and per AGENTS.md §24.6 a defect with no matching owner-plan item is an owner question rather than audit
scope. Product code stays untouched by this pass.

### Verdict

`PASS` — candidate `256e46066b7de6e59d20ea22009ff4a539780a62`, 11/11 named live scenarios exercised and
passed across `390×844` and `1280×900`, 0 `BLOCKED`, 0 `FAIL`.

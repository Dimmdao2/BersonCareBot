# Auditor-live — #915 active-call navigation fix

## Subject and method

- Exact candidate: `6cbcc8cbb6c471d52aee669c9024cd62ca089301` (`fix(webapp): keep mobile call chrome reachable #915`).
- Authority checked: native-mobile `MASTER_PLAN.md` M4-01/M4-04/M4-05/M4-06 and M7-03.
- One-time browser check only; no production code and no permanent test were changed.
- Candidate server: `127.0.0.1:5210`, started from this candidate with `npx next dev -H 127.0.0.1 -p 5210`; its process used the named DEV runtime environment without printing its values. The candidate worktree first required `pnpm install --frozen-lockfile` and builds of its workspace runtime packages (`db-principal`, `operator-db-schema`, `error-tracking`, `shared-contracts`, `platform-merge`). `pnpm --dir apps/webapp migrate` was attempted as specified by the candidate runbook but could not run because this worktree has no local `DATABASE_URL`; no migration was applied.
- Browser: isolated Playwright Chromium context, `390 × 844`, `isMobile: true`, `hasTouch: true`, Chromium `/snap/bin/chromium`. Every navigation below was a visible role/link/button click; no direct coordinator callback, `Page.navigate`, terminal-event synthesis, or pointer-event manipulation was used.

## Observable doctor flow

1. Opened `/app/doctor/login?next=/app/doctor` in the isolated mobile browser.
2. Entered the documented DEV doctor credentials in the visible `Email` and `Пароль` fields and clicked visible `Войти`.
3. **PASS:** reached `/app/doctor`; visible global navigation included `Сегодня`, `Расписание`, `Клиенты`, `Задачи`, and other sections.
4. Clicked the visible `Клиенты` global-navigation link. **PASS:** reached `/app/doctor/patients` by ordinary user click.
5. **BLOCKED:** the resulting visible page contained only `Клиенты`, `Новый клиент`, and the signed-in user text; it exposed no existing patient-card link and no visible `Начать звонок` control. The only action was `Новый клиент`. Creating a fixture client, using a direct patient/live URL, or calling a meeting API would violate the brief and DEV login rules, so none was used.

The exact blocked user step is therefore: **from the authenticated doctor UI, open an existing patient card and use its visible normal start-call control to create the synthetic Jitsi iframe session.** It is not currently reachable for this account in this candidate DEV run.

## Binary verdicts

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| Ordinary authenticated doctor mobile entry and global navigation | PASS | Visible password login completed; visible `Клиенты` navigation click changed URL from `/app/doctor` to `/app/doctor/patients`. |
| Start a synthetic Jitsi iframe through ordinary doctor UI | BLOCKED | No visible existing patient or start-call control after the required global-navigation click. |
| Internal global-navigation click preserves the same iframe/render session in compact mode | BLOCKED | Depends on the unavailable ordinary start-call step; not replaced with an internal callback or direct route. |
| Return indicator returns to the exact call URL | BLOCKED | No active call could be created. |
| Normal start-call controls reject a second call | BLOCKED | No active call could be created. |
| Visible explicit Jitsi end clears the indicator with one terminal outcome | BLOCKED | No iframe was created; no synthetic terminal event was used. |
| Mobile call surface leaves header and bottom navigation reachable | BLOCKED | Call surface was not reachable. The pre-call mobile global navigation was visible and clickable. |
| Patient OTP supplementary check | NOT RUN | Conditional check; doctor mandatory live path blocked before an active call existed. No OTP/code was read from storage. |
| Desktop regression from this change | PASS (diff inspection) | `ActiveCallCoordinator` still renders the persistent stage only when `activeCall && isMobile`; both indicators return `null` outside mobile. The new doctor active-route bounds use measured header/bottom variables, while `DoctorBottomNav` remains `md:hidden`; no desktop floating UI was added. |

## Diff inspection

Read the complete candidate diff in `PatientClientLayout.tsx`, `DoctorBottomNav.tsx`, `DoctorHeader.tsx`, `DoctorWorkspaceShell.tsx`, and `ActiveCallCoordinator.tsx`.

The candidate moves the mobile active-route stage below measured shell chrome:

- patient: `top-[var(--patient-header-bar-height,0px)]` through `bottom-[var(--patient-bottom-nav-height,0px)]`;
- doctor: `top-[var(--doctor-header-height,0px)]` through `bottom-[var(--doctor-bottom-nav-height,0px)]`;
- doctor header and bottom navigation report their rendered heights to those variables.

This directly addresses the prior reachable-chrome concern. No reachable owner-requirement violation was demonstrated in this audit, so there is no finding. The live behavior gate remains **BLOCKED**, not PASS, until the named ordinary doctor start-call step is available.

## Commands and cleanup

- `pnpm install --frozen-lockfile` — PASS; no lockfile change.
- `pnpm --dir packages/{db-principal,operator-db-schema,error-tracking,shared-contracts,platform-merge} build` — PASS after dependency-order preparation.
- `curl http://127.0.0.1:5210/api/me` — `401` before login, expected unauthenticated response.
- Browser live flow above — doctor login and global-navigation portions PASS; active-call portion BLOCKED as documented.

The isolated Chromium contexts were closed. The candidate `:5210` process is stopped before this artifact is committed.

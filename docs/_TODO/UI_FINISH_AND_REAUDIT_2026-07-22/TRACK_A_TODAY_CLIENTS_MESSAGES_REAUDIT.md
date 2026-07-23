# Track A — Today / Clients / Messages re-audit

## Audit identity

- Run ID: `ui_three_pages_atomic_reaudit`
- Audited SHA: `bd5bf160017efc152d180b93d5ff1a4da424eb13`
- Evidence/test SHA: `0eda771fe2d9152f9252248ebe11f586737b0eed`
- Scope: one read-only audit pass; no code, deploy, runtime, plan-checkbox, or taskdb mutation.
- Denominator: the 14 unique atomic P2B-01…P2B-14 acceptance rows from `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`, section “Atomic acceptance — worker/auditor authority”, with the latest supersession from the work order and owner rulings. This is not the full UI-3/UI-4/UI-6 backend or information-architecture scope.

The UI code diff between the evidence/test SHA and audited SHA is empty for:

- `apps/webapp/src/app/app/doctor`
- `apps/webapp/src/shared/ui/doctor`
- `apps/webapp/src/app/styles`

Existing focused validation on the evidence/test SHA: 4 files / 69 tests PASS. Accumulated full CI was green on that SHA.

## Live evidence

Base directory:

`/home/dev/dev-projects/.lead/runs/ui-finish-984/0eda771fe/live-ui-audit-20260722T205446Z`

- D0: `doctor-desktop/i0_app_doctor_2026-07-22T20-57-25Z.png`
- D1: `doctor-desktop/i1_app_doctor_patients_2026-07-22T20-57-25Z.png`
- D2: `doctor-desktop/i2_app_doctor_communications_tab_chats_2026-07-22T20-57-25Z.png`
- M0: `doctor-mobile/i0_app_doctor_2026-07-22T20-59-34Z.png`
- M1: `doctor-mobile/i1_app_doctor_patients_2026-07-22T20-59-34Z.png`
- M2: `doctor-mobile/i2_app_doctor_communications_tab_chats_2026-07-22T20-59-34Z.png`

The corresponding last-shot JSON records show HTTP 200 and no console errors.

### Today populated/action addendum — 2026-07-23

External source-bound manifest for SHA `e669e2c123c41ddb1167af8e31e4f2f9f472c98b`:

`/home/dev/dev-projects/.lead/runs/ui6-today-live/e669e2c12-20260723T001405Z/manifest.md`

The hashed desktop/mobile PNGs show the warm DNA canvas, a populated Today support row without an enclosing side
frame, full-width hover through the far-right icons, and a 07:30 appointment with a 06:30 first grid boundary.
The interaction harness clicked the native row at `right edge - 4px` and focused it + pressed `Enter`; both waits
reached the patient workspace before the run continued. The reversible appointment was cancelled through the
canonical API with `notifyPatient=false` after capture.

### Messages populated-state attempt — blocked 2026-07-23

One bounded DEV attempt used only the existing patient product path; no fixture SQL, seed script, TEST/PROD access
or shared-setting change was used. The preflight started only webapp on `127.0.0.1:5200`, kept `:4200` free, and
verified on the actual child `next-server` process that `INTEGRATOR_API_URL` was looped back to the same local
webapp URL. Therefore any relay request could only terminate locally; the write failed before notification, and no
external delivery path was reached.

`dev:client` authentication and `GET /api/patient/messages` both returned HTTP 200. The single normal-product
`POST /api/patient/messages` then returned HTTP 500: the locked DEV transaction aborted in
`patientMessagingService.sendText`, and cleanup surfaced PostgreSQL `25P02` on `RESET ROLE`. A doctor-side readback
returned HTTP 200 with `conversations.length = 0`, proving that no personal message/populated dialog persisted.
The browser capture was not started. The DEV server was canonically stopped and both `:5200` and `:4200` were
confirmed free; incomplete runtime artifacts and cookie jars were removed.

This is a recorded evidence-fixture blocker, not implementation evidence. P2B-06, P2B-10 and P2B-13 remain
**partial** with the matrix counts below unchanged. A future worker must not repeat this product-write path until
the locked-principal failure is fixed or an approved populated DEV fixture path exists.

### Ordinary TEST populated Messages closure — 2026-07-23

The independent one-pass presentation audit ran against deployed TEST SHA
`5d6e83c569e300744f5840a2687b335db5445c8c`. All five TEST services and both loopback health endpoints were green.
The canonical protected patient fixture session bootstrapped its own empty conversation, sent one synthetic message
through the normal `POST /api/patient/messages` path with the exact TEST origin, received HTTP 200, and read the
persisted message back. A random conversation id remained HTTP 404. The locked product smoke passed 22/22 and the
separate global-admin clinical-write denial remained HTTP 403.

Presentation evidence is under:

`/home/dev/dev-projects/.lead/runs/ui-finish-984/5d6e83c56/test-live-20260723T1434Z`

The run contains patient Messages, doctor Today/Clients/Messages desktop and mobile PNGs, plus selected-thread PNGs.
The populated Messages row was activated at its far-right edge and with native-button `Enter` on both desktop and
mobile. Both paths selected the conversation without console or request errors. Computed live styles confirmed
`#F6F4EF` canvas, zero left/right row and list borders, `#f0efeb` divider color, and `16px/400` primary typography.
Today's populated native link and Clients' row buttons also passed far-right pointer and keyboard activation.

This presentation closure does not hide a separate functional defect found in the same run. Patient UI retries
`POST /api/patient/messages/read`, which returns HTTP 500 because PostgreSQL denies the direct
`UPDATE support_conversation_messages` (`aclcheck_error`). Sending and displaying the message are green; marking
incoming messages read is not. That defect is outside P2B-01…P2B-14 presentation scope and remains open separately.

## Atomic acceptance matrix

### P2B-01 — real-done

> Desktop «Сегодня» использует точное разделение `50/50`; mobile composition не регрессирует.

- Code: `DoctorTodayDashboard.tsx:118-122`.
- Test: `DoctorTodayDashboard.test.tsx:198-205`.
- Live: D0 shows equal panes; M0 shows the stacked mobile composition.

### P2B-02 — real-done

> **SUPERSEDED — 2026-07-22 by `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2:** Doctor workspace canvas uses exact Design DNA `#F6F4EF`; page headers and primary surfaces remain white.

- Code: `doctor.css:3-15`; `bersoncare-tweakcn-theme.css:88-101`.
- Test: `doctorDnaTheme.contract.test.ts:7-14`; chrome test `:29-37`.
- Live: all D/M canvas pixels sampled as `(246, 244, 239)`; headers and primary surfaces are white.

### P2B-03 — real-done

> Shared section tabs имеют более тёмный neutral hover и свой округлённый tab contract без page-local divergence; это не меняет геометрию sidebar/mobile menu.

- Code: `DoctorSectionTabs.ts:3-16`; `navChrome.ts:6-7`.
- Test: `DoctorPresentationChrome.test.tsx:89-100`.
- Live: D2/M2 show the tabs; D0/D2 show the menu with minimal radius.

### P2B-04 — real-done

> Видимая сетка Today calendar начинается ровно за один час до первого приёма, когда именно приём расширяет нижнюю границу; общий calendar-window contract не получает локальный fork или двойной lead padding.

- Code: `DoctorTodayMiniCalendar.tsx:151-165`.
- Test: exact boundary in `DoctorTodayMiniCalendar.test.tsx:383-396`.
- Live: the 2026-07-23 addendum desktop/mobile PNGs show a 07:30 appointment and the first grid boundary at 06:30.

### P2B-05 — real-done

> В Today calendar header используется standard doctor button **«Открыть расписание»**, а не текстовая/ghost-ссылка «Открыть календарь».

- Code: `DoctorTodayMiniCalendar.tsx:227-236`.
- Test: mini-calendar `:127`; dashboard `:190-195`.
- Live: the button is visible in D0/M0.

### P2B-06 — real-done

> Clients и Messages используют общий flat-list row contract с геометрией списка «На сопровождении», full-row hover для интерактивных строк и divider ровно `1px #f0efeb`; selected dialog не превращается в отдельную карточку.

- Code: shared `DoctorDnaFlatListRow.tsx:17-27`; Clients `PatientsPageClient.tsx:761-800`; Messages `DoctorSupportInbox.tsx:358-422`.
- Test: Clients `PatientsPageClient.test.tsx:157-174`; Messages `DoctorSupportInbox.test.tsx:93-122`.
- Live: the original D1/M1 show Clients rows. The 2026-07-23 TEST closure shows the populated Messages row and
  selected state on desktop/mobile; list/row side borders compute to zero and the divider resolves to `#f0efeb`.

### P2B-07 — real-done

> Semantic doctor primary остаётся ровно `#406ca7` через doctor-zone token; local primary hex и перекраска patient/public tokens отсутствуют.

- Code: theme line 101; the scoped census contains no local primary hex.
- Test: full CI and shared chrome semantic `bg-primary` coverage.
- Live: the D2 active-tab pixel is exactly `(64, 108, 167)`.

### P2B-08 — real-done

> Page headers и фактические input surfaces белые.

- Code: `DoctorPageHeader.tsx:61-99`; doctor `input.tsx:8-15`.
- Test: chrome `:29-61`.
- Live: D1/D2/M1/M2 show white headers and search inputs.

### P2B-09 — real-done

> Shared radius scale соблюдена: page-level blocks `12px`, KPI `8px`, doctor buttons/inputs/select triggers `24px`; sidebar/mobile menu rows сохраняют прежний почти прямоугольный минимальный radius, tabs живут по отдельному rounded contract. **Owner ruling 2026-07-22:** visual canon for Clients/Messages list surfaces is Today; those lists receive no added side border or enclosing side frame.

- Code: tokens `doctor.css:7-13`; shared row `DoctorDnaFlatListRow.tsx:17-21`; client surface `PatientsPageClient.tsx:701`; message surface `DoctorSupportInbox.tsx:282`.
- Test: chrome `:20-27,39-65,68-100`; Clients `:169-174,230-231`; Messages `:100-121`.
- Live: D1/M1 and empty D2/M2 have no side frame.

### P2B-10 — real-done

> Основные page-blocks используют внутренний padding `18px` через shared doctor primitives, без локальных копий в затронутых страницах. **Owner ruling 2026-07-22:** Today is one full-row native link; Clients and Messages retain their full-row native button behavior, including keyboard activation.

- Code: Today `DoctorTodayDashboard.tsx:178-224`; Clients `PatientsPageClient.tsx:761-800`; Messages `DoctorSupportInbox.tsx:358-422`.
- Test: Today `DoctorTodayDashboard.test.tsx:249-297`; Clients `PatientsPageClient.test.tsx:209-232`; Messages `DoctorSupportInbox.test.tsx:77-91`.
- Live: Clients whole-row left/right hit and keyboard behavior remain proven. The 2026-07-23 Today addendum proves
  full-row hover, far-right pointer activation and native-link `Enter` on the populated support row. The ordinary
  TEST closure proves the populated Messages native button at its far-right edge and through `Enter` on both
  desktop and mobile.

### P2B-11 — real-done

> KPI используют единый порядок label сверху → value снизу и `doctorMetricValueClass` для значения.

- Code: `DoctorStatCard.tsx:54-58`; `doctorVisual.ts:62-71`.
- Test: `DoctorStatCard.test.tsx:8-16`.
- Live: D0/D1/M0 show label above value.

### P2B-12 — real-done

> Поиск «Клиентов» находится в правом слоте белой page header на уровне title; desktop width совпадает с правой половиной `50/50`, mobile вариант остаётся доступным и компактным.

- Code: `PatientsPageClient.tsx:657-688`.
- Test: `PatientsPageClient.test.tsx:134-139`.
- Live: D1 shows the search in the right half of the header; M1 shows the compact variant.

### P2B-13 — real-done

> Primary text строк Clients/Messages/Today support крупнее и легче (`text-base font-normal`), а meta/badge/calendar typography не повышена вместе с ним.

- Code: shared row `DoctorDnaFlatListRow.tsx:17-27` and all consumers.
- Test: chrome `:68-87`; Clients `:157-171`; Messages `:100-110`.
- Live: Clients rows and the populated Today support row are visible with the larger/lighter primary line. The
  populated TEST Messages row is visible on desktop/mobile and computes to `16px` / `font-weight: 400`.

### P2B-14 — real-done

> Изменения переиспользуют shared doctor primitives/list-row/tab/calendar contracts и сохраняют физическую patient/doctor UI isolation; локальные style forks и imports из patient/components UI не добавлены. **Owner ruling 2026-07-22:** this list correction is limited to the shared flat-list contract and its three consumers; no unrelated UI scope is opened.

- Code: one shared row and its three consumers; the scoped census contains no imports from patient/components UI.
- Test: focused suites, lint, and full CI passed on the evidence/test SHA.
- Live: all six PNGs show no visible cross-zone regression.

## Aggregate result

- real-done: **14/14**
- partial: **0/14**
- fake-done: **0/14**
- owner-deferred: **0/14**

## Per-page evidence-real status

- Today: **11/11 evidence-real**. **NOT DONE:** formal owner acceptance only.
- Clients: **10/10**. **NOT DONE:** formal owner acceptance only.
- Messages/Chats: **9/9 presentation evidence-real**. **NOT DONE:** formal owner acceptance and the separate
  patient mark-read HTTP 500 / denied `UPDATE support_conversation_messages` defect.

## Mandatory NOT DONE and owner-acceptance boundary

- Owner-closed remains **0/14** until the owner accepts the live PNG/click-through evidence.
- Audit PASS or evidence-real status is not owner acceptance.
- Do not mark the plan or taskdb done from this audit record.
- The patient mark-read failure is not covered up by this presentation PASS and remains a separate runtime defect.

## Patient Messages locked-principal correction — independent re-audit 2026-07-23

The cumulative correction was integrated on `feat/doctor-ui-rebuild` as `aba80b004` + `890f182b1` only after the
original independent auditor reran the full seven-row security matrix and returned **PASS 7/7**:

1. the current patient can send to their own open conversation under locked `app_patient`;
2. the send updates activity and `last_message_at` with one server transaction timestamp;
3. direct broad UPDATE remains denied, and foreign, closed or inactive conversations fail before durable activity;
4. organization/patient identity is derived only from the signed DB principal;
5. migration, Drizzle journal and E1 overlay are aligned and idempotent;
6. focused repository/service/route/security tests, typecheck, lint and DB regression checks pass;
7. a cleanup `25P02` can no longer mask the original callback `42501`; the outer transaction rolls back first.

Executed evidence: affected suites `55/55`, patient Messages route `9/9`, webapp typecheck, scoped ESLint, journal
sync, frozen-migration guard, SaaS DB regression, `git diff --check`, and a disposable real-PostgreSQL rehearsal
covering own send/activity, foreign patient/org denial, stale/forged-role denial, closed-dialog insert rollback,
unchanged closed-dialog activity and least-privilege ACL. The auditor made no code changes.

The ordinary TEST run above now closes the patient-send and populated-dialog presentation prerequisites. It does
not close the independently observed patient mark-read defect, and no owner acceptance is inferred.

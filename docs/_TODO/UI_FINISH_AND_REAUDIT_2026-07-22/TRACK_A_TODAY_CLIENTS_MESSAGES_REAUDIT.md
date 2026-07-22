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

### P2B-04 — partial

> Видимая сетка Today calendar начинается ровно за один час до первого приёма, когда именно приём расширяет нижнюю границу; общий calendar-window contract не получает локальный fork или двойной lead padding.

- Code: `DoctorTodayMiniCalendar.tsx:151-165`.
- Test: exact boundary in `DoctorTodayMiniCalendar.test.tsx:383-396`.
- Live: D0/M0 use an empty fixture, so the first-appointment boundary is not shown.

### P2B-05 — real-done

> В Today calendar header используется standard doctor button **«Открыть расписание»**, а не текстовая/ghost-ссылка «Открыть календарь».

- Code: `DoctorTodayMiniCalendar.tsx:227-236`.
- Test: mini-calendar `:127`; dashboard `:190-195`.
- Live: the button is visible in D0/M0.

### P2B-06 — partial

> Clients и Messages используют общий flat-list row contract с геометрией списка «На сопровождении», full-row hover для интерактивных строк и divider ровно `1px #f0efeb`; selected dialog не превращается в отдельную карточку.

- Code: shared `DoctorDnaFlatListRow.tsx:17-27`; Clients `PatientsPageClient.tsx:761-800`; Messages `DoctorSupportInbox.tsx:358-422`.
- Test: Clients `PatientsPageClient.test.tsx:157-174`; Messages `DoctorSupportInbox.test.tsx:93-122`.
- Live: D1/M1 show Clients rows. The D2/M2 chat list is empty, so its selected state is unavailable.

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

### P2B-10 — partial

> Основные page-blocks используют внутренний padding `18px` через shared doctor primitives, без локальных копий в затронутых страницах. **Owner ruling 2026-07-22:** Today is one full-row native link; Clients and Messages retain their full-row native button behavior, including keyboard activation.

- Code: Today `DoctorTodayDashboard.tsx:178-224`; Clients `PatientsPageClient.tsx:761-800`; Messages `DoctorSupportInbox.tsx:358-422`.
- Test: Today `DoctorTodayDashboard.test.tsx:249-297`; Clients `PatientsPageClient.test.tsx:209-232`; Messages `DoctorSupportInbox.test.tsx:77-91`.
- Live: Clients whole-row left/right hit and keyboard behavior are proven; populated Today and Messages rows are absent.

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

### P2B-13 — partial

> Primary text строк Clients/Messages/Today support крупнее и легче (`text-base font-normal`), а meta/badge/calendar typography не повышена вместе с ним.

- Code: shared row `DoctorDnaFlatListRow.tsx:17-27` and all consumers.
- Test: chrome `:68-87`; Clients `:157-171`; Messages `:100-110`.
- Live: Clients rows are visible; Today support and Messages rows are absent.

### P2B-14 — real-done

> Изменения переиспользуют shared doctor primitives/list-row/tab/calendar contracts и сохраняют физическую patient/doctor UI isolation; локальные style forks и imports из patient/components UI не добавлены. **Owner ruling 2026-07-22:** this list correction is limited to the shared flat-list contract and its three consumers; no unrelated UI scope is opened.

- Code: one shared row and its three consumers; the scoped census contains no imports from patient/components UI.
- Test: focused suites, lint, and full CI passed on the evidence/test SHA.
- Live: all six PNGs show no visible cross-zone regression.

## Aggregate result

- real-done: **10/14**
- partial: **4/14** — P2B-04, P2B-06, P2B-10, P2B-13
- fake-done: **0/14**
- owner-deferred: **0/14**

## Per-page evidence-real status

- Today: **8/11**. **NOT DONE:** live evidence with a first appointment for the one-hour calendar window; a populated support row for whole-row activation and primary typography.
- Clients: **10/10**. **NOT DONE:** formal owner acceptance only.
- Messages/Chats: **6/9**. **NOT DONE:** the fixture has no dialog, so live whole-row activation, divider/primary typography, and selected state are not verified.

## Mandatory NOT DONE and owner-acceptance boundary

- Owner-closed remains **0/14** until the owner accepts the live PNG/click-through evidence.
- Audit PASS or evidence-real status is not owner acceptance.
- Do not mark the plan or taskdb done from this audit record.
- No new findings are opened by this documentation-only persistence step.

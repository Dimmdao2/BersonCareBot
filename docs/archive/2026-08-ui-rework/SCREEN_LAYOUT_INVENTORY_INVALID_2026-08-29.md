# [АРХИВ / НЕГОДЕН] Screen Layout Inventory

> ⛔ **НЕ ИСПОЛЬЗОВАТЬ КАК AUTHORITY, ОСНОВУ РЕАЛИЗАЦИИ ИЛИ АУДИТА.**
> Это снимок от 2026-07-13, который больше не соответствует интерфейсу в период активной UI-переработки.
> Актуальную геометрию определять только по текущему коду и live UI. Новый inventory можно создать или этот
> документ можно актуализировать только после стабилизации UI.

> Историческая карта внешних раскладок экранов на 2026-07-13.
> Этот документ не описывает внутреннее содержимое карточек, форм и списков. Он фиксирует только shell, общий контейнер, число колонок, ширины, scrolling model и маршруты, которые используют один и тот же layout.
>
> Базовый канон шире: `docs/ARCHITECTURE/SCREEN_ARCHITECTURE_GUIDE.md`.

## 1. Shell Widths

| Zone                    | Shell                                 |                                                      Width | Notes                                                                 |
| ----------------------- | ------------------------------------- | ---------------------------------------------------------: | --------------------------------------------------------------------- |
| Doctor                  | `DoctorWorkspaceShell`                |                                        content `max-w-7xl` | Desktop: left sidebar `w-56` + content. Mobile: fixed `DoctorHeader`. |
| Doctor default page     | `DoctorAppShell`                      |                  `mx-auto w-full max-w-7xl px-3 pt-3 pb-6` | Normal document scroll, `main` is `flex flex-col gap-3`.              |
| Doctor full-height page | `DoctorAppShell layout="full-height"` |                      same visible width, no bottom padding | Used when inner panes own scroll: patients, schedule, communications. |
| Patient                 | `PatientAppShell`                     | mobile cap `430px`, desktop cap `min(1180px, 100% - 2rem)` | Bottom-nav shell by default. Content is one flex column.              |
| Patient embedded        | `PatientAppShell patientEmbedMain`    |                                            `max-w-[480px]` | Used for embedded/auth contexts, not a regular page layout.           |

## 2. Layout Types

### L1. Doctor Stack Page

Single-column doctor page inside `DoctorAppShell`.

- Width: doctor `max-w-7xl`.
- Columns: 1 outer column.
- Vertical rhythm: `main flex flex-col gap-3`; sections usually `DoctorSection` or `doctorSectionCardClass`.
- Header: usually `DoctorPageHeader`.
- Typical use: settings, admin pages, simple lists, standalone forms, health/audit pages.

Routes/groups:

- `/app/doctor/audit-log`
- `/app/doctor/appointments`
- `/app/doctor/courses`, `/courses/new`, `/courses/[id]`
- `/app/doctor/content/sections`, `/content/sections/new`, `/content/sections/edit/[slug]`
- `/app/doctor/content/new`, `/content/edit/[id]`
- `/app/doctor/material-ratings`, `/material-ratings/[kind]/[id]`
- `/app/doctor/admin/*`, `/admin/booking/*`
- `/app/doctor/system-health`, `/health-archive`, `/booking-merge`, `/usage`, `/install`

### L2. Doctor Today Two-Pane Dashboard

Dashboard-specific two-column layout.

- Shell: `DoctorAppShell` default.
- Width: doctor `max-w-7xl`.
- Columns: mobile 1 column; desktop `md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]`.
- Scroll: document scroll.
- Header: `DoctorPageHeader`.

Routes/groups:

- `/app/doctor`

### L3. Doctor Catalog Master-Detail

Canonical catalog with list/master left and detail/editor right.

- Shell: `DoctorAppShell` default unless embedded in full-height tab shell.
- Components: `DoctorCatalogPageLayout` + `DoctorCatalogFiltersToolbar` + `CatalogSplitLayout` + `CatalogLeftPane` + `CatalogRightPane`.
- Columns: default `lg:grid-cols-2` (50/50).
- Mobile: slide panels, `mobileView="list" | "detail"`.
- Height: usually `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE`; expanded filters use `DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_EXPANDED`.
- Left pane: bordered `bg-card`, internal scroll/sticky height.
- Right pane: `bg-card`, rounded, no second border/shadow.

Routes/groups using the canonical catalog:

- `/app/doctor/exercises`
- `/app/doctor/clinical-tests`
- `/app/doctor/recommendations`
- `/app/doctor/lfk-templates`
- `/app/doctor/test-sets`
- `/app/doctor/treatment-program-templates`

Important width variants:

- `/app/doctor/messages` / support inbox: `lg:grid-cols-[0.8fr_1.6fr]`.
- `/app/doctor/communications?tab=intake`: `lg:grid-cols-[1fr_1.4fr]`.
- `/app/doctor/communications?tab=comments`: uses the same split engine inside the comments tab.
- `/app/doctor/communications?tab=broadcasts`: uses the same split engine inside the broadcasts tab.
- Patient-card files tab: embedded `CatalogSplitLayout` inside the entity card tab.

### L4. Doctor Patients Workbench

Custom full-height two-column workbench, close to master-detail but not the shared `CatalogSplitLayout`.

- Shell: `DoctorAppShell layout="full-height"`.
- Columns: mobile 1 column; desktop `lg:grid-cols-[1.4fr_1fr]`.
- Left: client list with own bounded height and sticky list header.
- Right: selected client preview/rail.
- Header: `DoctorPageHeader`.

Routes/groups:

- `/app/doctor/patients`

### L5. Doctor Entity Card

Single page entity shell with sticky entity header and tabs.

- Shell: `DoctorAppShell` default.
- Columns: 1 outer column.
- Inner layout: tabs; overview/program tabs may use internal grids.
- Header: currently entity-local (`PatientCareBar`/`PatientActionStrip`), not fully normalized to `DoctorPageHeader`.
- Scroll: document scroll.

Routes/groups:

- `/app/doctor/patients/[userId]`
- `/app/doctor/patients/[userId]/[...tabSlug]`
- `/app/doctor/subscribers/[userId]`
- `/app/doctor/patients/[userId]/programs/[instanceId]`

Important internal width variant:

- Program instance detail inside patient card uses `lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]`.

### L6. Doctor Full-Height Tab Shell

Full-height page with sticky `DoctorPageHeader` tabs and keep-mounted tab panels.

- Shell: `DoctorAppShell layout="full-height"`.
- Columns: shell itself is 1 column; tab body decides layout.
- Header: `DoctorPageHeader` with `tabs` slot.
- Scroll: tab panels are `flex min-h-0 flex-1`; inner tab panes usually own scrolling.

Routes/groups:

- `/app/doctor/schedule`
- `/app/doctor/communications`

Tab body examples:

- Schedule calendar: calendar-specific toolbar + FullCalendar grid + dialogs/panels.
- Communications chats/intake/comments/broadcasts: often master-detail split inside tab body.

### L7. Doctor Analytics Tab Page

Tabbed analytics page, not full-height.

- Shell: `DoctorAppShell` default.
- Columns: 1 outer column.
- Header: `DoctorPageHeader` with tab buttons.
- Body: KPI grids and chart sections; some sub-sections use internal `lg:grid-cols-2`.
- Scroll: document scroll.

Routes/groups:

- `/app/doctor/analytics`
- `/app/doctor/analytics/clients`
- `/app/doctor/analytics/notifications`
- `/app/doctor/stats`

### L8. Doctor CMS Hub

Current CMS hub layout. This is the main outlier.

- Shell: `DoctorAppShell` default.
- Header: `DoctorPageHeader`.
- Columns: mobile 1 column; desktop `md:flex-row`.
- Left nav: `ContentNav`, `md:w-56 md:shrink-0`.
- Right pane: `flex min-w-0 flex-1 flex-col gap-4`.
- Inner content: section lists or inline editor replace the right pane content. It does not use `CatalogSplitLayout`.
- Scroll: document scroll.

Routes/groups:

- `/app/doctor/content`

Current CMS issue:

- The hub mixes three concepts in one layout: navigation tree, list of pages, and inline editor.
- It reuses catalog list controls in places, but the outer shell is not the catalog master-detail shell.
- If the target is "CMS on a list", the clean target should be either:
  - T2-style list page: left nav becomes a filter/source selector, right pane is a flat list, editing goes to `/content/edit/[id]`; or
  - T3-style master-detail: left pane is the page list/tree, right pane is the editor, both inside `CatalogSplitLayout`.

### L9. Doctor Media Library

One-column media/file library.

- Shell: `DoctorAppShell` default.
- Header: `DoctorPageHeader`.
- Columns: 1 outer column.
- Toolbar: view switch, filters, folder scope, sort, search, upload controls in a wrapping row.
- Body:
  - media mode: grid `grid-cols-2 sm:grid-cols-3 md:grid-cols-4`;
  - file/mobile mode: vertical list/table-like rows.
- Scroll: document scroll + infinite load sentinel.

Routes/groups:

- `/app/doctor/content/library`
- `/app/doctor/content/library/delete-errors` is a simple stack page.

### L10. Patient Standard Stack

Default patient internal page layout.

- Shell: `PatientAppShell`.
- Width: mobile `430px`; desktop up to `1180px`.
- Columns: 1 outer column.
- Stack: `patientInnerPageStackClass` = `flex flex-col gap-3 md:gap-4`.
- Optional card grid: `patientInnerCardGridClass` = 1 column mobile, 2 columns from `md`.

Routes/groups:

- `/app/patient/profile`
- `/app/patient/reminders`, `/reminders/journal/[ruleId]`
- `/app/patient/diary`, `/diary/lfk/journal`, `/diary/symptoms/journal`
- `/app/patient/intake/lfk`, `/intake/nutrition`
- `/app/patient/help`, `/help/[slug]`
- `/app/patient/content/[slug]`, `/sections`, `/sections/[slug]`
- `/app/patient/courses`, `/lessons`
- `/app/patient/purchases`, `/purchases/pay`
- `/app/patient/memberships/[id]`, `/memberships/pay`
- `/app/patient/profile`, `/address`, `/about`, `/install`, `/cabinet`, `/emergency`

### L11. Patient Today Mosaic

Homepage-specific responsive mosaic.

- Shell: `PatientAppShell` with suppressed shell title.
- Outer: `PatientHomeTodayLayout`, flex column.
- Grid: `sm:grid-cols-12`, dense flow, `gap-5 md:gap-6 xl:gap-7`.
- Common desktop spans:
  - warmup/useful post: `8/4`;
  - situations/plan: `8/4`;
  - many status rows: full width `12/12`.
- This layout is home-only and should not be reused for internal pages.

Routes/groups:

- `/app/patient`

### L12. Patient Treatment Program

Program-specific patient flow on top of the standard stack.

- Shell: `PatientAppShell`.
- Columns: 1 outer column.
- Body: `patientInnerPageStackClass`.
- Detail page includes program hero/status, sticky 3-column tab strip (`PatientPlanTabStrip`), and tab panels.
- Stage/item pages keep one-column stack; item page can suppress shell title for a custom top visual.

Routes/groups:

- `/app/patient/treatment`
- `/app/patient/treatment/[instanceId]`
- `/app/patient/treatment/[instanceId]/item/[itemId]`
- `/app/patient/treatment/promo`
- `/app/patient/treatment/promo/item/[templateStageItemId]`

### L13. Patient Chat

Patient messaging layout has two current chrome variants.

- Shell: `PatientAppShell`.
- Messages page:
  - one card-like bounded chat surface;
  - `patient-messages-chat-height`;
  - `ChatView variant="patient"` fills remaining height.
- Notifications page:
  - standard stack;
  - `patientSectionSurfaceClass flex min-h-[60dvh]`;
  - `ChatView variant="patient"` inside section.

Routes/groups:

- `/app/patient/messages`
- `/app/patient/notifications`
- `/app/patient/support` is a stack/info page, not the chat thread itself.

Decision needed:

- Keep full chat page as the canonical chrome for dedicated messaging, and use card chrome only when chat is embedded in another page.

### L14. Patient Booking Wizard

Booking-specific wizard wrapper.

- Shell: `BookingWizardShell`, which wraps `PatientAppShell`.
- Columns: 1 outer column.
- Top: step row ("Шаг N из M") plus optional in-content back link.
- Body: `patientInnerPageStackClass`.
- Known inconsistency: the wizard owns title/back/step presentation separately from the shell slots.

Routes/groups:

- `/app/patient/booking`
- `/app/patient/booking/city`
- `/app/patient/booking/service`
- `/app/patient/booking/slot`
- `/app/patient/booking/confirm`
- `/app/patient/booking/done`

## 3. Quick Route-To-Layout Map

| Route group                                                                                                               | Layout                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `/app/doctor`                                                                                                             | L2 Today two-pane dashboard                                      |
| `/app/doctor/patients`                                                                                                    | L4 patients workbench                                            |
| `/app/doctor/patients/[userId]` and subscriber detail                                                                     | L5 entity card                                                   |
| `/app/doctor/exercises`, `clinical-tests`, `recommendations`, `lfk-templates`, `test-sets`, `treatment-program-templates` | L3 catalog master-detail                                         |
| `/app/doctor/schedule`                                                                                                    | L6 full-height tab shell; calendar tab has its own calendar grid |
| `/app/doctor/communications`                                                                                              | L6 full-height tab shell; tabs often use L3-style split          |
| `/app/doctor/messages`, online-intake/comments/broadcasts tab bodies                                                      | L3-style split with asymmetric widths                            |
| `/app/doctor/analytics`, `stats`, analytics subpages                                                                      | L7 analytics tab/KPI/chart page                                  |
| `/app/doctor/content`                                                                                                     | L8 CMS hub outlier                                               |
| `/app/doctor/content/library`                                                                                             | L9 media library                                                 |
| doctor admin/settings/audit/health/appointments/courses/material-ratings/standalone editors                               | L1 stack page                                                    |
| `/app/patient`                                                                                                            | L11 patient today mosaic                                         |
| `/app/patient/treatment*`                                                                                                 | L12 treatment program flow                                       |
| `/app/patient/messages`, `/notifications`                                                                                 | L13 patient chat variants                                        |
| `/app/patient/booking*`                                                                                                   | L14 booking wizard                                               |
| patient profile/reminders/diary/help/content/sections/courses/purchases/memberships/settings/info                         | L10 patient standard stack                                       |

## 4. Practical Notes For The Next UI Pass

1. Doctor has three high-value reusable layouts: L1 stack, L3 catalog split, L6 full-height tab shell. Most visual drift should be fixed by making pages pick one of these explicitly.
2. CMS is the clearest structural exception. It should be redesigned as either a true L3 master-detail editor or a T2/L1 list page with standalone edit routes. Given the current request "CMS on a list", prefer the list-page target unless inline editing is a hard product requirement.
3. Patient app is mostly one-column by design. The only intentionally complex patient layout is the home mosaic; treatment and booking are flow-specific wrappers over the same stack.
4. Chat should have one rule: dedicated chat page = bounded full chat surface; embedded chat = card section. Right now patient notifications uses the embedded variant, messages uses the dedicated variant.
5. TweakCN remains relevant only for tokens/theme. It does not replace these layout decisions.

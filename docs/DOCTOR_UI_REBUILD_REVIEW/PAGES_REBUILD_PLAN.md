# Doctor cabinet — pages rebuild (phase after patient-card)

Working branch: `claude/doctor-pages-rebuild` (worktree `.claude/worktrees/doctor-pages`,
based on `feat/doctor-ui-rebuild`). Source of truth = owner backlog (Notion «Кабинет
доктора — пересборка страниц 2026-06-13/14») + in-repo wireframe
`docs/design/doctor-cabinet-wireframe.html` (its **inner content only** — the outer
shell/chrome in the wireframe is stale; canonical shell comes from the live
Сегодня/Расписание pages).

## Ground rules for this phase
- Build **inside the page container**; do not rebuild the shell. Reuse
  `DoctorAppShell`, `DoctorPageHeader` (title/subtitle/tabs/toolbar slots),
  `DoctorWorkspaceShell`/`DoctorAdminSidebar`.
- Reuse the exercises-page catalog primitives (`catalog/*`,
  `DoctorCatalogMasterListHeader` list/card toggle, etc.). No hand-rolled UI.
- Clean architecture: DB only via ports, no raw SQL in app/UI layers.
- Do **not** fabricate metrics that the backend does not track — surface a clear
  "данные пока не собираются" state instead.
- Another chat works in parallel on payments / booking-lifecycle / system-settings.
  Avoid those files; defer Настройки/Система (overlap risk).

## Sequencing
1. **#3 Курсы → top-level nav** — DONE (commit `feat(doctor-nav): promote Курсы…`).
   Route already existed; pure `doctorNavLinks.ts` reorg + test.
2. **#1 Аналитика → one page, 4 tabs** (Клиенты · Контент · Приложение · Уведомления)
   — DONE + verified (commit `feat(doctor-analytics): consolidate…`). Page-shell
   `/app/doctor/analytics` (`DoctorAnalyticsShell`, keepMounted client tabs in the
   `DoctorPageHeader` tabs slot, `?tab=` URL-sync). Клиенты gets a server SSR
   snapshot; Контент/Приложение/Уведомления self-fetch. 308 redirects from
   `/analytics/clients`, `/usage`, `/analytics/notifications`. Nav cluster → single
   admin-only link. **Verified** live (worktree dev server, dev:admin): all 4 tabs
   render real data, tab switching + legacy redirects work, typecheck clean, nav
   test green.
   - **Phase-2 refinements (not done):** (a) dedup the push-open-rate chart — it
     currently appears as «вар 1» on Контент and «вар 2» on Уведомления; pick one
     source. (b) Воронка записи + broadcast read-receipts blocks await backend
     events that don't exist yet (see gaps below). (c) Pin down the
     «клиент / потенциальный» definition in code. (d) Optionally re-home the
     content-engagement charts (practice completions / video opens) fully into the
     Контент tab. (e) Old page.tsx files (`analytics/clients`, `usage`,
     `analytics/notifications`) are now unreachable behind 308s — candidates for
     deletion once the new shell is accepted (their client components are still
     used by the tabs and must stay).
3. **#2 Контент** — system sections vs «Статьи и страницы», card/list grid, material
   editor wiring, 👁 visibility pattern extended from Разминки. Full step breakdown in
   `CONTENT_REWORK_PLAN.md`.
   - **Steps 1–2 DONE + verified live**: client-side `ContentNav` panel switcher
     (`?section=` URL-sync) + `ContentHubShell`; `ContentPageTileCard` + list/card
     toggle (`VirtualizedItemGrid`, DnD list-only). tsc clean. Verified via headless
     screenshots (dev:admin): left nav groups render, system-folder + article panes
     render, list↔tiles toggle works. **A hydration mismatch was found and fixed**
     (view-mode preference was read in the `useState` initializer → diverged from SSR;
     now applied in a post-mount effect like `ExercisesPageClient`).
   - Steps 3–6 pending (3 = rating aggregates port method + pg query, unit-testable
     without a dev server; 4 = master-detail inline editor; 5 = embed media/patient-
     home; 6 = visibility-toggle polish).
4. **#4 Главная пациента** — editor already exists at `/app/doctor/patient-home`
   (👁 visibility, 🔒 locked blocks, ⚙ item picker, home-param panels). Mostly
   surface it under Контент per IA; confirm 🔒 on «Мой план» + «Запись на приём».
5. **Deferred:** #5 Настройки, #6 Система (parallel-chat overlap), #7 Layout
   (touches shared shell).

## Current implementation map (verified 2026-06-14)
### Analytics (4 subpages today)
- `…/app/doctor/analytics/clients/page.tsx` (+ `DoctorAnalyticsClientsPageClient`):
  `loadDoctorAnalyticsAudience`, `doctorClientsPort.getClientContactBreakdown`,
  `GET /api/doctor/analytics-metric-accounts`,
  `GET /api/admin/doctor-analytics-appointments`. Components:
  `AnalyticsPeriodToolbar`, `AdminPlatformSubscriberStatsClient`,
  `AdminPlatformRegistrationStatsClient`, `DoctorAnalyticsAppointmentsSection`,
  `ClientContactPieChart`, `DoctorStatCard`, `MetricAccountsDialog`.
- `…/app/doctor/material-ratings/page.tsx` (+ `MaterialContentStatsClient`):
  `GET /api/doctor/material-ratings/{summary,aggregate}`. Detail at
  `material-ratings/[kind]/[id]`. → **Контент** tab.
- `…/app/doctor/analytics/notifications/page.tsx` (+ `NotificationsAnalyticsClient`):
  `GET /api/doctor/content-stats`. Components in `analytics/shared/`:
  `PeopleWithNotificationsCard`, `PushOpensAnalyticsCard`,
  `ReminderSendsHourlyClockChart`. → **Уведомления** tab.
- `…/app/doctor/usage/page.tsx` (+ `ProductAnalyticsSection`):
  `GET /api/admin/product-analytics`. → **Приложение** tab.
- Shared: `DOCTOR_ANALYTICS_WINDOW_HOUR_PRESETS`
  (`analytics/shared/analyticsWindowHourPresets.ts`).

### Content
- `…/app/doctor/content/page.tsx` — already sidebar + right panel
  (`ContentPagesSidebar`, switches on `?section=`/`?systemParentCode=`).
- Material = "content page"; editor `…/content/edit/[id]` (`ContentForm`,
  `MarkdownEditor`, `ContentLifecycleDropdown`).
- 👁/visibility pattern: `PatientHomeBlockSettingsCard`
  (`togglePatientHomeBlockVisibility`); page-level `requiresAuth` toggle in
  `ContentPagesSectionList`.

### Patient-home
- `…/app/doctor/patient-home/page.tsx`; `patient_home_blocks` via
  `patientHomeBlocks` port / `pgPatientHomeBlocks` repo. 11 block codes incl.
  `plan`, `booking` (candidates for 🔒). Params in `system_settings`.

### Routing / redirects
- `routePaths` at `app-layer/routes/paths.ts`. Redirects via `src/proxy.ts` →
  `middleware/doctorRouteRedirects.ts` (`legacyRedirects` 308s). No Next middleware.

## Backend data gaps (analytics) — confirmed MISSING, do not fabricate
`product_analytics` events tracked: `app_open | page_view | push_open | heartbeat |
push_sent`. NOT tracked: slot-view, slot-select, "left without booking", "no slots
available" (booking funnel); broadcast read-receipts (`broadcast_audit` has
sent/error counts, no `opened_count`; `broadcast_audit_recipients` has no `read_at`).
"client vs potential" segmentation only partial (contact-channel + appGuests; no
"viewed booking, never booked" concept). → Funnel + read-receipt blocks render as
"данные пока не собираются"; client/potential definition is an open product item.

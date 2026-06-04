# AUDIT — Doctor UI baseline (фаза 0)

Дата: **2026-06-04**. Источник правды по целевому UI: [`DOCTOR_APP_UI_STYLE_GUIDE.md`](../../ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md).

Page-level константы — `apps/webapp/src/shared/ui/doctorVisual.ts` (фаза 1, 2026-06-04). Entity-card chrome и overview-сетка — `clients/doctorClientCardChrome.ts` (без дубля в `doctorVisual`).

**Фаза 1 на «Сегодня»:** `DoctorTodayDashboard` и секции proactive / pending-tests / global-tasks используют wrappers; phase-2 high-impact по `/app/doctor`, `appointments`, `analytics/clients`, `online-intake` закрыт (см. статус `completed` ниже).

## Сводка `rg` (doctor `*.tsx`)

| Сигнал | Файлов / заметка |
|--------|------------------|
| `rounded-2xl` | 13 файлов (appointments, analytics, subscribers, broadcasts, calendar panel, часть client admin panels) |
| `rounded-lg … p-4 shadow-sm` (page section) | 12+ вхождений (CMS forms, courses, exercises edit, online-intake cards, material-ratings) |
| Голый `<h2>` без className | 13 вхождений: appointments (2), analytics/clients + chart blocks (4), client panels (3), SubscriberProfileCard (4) |
| `rounded-xl … p-3` (канон секции) | Today dashboard, exercises catalog, часть references |
| `DoctorCatalogFiltersToolbar` / split catalog | 6 page clients (exercises, recommendations, lfk-templates, treatment-program-templates, test-sets, clinical-tests) + courses list partial |
| `doctorClientCardChrome` / overview primary | 14 client tab/panel files |

**Маршрутов `page.tsx`:** 78.

**Severity:** `high` — bare h2, page `rounded-2xl`, page `shadow-sm` на списках, смешение KPI/list; `medium` — дубли chrome, inline-detail vs Dialog, empty states; `low` — parity / косметика.

---

## 1. High-impact (фаза 2)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor` · `DoctorTodayDashboard.tsx` | dashboard | KPI `DoctorStatCard` рядом с compact list rows — плотность смешана | §4.1 sections + §6 KPI grid | medium | 2 | completed |
| `/app/doctor` · `DoctorTodayProactiveInsightsSection.tsx` | dashboard section | foundation (phase 1); visual checklist | `DoctorSection` + §18 empty/CTA | low | 2 | completed |
| `/app/doctor` · `DoctorGlobalTasksSection.tsx` | dashboard section | foundation (phase 1); visual checklist | `DoctorSection` parity | low | 2 | completed |
| `/app/doctor/appointments` | page-section list | `rounded-2xl`, bare `<h2>` (2) | §4.1 + `doctorSectionTitleClass` | high | 2 | completed |
| `/app/doctor/analytics/clients` | analytics | `rounded-2xl` sections, bare `<h2>` | §4.1 + §6 + styled h2 | high | 2 | completed |
| `AdminPlatformRegistrationStatsClient.tsx` | analytics block | bare `<h2>`, `rounded-2xl` | styled h2 + section card | high | 2 | completed |
| `AdminPlatformSubscriberStatsClient.tsx` | analytics block | bare `<h2>`, `rounded-2xl` | styled h2 + section card | high | 2 | completed |
| `/app/doctor/online-intake` · `DoctorOnlineIntakeClient.tsx` | list + inline detail | `rounded-lg p-4 shadow-sm` cards, expand inline vs Dialog elsewhere | §5.1 list rows; detail — Dialog или единый panel shell | high | 2 | completed |
| `/app/doctor/online-intake/[requestId]` | entity detail | не сверен визуально с list parent | согласовать с online-intake каноном | medium | 2 | completed |
| `/app/doctor/stats` | redirect | `redirect` → analytics | — | low | — | **n/a** |

---

## 2. Client card — shell (фаза 3A)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/clients` · `DoctorClientsPanel.tsx` | compact list | ad-hoc list row classes | §5f + `doctorListItemOuterClass` | medium | 3A | completed |
| `/app/doctor/clients/[userId]` · `ClientProfileCard.tsx` | entity-card shell | inline shell classes | `doctorClientCardChrome` §9 | medium | 3A | completed |
| `PatientCareBar.tsx`, `PatientActionStrip.tsx` | entity-card shell | strip `bg-muted/25`, empty placeholder | §9a/§9b chrome | medium | 3A | completed |
| Client tabs chrome | tabs | inline tab classes | §9c chrome constants | medium | 3A | completed |

---

## 3. Client card — вкладки и панели (фаза 3B)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `DoctorClientOverviewTab.tsx` + overview blocks | tab panels | notes double chrome | §9 overview + `embedded` panels | low | 3B | completed |
| `DoctorClientProgramTab.tsx`, `DoctorClientActiveProgramPanel.tsx` | tab panels | urgent `gap-6` | chrome + `gap-3` | medium | 3B | completed |
| `DoctorClientRecordsTab.tsx` | tab panels | booking nested card | `embedded` booking panel | low | 3B | completed |
| `PatientSpecialistTasksSection.tsx` | tab section | task row ad-hoc | `getDoctorSectionItemClass` | low | 3B | completed |
| `ClientBookingHistoryPanel.tsx` | panel | `rounded-2xl`, bare h2 | primary/embedded chrome | high | 3B | completed |
| `DoctorNotesPanel.tsx`, `SubscriberBlockPanel.tsx` | panel | `rounded-2xl`, bare h2 | primary + `doctorClientSectionTitleClass` | high | 3B | completed |
| `DoctorClientLifecycleActions.tsx`, `AdminDangerActions.tsx` | admin panels | `rounded-2xl` | `doctorClientOverviewPrimaryCardClass` | medium | 3B | completed |
| `AdminClientProfileEditPanel.tsx`, `AdminMergeAccountsPanel.tsx`, `AdminClientAuditHistorySection.tsx` | admin panels | `text-base` h2 | `doctorClientSectionTitleClass` | medium | 3B | completed |
| `/app/doctor/clients/[userId]/treatment-programs/[instanceId]` · `TreatmentProgramInstanceDetailClient.tsx` | program editor | ad-hoc section shells | primary card + §12 toolbar unchanged | medium | 3B | completed |
| `/app/doctor/clients/name-match-hints` · `NameMatchHintsClient.tsx` | ops list | `text-base` h2 | `doctorClientSectionTitleClass` | medium | 3B | completed |

---

## 4. Catalogs (фаза 4A)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/exercises` · `ExercisesPageClient.tsx` | catalog split | эталон + shared row/empty classes | §8 | low | 4A | completed |
| `/app/doctor/recommendations` | catalog split | list rows → `doctorCatalogRow*` | §8 parity | low | 4A | completed |
| `/app/doctor/lfk-templates` | catalog split | empty state constant | §8 | low | 4A | completed |
| `/app/doctor/treatment-program-templates` | catalog split | empty state constant | §8 | low | 4A | completed |
| `/app/doctor/test-sets` | catalog split | empty state constant | §8 | low | 4A | completed |
| `/app/doctor/clinical-tests` | catalog split | list rows → `doctorCatalogRow*` | §8 | low | 4A | completed |
| `/app/doctor/courses` · `courses/page.tsx` | list | ad-hoc section | `doctorSectionCardClass` + toolbar | medium | 4A | completed |
| `/app/doctor/exercises/new`, `exercises/[id]` | form page | ad-hoc wrapper | `doctorCatalogEditorSectionClass` | medium | 4A | completed |
| `/app/doctor/recommendations/new`, `[id]` | form page | inline form in AppShell (OK) | §8 split primary | medium | 4A | completed |
| `/app/doctor/lfk-templates/new`, `[id]` | form page | ad-hoc wrapper | `doctorCatalogEditorSectionClass` | medium | 4A | completed |
| `/app/doctor/treatment-program-templates/new`, `[id]` · constructor | form/editor | §12 constructor chrome отдельно | split catalog done; constructor §12 unchanged | medium | 4A | completed |
| `/app/doctor/test-sets/new`, `[id]` | form page | inline form in AppShell (OK) | §8 split primary | medium | 4A | completed |
| `/app/doctor/clinical-tests/new`, `[id]` | form page | inline form in AppShell (OK) | §8 split primary | medium | 4A | completed |
| `/app/doctor/courses/new`, `[id]` | form page | ad-hoc wrapper | `doctorCatalogEditorSectionClass` | medium | 4A | completed |
| `/app/doctor/exercises/auto-create` · `AutoCreateExercisesClient.tsx` | wizard | local sections | `doctorSectionCardClass` | medium | 4A | completed |
| `lfk-templates/LfkTemplatePreviewPanel.tsx` | preview panel | `text-lg` h2 | `doctorSectionTitleClass` | low | 4A | completed |

---

## 5. CMS и media (фаза 4B)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/content` | CMS hub | sidebar + `text-lg` h2 | §10 CMS | medium | 4B | completed |
| `/app/doctor/content/new`, `content/edit/[id]` | CMS form | `rounded-lg p-4 shadow-sm` | §10 form section | medium | 4B | completed |
| `/app/doctor/content/sections`, `sections/new`, `sections/edit/[slug]` | CMS | section shells | §10 | medium | 4B | completed |
| `/app/doctor/content/library` · `MediaLibraryClient.tsx` | media grid | Dialog-heavy; grid cards | §11 | medium | 4B | completed |
| `/app/doctor/content/library/delete-errors` | ops | page h2 | §10/§11 | low | 4B | completed |
| `/app/doctor/content/news`, `content/motivation` | CMS lists | не сверены | §10 | medium | 4B | completed |
| `content/library/MediaCard.tsx` | tile | partial `rounded-xl` | §11 tile | low | 4B | completed |

---

## 6. Tail routes — comms, ops, misc (фаза 4B)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/messages` · `DoctorSupportInbox.tsx` | inbox | `text-lg` h2, layout не AppShell inner sections | §5 inbox | medium | 4B | completed |
| `/app/doctor/broadcasts` | form + journal | `rounded-2xl`, `text-base` h2 | §4.1 + Dialog confirm | high | 4B | completed |
| `/app/doctor/broadcasts/archive` | list | не сверен | §5 list | medium | 4B | completed |
| `/app/doctor/calendar` · `DoctorBookingCalendarClient.tsx` | calendar | container only on page | §7 calendar | medium | 4B | completed |
| `DoctorCalendarEventPanel.tsx` | side panel | `rounded-2xl`, small h2 OK | §7 panel | medium | 4B | completed |
| `/app/doctor/subscribers` · `SubscriberProfileCard.tsx` | entity card | 4× bare `<h2>`, `rounded-2xl` | §9 entity card | high | 4B | completed |
| `/app/doctor/subscribers/[userId]` | entity card | inherits card | §9 | high | 4B | completed |
| `/app/doctor/references`, `references/[categoryCode]`, `measure-kinds` | reference tables | tables + dialogs | §5 table | medium | 4B | completed |
| `/app/doctor/material-ratings` | stats list | `rounded-lg shadow-sm` per kind | §4.1 sections | medium | 4B | completed |
| `/app/doctor/material-ratings/[kind]/[id]` | detail | panel h2 | styled h2 | low | 4B | completed |
| `/app/doctor/treatment-program-promo` | promo admin | local h2/sections | §4.1 | medium | 4B | completed |
| `/app/doctor/patient-home` · mood icons panel | admin content | `rounded-2xl` | §10 admin | medium | 4B | completed |
| `/app/doctor/analytics/notifications` | analytics | shared `ReminderStatsSection` — вне doctor tree частично | parity with settings | low | 4B | completed |
| `/app/doctor/system-health` | ops dashboard | admin health UI | §4 ops | low | 4B | completed |
| `/app/doctor/audit-log` | ops list | table density | §5 | low | 4B | completed |
| `/app/doctor/health-archive` | ops | not audited visually | §5 | low | 4B | completed |
| `/app/doctor/booking-merge` | ops | booking ops | align booking initiative | medium | 4B | cancelled |
| `/app/doctor/usage` | ops stats | not audited | §4 | low | 4B | completed |
| `/app/doctor/admin/app-settings`, `admin/auth`, `admin/integrations`, `admin/technical` | admin settings | forms outside doctor visual canon | §10 admin forms | medium | 4B | cancelled |

---

## 7. Admin booking (фаза 4B — согласование с BOOKING_REWORK)

**`cancelled` в 4B:** IA и экраны записи ведёт [`BOOKING_REWORK_INITIATIVE`](../../BOOKING_REWORK_INITIATIVE/ROADMAP.md) (Stage 1+). В doctor-unification — только фиксация: в `admin/booking/**` нет `rounded-2xl`; визуальный проход отложен до booking rework.

| Route | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/admin/booking` | hub | IA/booking rework | §4 + booking ROADMAP | medium | 4B | cancelled |
| `admin/booking/catalog`, `services`, `schedule`, `availability` | booking admin | forms/tables | booking + §4.1 | medium | 4B | cancelled |
| `admin/booking/locations`, `memberships`, `payments`, `rules` | booking admin | same | same | medium | 4B | cancelled |
| `admin/booking/form`, `public`, `operations` | booking admin | same | same | medium | 4B | cancelled |
| `admin/booking/integrations` | booking admin | Rubitime section UX (catalog fix plan) | §4 + integrator UI | medium | 4B | cancelled |

---

## 8. Все `page.tsx` (полный индекс 78/78)

Статус по умолчанию **pending**; completed-строки отражают уже закрытые фазы. Детали и приоритеты — в таблицах выше.

| Маршрут | Фаза | Status |
|---------|------|--------|
| `/app/doctor/admin/app-settings` | 4B | cancelled |
| `/app/doctor/admin/auth` | 4B | cancelled |
| `/app/doctor/admin/booking/availability` | 4B | cancelled |
| `/app/doctor/admin/booking/catalog` | 4B | cancelled |
| `/app/doctor/admin/booking/form` | 4B | cancelled |
| `/app/doctor/admin/booking/integrations` | 4B | cancelled |
| `/app/doctor/admin/booking/locations` | 4B | cancelled |
| `/app/doctor/admin/booking/memberships` | 4B | cancelled |
| `/app/doctor/admin/booking/operations` | 4B | cancelled |
| `/app/doctor/admin/booking` | 4B | cancelled |
| `/app/doctor/admin/booking/payments` | 4B | cancelled |
| `/app/doctor/admin/booking/public` | 4B | cancelled |
| `/app/doctor/admin/booking/rules` | 4B | cancelled |
| `/app/doctor/admin/booking/schedule` | 4B | cancelled |
| `/app/doctor/admin/booking/services` | 4B | cancelled |
| `/app/doctor/admin/integrations` | 4B | cancelled |
| `/app/doctor/admin/technical` | 4B | cancelled |
| `/app/doctor/analytics/clients` | 2 | completed |
| `/app/doctor/analytics/notifications` | 4B | completed |
| `/app/doctor/appointments` | 2 | completed |
| `/app/doctor/audit-log` | 4B | completed |
| `/app/doctor/booking-merge` | 4B | cancelled |
| `/app/doctor/broadcasts/archive` | 4B | completed |
| `/app/doctor/broadcasts` | 4B | completed |
| `/app/doctor/calendar` | 4B | completed |
| `/app/doctor/clients/[userId]` | 3A | completed |
| `/app/doctor/clients/[userId]/treatment-programs/[instanceId]` | 3B | completed |
| `/app/doctor/clients/name-match-hints` | 3B | completed |
| `/app/doctor/clients` | 3A | completed |
| `/app/doctor/clinical-tests/[id]` | 4A | completed |
| `/app/doctor/clinical-tests/new` | 4A | completed |
| `/app/doctor/clinical-tests` | 4A | completed |
| `/app/doctor/content/edit/[id]` | 4B | completed |
| `/app/doctor/content/library/delete-errors` | 4B | completed |
| `/app/doctor/content/library` | 4B | completed |
| `/app/doctor/content/motivation` | 4B | completed |
| `/app/doctor/content/new` | 4B | completed |
| `/app/doctor/content/news` | 4B | completed |
| `/app/doctor/content` | 4B | completed |
| `/app/doctor/content/sections/edit/[slug]` | 4B | completed |
| `/app/doctor/content/sections/new` | 4B | completed |
| `/app/doctor/content/sections` | 4B | completed |
| `/app/doctor/courses/[id]` | 4A | completed |
| `/app/doctor/courses/new` | 4A | completed |
| `/app/doctor/courses` | 4A | completed |
| `/app/doctor/exercises/[id]` | 4A | completed |
| `/app/doctor/exercises/auto-create` | 4A | completed |
| `/app/doctor/exercises/new` | 4A | completed |
| `/app/doctor/exercises` | 4A | completed |
| `/app/doctor/health-archive` | 4B | completed |
| `/app/doctor/lfk-templates/[id]` | 4A | completed |
| `/app/doctor/lfk-templates/new` | 4A | completed |
| `/app/doctor/lfk-templates` | 4A | completed |
| `/app/doctor/material-ratings/[kind]/[id]` | 4B | completed |
| `/app/doctor/material-ratings` | 4B | completed |
| `/app/doctor/messages` | 4B | completed |
| `/app/doctor/online-intake/[requestId]` | 2 | completed |
| `/app/doctor/online-intake` | 2 | completed |
| `/app/doctor` | 2 | completed |
| `/app/doctor/patient-home` | 4B | completed |
| `/app/doctor/recommendations/[id]` | 4A | completed |
| `/app/doctor/recommendations/new` | 4A | completed |
| `/app/doctor/recommendations` | 4A | completed |
| `/app/doctor/references/[categoryCode]` | 4B | completed |
| `/app/doctor/references/measure-kinds` | 4B | completed |
| `/app/doctor/references` | 4B | completed |
| `/app/doctor/stats` | n/a (redirect) | n/a |
| `/app/doctor/subscribers/[userId]` | 4B | completed |
| `/app/doctor/subscribers` | 4B | completed |
| `/app/doctor/system-health` | 4B | completed |
| `/app/doctor/test-sets/[id]` | 4A | completed |
| `/app/doctor/test-sets/new` | 4A | completed |
| `/app/doctor/test-sets` | 4A | completed |
| `/app/doctor/treatment-program-promo` | 4B | completed |
| `/app/doctor/treatment-program-templates/[id]` | 4A | completed |
| `/app/doctor/treatment-program-templates/new` | 4A | completed |
| `/app/doctor/treatment-program-templates` | 4A | completed |
| `/app/doctor/usage` | 4B | completed |

Покрытие индекса проверено скриптом: `78 page.tsx` в дереве `doctor` и `78/78` строк в этом реестре.

---

## 9. Инвентарь non-page компонентов (coverage для фазы 0)

| Группа | Объём | Что проверили | Куда идёт |
|--------|-------|---------------|-----------|
| `*Panel.tsx` | 18 файлов | client/admin panels, calendar event panel, mood icons, feedback panel | 3B / 4B |
| `*Client.tsx` | 27 файлов | high-impact clients, catalog clients, booking/admin clients, content clients | 2 / 4A / 4B |
| `*Dialog.tsx` | 10 файлов | treatment program dialogs, specialist task, content section dialogs | 3B / 4B |

Ключевые high-severity non-page расхождения уже зафиксированы выше: `ClientBookingHistoryPanel.tsx`, `DoctorNotesPanel.tsx`, `SubscriberBlockPanel.tsx`, `SubscriberProfileCard.tsx`, `DoctorCalendarEventPanel.tsx`.

---

## 10. Manual visual checklist (шаблон для фаз 2–5)

Заполнять в [`LOG.md`](LOG.md) после каждой фазы.

| Экран | Desktop OK | Mobile OK | Примечание |
|-------|------------|-----------|------------|
| `/app/doctor` | | | |
| `/app/doctor/appointments` | | | |
| `/app/doctor/analytics/clients` | | | |
| `/app/doctor/online-intake` | | | |
| `/app/doctor/clients/[sample]` | | | |
| `/app/doctor/exercises` | | | |
| `/app/doctor/content/library` | | | |

---

## 11. Cancelled / вне scope

| Item | Reason |
|------|--------|
| Patient UI (`/app/patient/**`) | Отдельный гайд `PATIENT_APP_UI_STYLE_GUIDE` |
| Изменение API, БД, маршрутов, auth | Запрет в плане |
| Откат UI density | Закрыто в APP_RESTRUCTURE density audit |

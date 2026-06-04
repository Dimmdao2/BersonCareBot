# AUDIT — Doctor UI baseline (фаза 0)

Дата: **2026-06-04**. Источник правды по целевому UI: [`DOCTOR_APP_UI_STYLE_GUIDE.md`](../../ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md).

Page-level константы — `apps/webapp/src/shared/ui/doctorVisual.ts` (фаза 1, 2026-06-04). Entity-card chrome и overview-сетка — `clients/doctorClientCardChrome.ts` (без дубля в `doctorVisual`).

**Фаза 1 на «Сегодня»:** `DoctorTodayDashboard` и секции proactive / pending-tests / global-tasks используют wrappers; строки ниже для `/app/doctor` закрываются в **фазе 2** (visual checklist, плотность KPI/list).

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
| `/app/doctor` · `DoctorTodayDashboard.tsx` | dashboard | KPI `DoctorStatCard` рядом с compact list rows — плотность смешана | §4.1 sections + §6 KPI grid | medium | 2 | pending |
| `/app/doctor` · `DoctorTodayProactiveInsightsSection.tsx` | dashboard section | foundation (phase 1); visual checklist | `DoctorSection` + §18 empty/CTA | low | 2 | pending |
| `/app/doctor` · `DoctorGlobalTasksSection.tsx` | dashboard section | foundation (phase 1); visual checklist | `DoctorSection` parity | low | 2 | pending |
| `/app/doctor/appointments` | page-section list | `rounded-2xl`, bare `<h2>` (2) | §4.1 + `doctorSectionTitleClass` | high | 2 | pending |
| `/app/doctor/analytics/clients` | analytics | `rounded-2xl` sections, bare `<h2>` | §4.1 + §6 + styled h2 | high | 2 | pending |
| `AdminPlatformRegistrationStatsClient.tsx` | analytics block | bare `<h2>`, `rounded-2xl` | styled h2 + section card | high | 2 | pending |
| `AdminPlatformSubscriberStatsClient.tsx` | analytics block | bare `<h2>`, `rounded-2xl` | styled h2 + section card | high | 2 | pending |
| `/app/doctor/online-intake` · `DoctorOnlineIntakeClient.tsx` | list + inline detail | `rounded-lg p-4 shadow-sm` cards, expand inline vs Dialog elsewhere | §5.1 list rows; detail — Dialog или единый panel shell | high | 2 | pending |
| `/app/doctor/online-intake/[requestId]` | entity detail | не сверен визуально с list parent | согласовать с online-intake каноном | medium | 2 | pending |
| `/app/doctor/stats` | redirect | `redirect` → analytics | — | low | — | **n/a** |

---

## 2. Client card — shell (фаза 3A)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/clients` · `DoctorClientsPanel.tsx` | compact list | фильтры/список — сверить с §5.3 | compact list + toolbar | medium | 3A | pending |
| `/app/doctor/clients/[userId]` · `ClientProfileCard.tsx` | entity-card shell | chrome tabs/strip — сверить с §9 | `doctorClientCardChrome` | medium | 3A | pending |
| `PatientCareBar.tsx`, `PatientActionStrip.tsx` | entity-card shell | ad-hoc spacing/buttons | §9 action strip | medium | 3A | pending |
| Client tabs chrome | tabs | разные отступы/границы вкладок | §9 tabs | medium | 3A | pending |

---

## 3. Client card — вкладки и панели (фаза 3B)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `DoctorClientOverviewTab.tsx` + overview blocks | tab panels | часть на `doctorClientOverviewPrimaryCardClass` | §9.2 overview | low | 3B | pending |
| `DoctorClientProgramTab.tsx`, `DoctorClientActiveProgramPanel.tsx` | tab panels | program panels mix | §9 program | medium | 3B | pending |
| `DoctorClientRecordsTab.tsx` | tab panels | `doctorClientSectionTitleClass` on h2 — OK pattern | parity | low | 3B | pending |
| `PatientSpecialistTasksSection.tsx` | tab section | uses chrome title class | parity | low | 3B | pending |
| `ClientBookingHistoryPanel.tsx` | panel | `rounded-2xl`, bare `<h2 id=…>` | inner panel §9.3 + styled h2 | high | 3B | pending |
| `DoctorNotesPanel.tsx`, `SubscriberBlockPanel.tsx` | panel | `rounded-2xl`, bare/simple h2 | inner panel + styled h2 | high | 3B | pending |
| `DoctorClientLifecycleActions.tsx`, `AdminDangerActions.tsx` | admin panels | `rounded-2xl` | inner destructive panel | medium | 3B | pending |
| `AdminClientProfileEditPanel.tsx`, `AdminMergeAccountsPanel.tsx`, `AdminClientAuditHistorySection.tsx` | admin panels | `text-base` h2 vs `text-sm` canon | `doctorClientSectionTitleClass` | medium | 3B | pending |
| `/app/doctor/clients/[userId]/treatment-programs/[instanceId]` · `TreatmentProgramInstanceDetailClient.tsx` | program editor | many Dialogs; toolbar — отдельный §12 | §12 constructor | medium | 3B | pending |
| `/app/doctor/clients/name-match-hints` · `NameMatchHintsClient.tsx` | ops list | `text-base` h2 | styled section h2 | medium | 3B | pending |

---

## 4. Catalogs (фаза 4A)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/exercises` · `ExercisesPageClient.tsx` | catalog split | **эталон** | §8 | low | 4A | pending |
| `/app/doctor/recommendations` | catalog split | toolbar primary class OK | §8 parity | low | 4A | pending |
| `/app/doctor/lfk-templates` | catalog split | parity | §8 | low | 4A | pending |
| `/app/doctor/treatment-program-templates` | catalog split | parity | §8 | low | 4A | pending |
| `/app/doctor/test-sets` | catalog split | parity | §8 | low | 4A | pending |
| `/app/doctor/clinical-tests` | catalog split | parity | §8 | low | 4A | pending |
| `/app/doctor/courses` · `courses/page.tsx` | list | `rounded-lg p-4 shadow-sm` section, not full split toolbar | §8 or list §5 | medium | 4A | pending |
| `/app/doctor/exercises/new`, `exercises/[id]` | form page | `rounded-lg p-4 shadow-sm` wrapper | §8 editor shell | medium | 4A | pending |
| `/app/doctor/recommendations/new`, `[id]` | form page | same | §8 editor | medium | 4A | pending |
| `/app/doctor/lfk-templates/new`, `[id]` | form page | same | §8 editor | medium | 4A | pending |
| `/app/doctor/treatment-program-templates/new`, `[id]` · constructor | form/editor | large custom chrome, many h2 `text-sm` | §12 + §8 | medium | 4A | pending |
| `/app/doctor/test-sets/new`, `[id]` | form page | form sections | §8 editor | medium | 4A | pending |
| `/app/doctor/clinical-tests/new`, `[id]` | form page | form sections | §8 editor | medium | 4A | pending |
| `/app/doctor/courses/new`, `[id]` | form page | `shadow-sm` sections | §8 editor | medium | 4A | pending |
| `/app/doctor/exercises/auto-create` · `AutoCreateExercisesClient.tsx` | wizard | mix `rounded-xl` / local h2 | §8 + section constants | medium | 4A | pending |
| `lfk-templates/LfkTemplatePreviewPanel.tsx` | preview panel | `text-lg` title h2 | catalog preview §8 | low | 4A | pending |

---

## 5. CMS и media (фаза 4B)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/content` | CMS hub | sidebar + `text-lg` h2 | §10 CMS | medium | 4B | pending |
| `/app/doctor/content/new`, `content/edit/[id]` | CMS form | `rounded-lg p-4 shadow-sm` | §10 form section | medium | 4B | pending |
| `/app/doctor/content/sections`, `sections/new`, `sections/edit/[slug]` | CMS | section shells | §10 | medium | 4B | pending |
| `/app/doctor/content/library` · `MediaLibraryClient.tsx` | media grid | Dialog-heavy; grid cards | §11 | medium | 4B | pending |
| `/app/doctor/content/library/delete-errors` | ops | page h2 | §10/§11 | low | 4B | pending |
| `/app/doctor/content/news`, `content/motivation` | CMS lists | не сверены | §10 | medium | 4B | pending |
| `content/library/MediaCard.tsx` | tile | partial `rounded-xl` | §11 tile | low | 4B | pending |

---

## 6. Tail routes — comms, ops, misc (фаза 4B)

| Route / component | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------------------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/messages` · `DoctorSupportInbox.tsx` | inbox | `text-lg` h2, layout не AppShell inner sections | §5 inbox | medium | 4B | pending |
| `/app/doctor/broadcasts` | form + journal | `rounded-2xl`, `text-base` h2 | §4.1 + Dialog confirm | high | 4B | pending |
| `/app/doctor/broadcasts/archive` | list | не сверен | §5 list | medium | 4B | pending |
| `/app/doctor/calendar` · `DoctorBookingCalendarClient.tsx` | calendar | container only on page | §7 calendar | medium | 4B | pending |
| `DoctorCalendarEventPanel.tsx` | side panel | `rounded-2xl`, small h2 OK | §7 panel | medium | 4B | pending |
| `/app/doctor/subscribers` · `SubscriberProfileCard.tsx` | entity card | 4× bare `<h2>`, `rounded-2xl` | §9 entity card | high | 4B | pending |
| `/app/doctor/subscribers/[userId]` | entity card | inherits card | §9 | high | 4B | pending |
| `/app/doctor/references`, `references/[categoryCode]`, `measure-kinds` | reference tables | tables + dialogs | §5 table | medium | 4B | pending |
| `/app/doctor/material-ratings` | stats list | `rounded-lg shadow-sm` per kind | §4.1 sections | medium | 4B | pending |
| `/app/doctor/material-ratings/[kind]/[id]` | detail | panel h2 | styled h2 | low | 4B | pending |
| `/app/doctor/treatment-program-promo` | promo admin | local h2/sections | §4.1 | medium | 4B | pending |
| `/app/doctor/patient-home` · mood icons panel | admin content | `rounded-2xl` | §10 admin | medium | 4B | pending |
| `/app/doctor/analytics/notifications` | analytics | shared `ReminderStatsSection` — вне doctor tree частично | parity with settings | low | 4B | pending |
| `/app/doctor/system-health` | ops dashboard | admin health UI | §4 ops | low | 4B | pending |
| `/app/doctor/audit-log` | ops list | table density | §5 | low | 4B | pending |
| `/app/doctor/health-archive` | ops | not audited visually | §5 | low | 4B | pending |
| `/app/doctor/booking-merge` | ops | booking ops | align booking initiative | medium | 4B | pending |
| `/app/doctor/usage` | ops stats | not audited | §4 | low | 4B | pending |
| `/app/doctor/admin/app-settings`, `admin/auth`, `admin/integrations`, `admin/technical` | admin settings | forms outside doctor visual canon | §10 admin forms | medium | 4B | pending |

---

## 7. Admin booking (фаза 4B — согласование с BOOKING_REWORK)

Не `cancelled`: UI записи дорабатывается в [`BOOKING_REWORK_INITIATIVE`](../../BOOKING_REWORK_INITIATIVE/ROADMAP.md); здесь — **визуальное выравнивание** под doctor guide без смены booking-логики.

| Route | Type | Current issue | Target pattern | Severity | Phase | Status |
|-------|------|---------------|----------------|----------|-------|--------|
| `/app/doctor/admin/booking` | hub | IA/booking rework | §4 + booking ROADMAP | medium | 4B | pending |
| `admin/booking/catalog`, `services`, `schedule`, `availability` | booking admin | forms/tables | booking + §4.1 | medium | 4B | pending |
| `admin/booking/locations`, `memberships`, `payments`, `rules` | booking admin | same | same | medium | 4B | pending |
| `admin/booking/form`, `public`, `operations` | booking admin | same | same | medium | 4B | pending |
| `admin/booking/integrations` | booking admin | Rubitime section UX (catalog fix plan) | §4 + integrator UI | medium | 4B | pending |

---

## 8. Все `page.tsx` (полный индекс 78/78)

Статус по умолчанию **pending**; детали и приоритеты — в таблицах выше.

| Маршрут | Фаза | Status |
|---------|------|--------|
| `/app/doctor/admin/app-settings` | 4B | pending |
| `/app/doctor/admin/auth` | 4B | pending |
| `/app/doctor/admin/booking/availability` | 4B | pending |
| `/app/doctor/admin/booking/catalog` | 4B | pending |
| `/app/doctor/admin/booking/form` | 4B | pending |
| `/app/doctor/admin/booking/integrations` | 4B | pending |
| `/app/doctor/admin/booking/locations` | 4B | pending |
| `/app/doctor/admin/booking/memberships` | 4B | pending |
| `/app/doctor/admin/booking/operations` | 4B | pending |
| `/app/doctor/admin/booking` | 4B | pending |
| `/app/doctor/admin/booking/payments` | 4B | pending |
| `/app/doctor/admin/booking/public` | 4B | pending |
| `/app/doctor/admin/booking/rules` | 4B | pending |
| `/app/doctor/admin/booking/schedule` | 4B | pending |
| `/app/doctor/admin/booking/services` | 4B | pending |
| `/app/doctor/admin/integrations` | 4B | pending |
| `/app/doctor/admin/technical` | 4B | pending |
| `/app/doctor/analytics/clients` | 2 | pending |
| `/app/doctor/analytics/notifications` | 4B | pending |
| `/app/doctor/appointments` | 2 | pending |
| `/app/doctor/audit-log` | 4B | pending |
| `/app/doctor/booking-merge` | 4B | pending |
| `/app/doctor/broadcasts/archive` | 4B | pending |
| `/app/doctor/broadcasts` | 4B | pending |
| `/app/doctor/calendar` | 4B | pending |
| `/app/doctor/clients/[userId]` | 3A | pending |
| `/app/doctor/clients/[userId]/treatment-programs/[instanceId]` | 3B | pending |
| `/app/doctor/clients/name-match-hints` | 3B | pending |
| `/app/doctor/clients` | 3A | pending |
| `/app/doctor/clinical-tests/[id]` | 4A | pending |
| `/app/doctor/clinical-tests/new` | 4A | pending |
| `/app/doctor/clinical-tests` | 4A | pending |
| `/app/doctor/content/edit/[id]` | 4B | pending |
| `/app/doctor/content/library/delete-errors` | 4B | pending |
| `/app/doctor/content/library` | 4B | pending |
| `/app/doctor/content/motivation` | 4B | pending |
| `/app/doctor/content/new` | 4B | pending |
| `/app/doctor/content/news` | 4B | pending |
| `/app/doctor/content` | 4B | pending |
| `/app/doctor/content/sections/edit/[slug]` | 4B | pending |
| `/app/doctor/content/sections/new` | 4B | pending |
| `/app/doctor/content/sections` | 4B | pending |
| `/app/doctor/courses/[id]` | 4A | pending |
| `/app/doctor/courses/new` | 4A | pending |
| `/app/doctor/courses` | 4A | pending |
| `/app/doctor/exercises/[id]` | 4A | pending |
| `/app/doctor/exercises/auto-create` | 4A | pending |
| `/app/doctor/exercises/new` | 4A | pending |
| `/app/doctor/exercises` | 4A | pending |
| `/app/doctor/health-archive` | 4B | pending |
| `/app/doctor/lfk-templates/[id]` | 4A | pending |
| `/app/doctor/lfk-templates/new` | 4A | pending |
| `/app/doctor/lfk-templates` | 4A | pending |
| `/app/doctor/material-ratings/[kind]/[id]` | 4B | pending |
| `/app/doctor/material-ratings` | 4B | pending |
| `/app/doctor/messages` | 4B | pending |
| `/app/doctor/online-intake/[requestId]` | 2 | pending |
| `/app/doctor/online-intake` | 2 | pending |
| `/app/doctor` | 2 | pending |
| `/app/doctor/patient-home` | 4B | pending |
| `/app/doctor/recommendations/[id]` | 4A | pending |
| `/app/doctor/recommendations/new` | 4A | pending |
| `/app/doctor/recommendations` | 4A | pending |
| `/app/doctor/references/[categoryCode]` | 4B | pending |
| `/app/doctor/references/measure-kinds` | 4B | pending |
| `/app/doctor/references` | 4B | pending |
| `/app/doctor/stats` | n/a (redirect) | n/a |
| `/app/doctor/subscribers/[userId]` | 4B | pending |
| `/app/doctor/subscribers` | 4B | pending |
| `/app/doctor/system-health` | 4B | pending |
| `/app/doctor/test-sets/[id]` | 4A | pending |
| `/app/doctor/test-sets/new` | 4A | pending |
| `/app/doctor/test-sets` | 4A | pending |
| `/app/doctor/treatment-program-promo` | 4B | pending |
| `/app/doctor/treatment-program-templates/[id]` | 4A | pending |
| `/app/doctor/treatment-program-templates/new` | 4A | pending |
| `/app/doctor/treatment-program-templates` | 4A | pending |
| `/app/doctor/usage` | 4B | pending |

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
